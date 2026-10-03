import { z } from 'zod';
import DigitalAudit from '../models/DigitalAudit.js';
import Submission from '../models/Submission.js';
import { runAudits, buildRecommendations } from './submission.controller.js';
import { getRules } from '../services/rules.service.js';
import { readiness } from './submission.controller.js';
import { ok, wrap } from '../utils/apiResponse.js';
const link = z.string().trim().max(300).optional().or(z.literal(''));
export const auditSchema = z.object({ website: link, social: z.object({ instagram: link, facebook: link, linkedin: link, youtube: link, x: link }).optional(), socialSelfReported: z.record(z.any()).optional(), visitorId: z.string().max(64).optional(), submissionToken: z.string().optional() })
  .refine((v) => v.website || Object.values(v.social || {}).some(Boolean), { message: 'Add your website or at least one social link' });
export const runAudit = wrap(async (req, res) => {
  const b = req.body, sub = b.submissionToken ? await Submission.findOne({ shareToken: b.submissionToken }).select('_id schemeReadiness resultSummary') : null;
  const { web, soc, webScore, socScore } = await runAudits(b), recommendations = buildRecommendations(web, soc);
  const doc = await DigitalAudit.create({ submissionId: sub?._id, visitorId: b.visitorId, websiteUrl: b.website, websiteScore: webScore, socialScore: socScore, website: web, social: soc, recommendations });
  const rules = await getRules();
  res.status(201); ok(res, { auditId: doc._id, website: web, social: soc, recommendations, combinedDigitalScore: readiness({ scheme: 0, website: rules.readinessWeights.website, social: rules.readinessWeights.social }, { scheme: null, website: webScore, social: socScore }) }, 'Your digital presence report is ready');
});
