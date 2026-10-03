import Scheme from '../models/Scheme.js';
import Lookup from '../models/Lookup.js';
import Submission from '../models/Submission.js';
import ContactRequest from '../models/ContactRequest.js';
import { z } from 'zod';
import { ok, wrap, paging, escapeRx } from '../utils/apiResponse.js';
import { cached } from '../utils/cache.js';
import { getSite } from '../services/rules.service.js';

export const lookups = wrap(async (_q, res) => ok(res, await cached('lookups', 300_000, async () => Object.fromEntries((await Lookup.find().lean()).map((l) => [l.key, l.values])))));
export const siteInfo = wrap(async (_q, res) => ok(res, await getSite()));
export const publicStats = wrap(async (_q, res) => ok(res, await cached('pubstats', 120_000, async () => ({ schemes: await Scheme.countDocuments({ isActive: true, isPublished: true }), businessesHelped: await Submission.countDocuments() }))));
const PUBLIC_FIELDS = 'schemeId name category level ministryAgency ministry targetApplicant eligibleEntity sectorFit promoterCategoryFit stageFit stateFilter mustHaveRegn mustHaveReg preferredRegn preferredReg fundingFit minProject maxProject baseWeight docsNotes notes description benefits subsidyPercent officialUrl documentsRequired howToApply';
export const listSchemes = wrap(async (req, res) => {
  const { page, limit, skip } = paging(req.query), q = { isActive: true, isPublished: true, isComplete: true };
  if (req.query.q) q.$or = [{ name: new RegExp(escapeRx(req.query.q), 'i') }, { category: new RegExp(escapeRx(req.query.q), 'i') }];
  for (const f of ['category', 'level']) if (req.query[f]) q[f] = String(req.query[f]);
  const [rows, total] = await Promise.all([Scheme.find(q).select(PUBLIC_FIELDS).sort({ baseWeight: -1, name: 1 }).skip(skip).limit(limit).lean(), Scheme.countDocuments(q)]);
  ok(res, rows, 'OK', { page, limit, total, pages: Math.ceil(total / limit) });
});
export const getScheme = wrap(async (req, res) => {
  const s = await Scheme.findOne({ schemeId: String(req.params.schemeId), isActive: true, isPublished: true, isComplete: true }).select(PUBLIC_FIELDS).lean();
  if (!s) return res.status(404).json({ success: false, message: 'Scheme not found', data: null });
  ok(res, s);
});
export const contactSchema = z.object({ name: z.string().trim().min(2).max(100), mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'), email: z.string().email().optional().or(z.literal('')), message: z.string().trim().max(1000).optional(), type: z.enum(['callback', 'enquiry']).default('enquiry'), submissionToken: z.string().optional(), visitorId: z.string().max(64).optional() });
export const createContact = wrap(async (req, res) => {
  const { submissionToken, ...b } = req.body, sub = submissionToken ? await Submission.findOne({ shareToken: submissionToken }).select('_id') : null;
  await ContactRequest.create({ ...b, submissionId: sub?._id });
  res.status(201); ok(res, null, 'Thank you! Our team will reach out to you shortly.');
});
