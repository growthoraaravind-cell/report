import { z } from 'zod';
import mongoose from 'mongoose';
import Submission from '../models/Submission.js';
import DigitalAudit from '../models/DigitalAudit.js';
import FileAsset from '../models/FileAsset.js';
import Visitor from '../models/Visitor.js';
import PageView from '../models/PageView.js';
import { runEligibility } from '../services/eligibilityEngine.service.js';
import { auditWebsite } from '../services/websiteAudit.service.js';
import { auditSocial } from '../services/socialAudit.service.js';
import { generateReport } from '../services/report.service.js';
import { getRules, getSchemes } from '../services/rules.service.js';
import { ok, wrap } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

const yn = z.enum(['Yes', 'No']), str = z.string().trim().min(1).max(100), link = z.string().trim().max(300).optional().or(z.literal(''));
export const submissionSchema = z.object({
  clientName: z.string().trim().min(2).max(100), businessName: z.string().trim().max(150).optional(), mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'), email: z.string().email().optional().or(z.literal('')),
  entityType: str, businessStage: str, promoterCategory: str, sector: str, state: str, district: z.string().trim().max(100).optional(), fundingPurpose: str,
  udyam: yn, dpiit: yn, gst: yn, iec: yn, gem: yn, fssai: yn,
  businessAge: z.coerce.number().min(0).max(200), annualTurnover: z.coerce.number().min(0), projectCost: z.coerce.number().min(0),
  documents: z.array(z.string()).max(10).optional(), website: link,
  social: z.object({ instagram: link, facebook: link, linkedin: link, youtube: link, x: link }).optional(), socialSelfReported: z.record(z.any()).optional(),
  visitorId: z.string().max(64).optional(), consent: z.literal(true, { errorMap: () => ({ message: 'Please accept the consent to continue' }) }),
});
export const readiness = (w, { scheme, website, social }) => {
  const parts = [[scheme, w.scheme], [website, w.website], [social, w.social]].filter(([v]) => v !== null && v !== undefined);
  const tw = parts.reduce((a, [, x]) => a + x, 0) || 1; return Math.round(parts.reduce((a, [v, x]) => a + v * x, 0) / tw);
};
export function buildRecommendations(web, soc) {
  const r = [];
  (web?.quickWins || []).forEach((q) => r.push({ area: 'Website', title: q.title, tip: q.tip }));
  Object.entries(soc?.platforms || {}).forEach(([p, v]) => v.valid && v.tips.slice(0, 2).forEach((t) => r.push({ area: p, title: `Grow your ${p} presence`, tip: t })));
  return r;
}
export async function runAudits({ website, social, socialSelfReported }) {
  const [w, s] = await Promise.allSettled([website ? auditWebsite(website) : null, social && Object.values(social).some(Boolean) ? auditSocial(social, socialSelfReported) : null]);
  const web = w.status === 'fulfilled' ? w.value : null, soc = s.status === 'fulfilled' ? s.value : null;
  return { web, soc, webScore: web?.reachable ? web.score : null, socScore: soc?.score ?? null };
}
const compact = (r) => ({ schemeId: r.schemeId, name: r.name, category: r.category, level: r.level, description: r.description, benefits: r.benefits, subsidyPercent: r.subsidyPercent, officialUrl: r.officialUrl, documentsRequired: r.documentsRequired, howToApply: r.howToApply, score: r.score, maxScore: r.maxScore, status: r.status, missingRegistration: r.missingRegistration, actions: r.actions, why: r.why });

export const createSubmission = wrap(async (req, res) => {
  const b = req.body, [schemes, rules] = await Promise.all([getSchemes(), getRules()]);
  const result = runEligibility(b, schemes, rules); // throws 400 on blank/invalid input
  const { web, soc, webScore, socScore } = await runAudits(b);
  const overall = readiness(rules.readinessWeights, { scheme: result.schemeReadiness, website: webScore, social: socScore });
  // "What if" projection: all missing registrations completed
  const sim = runEligibility({ ...b, udyam: 'Yes', dpiit: 'Yes', gst: 'Yes', iec: 'Yes', fssai: 'Yes' }, schemes, rules);
  const potential = { additionalSchemes: Math.max(sim.counts.eligibleNow - result.counts.eligibleNow, 0), readinessAfter: readiness(rules.readinessWeights, { scheme: sim.schemeReadiness, website: webScore, social: socScore }) };
  const docIds = (b.documents || []).filter((id) => mongoose.isValidObjectId(id));
  const sub = await Submission.create({ ...b, documents: docIds, resultSummary: { results: result.results.map(compact), potential }, topSchemes: result.top15.map(compact), counts: result.counts, readinessFlags: result.readinessFlags, overallReadiness: overall });
  if (docIds.length) await FileAsset.updateMany({ _id: { $in: docIds } }, { ownerType: 'submission', ownerId: sub._id });
  if (web || soc) await DigitalAudit.create({ submissionId: sub._id, visitorId: b.visitorId, websiteUrl: b.website, websiteScore: webScore, socialScore: socScore, website: web, social: soc, recommendations: buildRecommendations(web, soc) });
  try {
    const rep = await generateReport(sub, { ...result, schemeReadiness: result.schemeReadiness });
    await FileAsset.create({ url: rep.url, path: rep.path, originalName: rep.originalName, mimeType: 'application/pdf', size: rep.size, kind: 'report', ownerType: 'submission', ownerId: sub._id });
    sub.reportPdfUrl = rep.url; await sub.save();
  } catch (e) { logger.error('PDF failed', e.message); }
  if (b.visitorId) {
    await Visitor.updateOne({ visitorId: b.visitorId }, { converted: true, submissionId: sub._id });
    await PageView.create({ visitorId: b.visitorId, type: 'submission_completed', path: '/check', meta: { submissionId: sub._id } });
  }
  res.status(201);
  ok(res, { submissionId: sub._id, shareToken: sub.shareToken, reportPdfUrl: sub.reportPdfUrl, counts: result.counts, top15: result.top15, readinessFlags: result.readinessFlags, schemeReadiness: result.schemeReadiness, overallReadiness: overall, potential, audit: { website: web, social: soc } }, `Great news, ${b.clientName}! You match with ${result.counts.eligibleNow + result.counts.afterAction} schemes.`);
});
// Shareable result page (by unguessable token). Contact details and internal notes are never returned.
export const getResult = wrap(async (req, res) => {
  const sub = await Submission.findOne({ shareToken: String(req.params.token) }).select('-mobile -email -notes -assignedTo -documents -visitorId').lean();
  if (!sub) return res.status(404).json({ success: false, message: 'We could not find this report', data: null });
  const audit = await DigitalAudit.findOne({ submissionId: sub._id }).lean();
  if (req.headers['x-visitor-id']) PageView.create({ visitorId: String(req.headers['x-visitor-id']), type: 'report_viewed', path: req.originalUrl }).catch(() => {});
  ok(res, { ...sub, audit });
});
