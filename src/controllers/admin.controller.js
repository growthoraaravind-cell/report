import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import Admin from '../models/Admin.js';
import Visitor from '../models/Visitor.js';
import PageView from '../models/PageView.js';
import Submission from '../models/Submission.js';
import DigitalAudit from '../models/DigitalAudit.js';
import Scheme from '../models/Scheme.js';
import RuleSetting from '../models/RuleSetting.js';
import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import FileAsset from '../models/FileAsset.js';
import Lookup from '../models/Lookup.js';
import ContactRequest from '../models/ContactRequest.js';
import xlsx from 'xlsx';
import { signToken } from '../middlewares/auth.js';
import { ok, fail, wrap, paging, escapeRx } from '../utils/apiResponse.js';
import { resolveRange } from '../utils/dateRange.js';
import { toCsv } from '../utils/csv.js';
import { clearCache } from '../utils/cache.js';
import { dashboard } from '../services/analytics.service.js';
import { runEligibility } from '../services/eligibilityEngine.service.js';
import { getRules, getSchemes, getSite } from '../services/rules.service.js';
import { missingSchemeFields, parseSchemeWorkbook } from '../services/schemeImport.service.js';
import { DEFAULT_RULES } from '../config/defaultRules.js';

// ---- generic paginated list with search / filters / date range / CSV export ----
const list = (Model, { search = [], filters = [], dateField = 'createdAt', select, populate, extra, csvCols } = {}) => wrap(async (req, res) => {
  const { page, limit, skip, sort } = paging(req.query), q = {};
  if (req.query.q && search.length) q.$or = search.map((f) => ({ [f]: new RegExp(escapeRx(req.query.q), 'i') }));
  filters.forEach((f) => { if (req.query[f] !== undefined && req.query[f] !== '') q[f] = ['true', 'false'].includes(req.query[f]) ? req.query[f] === 'true' : String(req.query[f]); });
  if (req.query.range) { const { from, to } = resolveRange(req.query); q[dateField] = { $gte: from, $lt: to }; }
  if (extra) Object.assign(q, extra(req.query));
  let cur = Model.find(q).sort(sort); if (select) cur = cur.select(select); if (populate) cur = cur.populate(populate);
  if (req.query.format === 'csv') {
    const rows = await cur.limit(10000).lean(); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${Model.modelName.toLowerCase()}-export.csv"`);
    return res.send(toCsv(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !['__v', 'resultSummary', 'topSchemes'].includes(k)))), csvCols));
  }
  const [rows, total] = await Promise.all([cur.skip(skip).limit(limit).lean(), Model.countDocuments(q)]);
  ok(res, rows, 'OK', { page, limit, total, pages: Math.ceil(total / limit) });
});
const notFound = (res) => fail(res, 404, 'Record not found');
const clearData = () => { clearCache('schemes'); clearCache('rules'); clearCache('lookups'); clearCache('pubstats'); };

// ---- auth ----
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
export const login = wrap(async (req, res) => {
  const a = await Admin.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');
  if (!a || !(await bcrypt.compare(req.body.password, a.passwordHash))) return fail(res, 401, 'Incorrect email or password');
  a.lastLoginAt = new Date(); await a.save();
  const token = signToken(a); res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 864e5 });
  ok(res, { token, admin: { id: a._id, name: a.name, email: a.email, role: a.role } }, 'Welcome back!');
});
export const logout = (_q, res) => { res.clearCookie('token'); ok(res, null, 'Signed out'); };
export const me = (req, res) => ok(res, { id: req.admin._id, name: req.admin.name, email: req.admin.email, role: req.admin.role, lastLoginAt: req.admin.lastLoginAt });
export const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'Use at least 8 characters').max(100) });
export const changePassword = wrap(async (req, res) => {
  const a = await Admin.findById(req.admin._id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.currentPassword, a.passwordHash))) return fail(res, 400, 'Current password is incorrect');
  a.passwordHash = await bcrypt.hash(req.body.newPassword, 12); await a.save(); ok(res, null, 'Password updated');
});

// ---- dashboard ----
export const stats = wrap(async (req, res) => ok(res, await dashboard(req.query)));

// ---- visitors ----
export const listVisitors = list(Visitor, { search: ['visitorId', 'city', 'state', 'referrer'], filters: ['device', 'converted', 'browser', 'referrer'], dateField: 'lastSeen', populate: { path: 'submissionId', select: 'clientName mobile' } });
export const visitorDetail = wrap(async (req, res) => {
  const v = await Visitor.findOne({ visitorId: String(req.params.visitorId) }).populate('submissionId', 'clientName mobile email counts status').lean(); if (!v) return notFound(res);
  const events = await PageView.find({ visitorId: v.visitorId }).sort({ createdAt: 1 }).limit(500).lean();
  const durationMs = events.length > 1 ? events.at(-1).createdAt - events[0].createdAt : 0;
  ok(res, { visitor: v, events, pagesVisited: [...new Set(events.filter((e) => e.type === 'page_view').map((e) => e.path))], durationMs });
});
export const visitorSummary = wrap(async (req, res) => {
  const { from, to } = resolveRange(req.query), m = { lastSeen: { $gte: from, $lt: to } };
  const [visited, entered] = await Promise.all([Visitor.countDocuments(m), Visitor.countDocuments({ ...m, converted: true })]);
  ok(res, { visited, entered, conversionRate: visited ? Math.round((entered / visited) * 1000) / 10 : 0 });
});

// ---- submissions / leads ----
const subCols = ['clientName', 'businessName', 'mobile', 'email', 'entityType', 'businessStage', 'promoterCategory', 'sector', 'state', 'district', 'fundingPurpose', 'udyam', 'dpiit', 'gst', 'iec', 'gem', 'fssai', 'businessAge', 'annualTurnover', 'projectCost', 'website', 'overallReadiness', 'status', 'createdAt'];
export const listSubmissions = list(Submission, { search: ['clientName', 'businessName', 'mobile', 'email'], filters: ['state', 'sector', 'entityType', 'businessStage', 'promoterCategory', 'status', 'fundingPurpose'], select: '-resultSummary -topSchemes', csvCols: subCols });
export const submissionDetail = wrap(async (req, res) => {
  const s = await Submission.findById(req.params.id).populate('documents').populate('assignedTo', 'name email').lean(); if (!s) return notFound(res);
  const [audit, sessions, events] = await Promise.all([DigitalAudit.findOne({ submissionId: s._id }).lean(), ChatSession.find({ submissionId: s._id }).lean(), s.visitorId ? PageView.find({ visitorId: s.visitorId }).sort({ createdAt: 1 }).limit(300).lean() : []]);
  const chats = await Promise.all(sessions.map(async (c) => ({ ...c, messages: await ChatMessage.find({ sessionId: c.sessionId }).sort({ createdAt: 1 }).lean() })));
  ok(res, { submission: s, audit, chats, journey: events, whatsapp: `https://wa.me/91${s.mobile}` });
});
export const updateSubmission = wrap(async (req, res) => {
  const { status, assignedTo, note } = req.body, upd = {};
  if (status) upd.$set = { ...(upd.$set || {}), status: String(status) }; if (assignedTo !== undefined) upd.$set = { ...(upd.$set || {}), assignedTo: assignedTo || null };
  if (note) upd.$push = { notes: { text: String(note).slice(0, 1000), by: req.admin.name } };
  const s = await Submission.findByIdAndUpdate(req.params.id, upd, { new: true, runValidators: true }).select('-resultSummary -topSchemes').lean(); if (!s) return notFound(res); ok(res, s, 'Saved');
});
export const bulkSubmissions = wrap(async (req, res) => {
  const { ids = [], action, status } = req.body; if (!ids.length) return fail(res, 400, 'Select at least one record');
  if (action === 'delete') await Submission.deleteMany({ _id: { $in: ids } }); else await Submission.updateMany({ _id: { $in: ids } }, { status: String(status) });
  ok(res, null, 'Updated');
});

// ---- audits / contacts / chats / files ----
export const listAudits = list(DigitalAudit, { search: ['websiteUrl'], extra: (q) => (q.minScore || q.maxScore ? { websiteScore: { ...(q.minScore && { $gte: +q.minScore }), ...(q.maxScore && { $lte: +q.maxScore }) } } : {}), select: '-website.checklist' });
export const auditDetail = wrap(async (req, res) => { const a = await DigitalAudit.findById(req.params.id).lean(); a ? ok(res, a) : notFound(res); });
export const listContacts = list(ContactRequest, { search: ['name', 'mobile', 'email'], filters: ['status', 'type'] });
export const updateContact = wrap(async (req, res) => { const c = await ContactRequest.findByIdAndUpdate(req.params.id, { status: String(req.body.status) }, { new: true, runValidators: true }).lean(); c ? ok(res, c, 'Saved') : notFound(res); });
export const listChats = list(ChatSession, { search: ['name', 'phone', 'visitorId'], filters: ['handoff'] });
export const chatDetail = wrap(async (req, res) => { const c = await ChatSession.findOne({ sessionId: String(req.params.sessionId) }).lean(); if (!c) return notFound(res); ok(res, { session: c, messages: await ChatMessage.find({ sessionId: c.sessionId }).sort({ createdAt: 1 }).lean() }); });
export const listFiles = list(FileAsset, { search: ['originalName'], filters: ['kind', 'ownerType'], dateField: 'uploadedAt' });
export const deleteFile = wrap(async (req, res) => {
  const f = await FileAsset.findById(req.params.id); if (!f) return notFound(res);
  await fs.unlink(f.path).catch(() => {}); await f.deleteOne(); ok(res, null, 'File deleted');
});

// ---- schemes CRUD/import/export ----
const schemeArrays = ['eligibleEntity', 'sectorFit', 'promoterCategoryFit', 'promoterFit', 'stageFit', 'fundingFit', 'benefits', 'documentsRequired', 'howToApply', 'districts'];
const schemeText = ['schemeId', 'name', 'category', 'ministryAgency', 'ministry', 'targetApplicant', 'stateFilter', 'mustHaveRegn', 'mustHaveReg', 'preferredRegn', 'preferredReg', 'docsNotes', 'notes', 'description', 'officialUrl'];
const schemeInputSchema = z.object({
  schemeId: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(200), category: z.string().trim().max(120).optional(),
  level: z.enum(['Central', 'Central/State', 'State']).optional(),
  ministryAgency: z.string().trim().max(200).optional(), ministry: z.string().trim().max(200).optional(), targetApplicant: z.string().trim().max(500).optional(),
  eligibleEntity: z.array(z.string().trim()).optional(), sectorFit: z.array(z.string().trim()).optional(), promoterCategoryFit: z.array(z.string().trim()).optional(), promoterFit: z.array(z.string().trim()).optional(), stageFit: z.array(z.string().trim()).optional(), fundingFit: z.array(z.string().trim()).optional(),
  stateFilter: z.string().trim().max(100).optional(), mustHaveRegn: z.enum(['None', 'Udyam', 'DPIIT', 'IEC', 'FSSAI', 'GST']).optional(), mustHaveReg: z.string().optional(), preferredRegn: z.enum(['None', 'GST', 'Udyam']).optional(), preferredReg: z.string().optional(),
  minProject: z.coerce.number().min(0).optional(), maxProject: z.coerce.number().min(0).optional(), baseWeight: z.coerce.number().int().min(1).max(10).optional(),
  docsNotes: z.string().max(3000).optional(), notes: z.string().max(3000).optional(), description: z.string().max(5000).optional(), benefits: z.array(z.string().trim()).optional(), officialUrl: z.string().url().optional().or(z.literal('')),
  documentsRequired: z.array(z.string().trim()).optional(), howToApply: z.array(z.string().trim()).optional(), isActive: z.boolean().optional(), isPublished: z.boolean().optional(), isComplete: z.boolean().optional(),
  subsidyPercent: z.coerce.number().min(0).max(100).optional(), minBusinessAge: z.coerce.number().min(0).optional(), maxTurnover: z.coerce.number().min(0).optional(), requiresGeM: z.boolean().optional(), districts: z.array(z.string().trim()).optional(),
});

const normalizeSchemeInput = (raw) => {
  const body = { ...raw };
  schemeText.forEach((key) => { if (body[key] === undefined) delete body[key]; });
  schemeArrays.forEach((key) => { if (body[key] === undefined) delete body[key]; else body[key] = [...new Set((Array.isArray(body[key]) ? body[key] : []).map((value) => String(value).trim()).filter(Boolean))]; });
  if (body.ministryAgency !== undefined) body.ministry = body.ministryAgency;
  else if (body.ministry !== undefined) body.ministryAgency = body.ministry;
  if (body.promoterCategoryFit !== undefined) body.promoterFit = body.promoterCategoryFit;
  else if (body.promoterFit !== undefined) body.promoterCategoryFit = body.promoterFit;
  if (body.mustHaveRegn !== undefined) body.mustHaveReg = body.mustHaveRegn;
  else if (body.mustHaveReg !== undefined) body.mustHaveRegn = body.mustHaveReg;
  if (body.preferredRegn !== undefined) body.preferredReg = body.preferredRegn;
  else if (body.preferredReg !== undefined) body.preferredRegn = body.preferredReg;
  if (body.docsNotes !== undefined) body.notes = body.docsNotes;
  else if (body.notes !== undefined) body.docsNotes = body.notes;
  delete body.isComplete;
  return body;
};

const handleDuplicateScheme = (error, res) => {
  if (error?.code === 11000) { fail(res, 409, 'A scheme with this Scheme ID already exists'); return true; }
  return false;
};
const findScheme = (id) => mongoose.isValidObjectId(id) ? Scheme.findById(id) : Scheme.findOne({ schemeId: String(id).toUpperCase() });

export const listSchemes = wrap(async (req, res) => {
  const { page, limit, skip, sort: defaultSort } = paging(req.query), filter = {};
  if (req.query.q) {
    const q = escapeRx(req.query.q);
    filter.$or = [{ schemeId: new RegExp(q, 'i') }, { name: new RegExp(q, 'i') }, { category: new RegExp(q, 'i') }];
  }
  for (const field of ['category', 'level', 'stateFilter']) if (req.query[field]) filter[field] = String(req.query[field]);
  for (const field of ['isPublished', 'isComplete', 'isActive']) if (req.query[field] !== undefined && req.query[field] !== '') filter[field] = String(req.query[field]) === 'true';
  const allowedSort = new Set(['schemeId', 'name', 'category', 'level', 'stateFilter', 'baseWeight', 'isComplete', 'isPublished', 'createdAt', 'updatedAt']);
  const sortField = String(req.query.sort || 'schemeId').replace(/^-/, '');
  const sort = allowedSort.has(sortField) ? { [sortField]: String(req.query.sort || '').startsWith('-') ? -1 : 1 } : defaultSort;
  const [rows, total] = await Promise.all([Scheme.find(filter).sort(sort).skip(skip).limit(limit).lean(), Scheme.countDocuments(filter)]);
  ok(res, rows, 'OK', { page, limit, total, pages: Math.ceil(total / limit) });
});

export const getScheme = wrap(async (req, res) => { const scheme = await findScheme(req.params.id).lean(); scheme ? ok(res, scheme) : notFound(res); });
export const createScheme = wrap(async (req, res) => {
  const parsed = schemeInputSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Please correct the scheme fields', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  const body = normalizeSchemeInput(parsed.data);
  if (body.isPublished) { const missing = missingSchemeFields(body); if (missing.length) return fail(res, 400, `Cannot publish this scheme. Complete: ${missing.join(', ')}`, { missingFields: missing }); }
  try { const scheme = await Scheme.create(body); clearData(); res.status(201); ok(res, scheme, 'Scheme created'); }
  catch (error) { if (!handleDuplicateScheme(error, res)) throw error; }
});
export const updateScheme = wrap(async (req, res) => {
  const parsed = schemeInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Please correct the scheme fields', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  const scheme = await findScheme(req.params.id);
  if (!scheme) return notFound(res);
  const body = normalizeSchemeInput(parsed.data);
  Object.assign(scheme, body);
  if (scheme.isPublished) { const missing = missingSchemeFields(scheme); if (missing.length) return fail(res, 400, `Cannot publish this scheme. Complete: ${missing.join(', ')}`, { missingFields: missing }); }
  try { await scheme.save(); clearData(); ok(res, scheme, 'Scheme saved'); }
  catch (error) { if (!handleDuplicateScheme(error, res)) throw error; }
});
export const publishScheme = wrap(async (req, res) => {
  const parsed = z.object({ isPublished: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'isPublished must be true or false');
  const scheme = await findScheme(req.params.id);
  if (!scheme) return notFound(res);
  if (parsed.data.isPublished) { const missing = missingSchemeFields(scheme); if (missing.length) return fail(res, 400, `Cannot publish this scheme. Complete: ${missing.join(', ')}`, { missingFields: missing }); }
  scheme.isPublished = parsed.data.isPublished; await scheme.save(); clearData(); ok(res, scheme, parsed.data.isPublished ? 'Scheme published' : 'Scheme unpublished');
});
export const deleteScheme = wrap(async (req, res) => { const scheme = await findScheme(req.params.id); if (!scheme) return notFound(res); await scheme.deleteOne(); clearData(); ok(res, null, 'Scheme deleted'); });

async function saveImportAsset(file, adminId) {
  return FileAsset.create({ url: `/uploads/documents/imports/${path.basename(file.path)}`, path: file.path, originalName: file.originalname, mimeType: file.mimetype, size: file.size, kind: 'misc', ownerType: 'scheme-import', ownerId: adminId });
}
export const previewSchemeImport = wrap(async (req, res) => {
  const file = req.files?.[0]; if (!file) return fail(res, 400, 'Choose an .xlsx workbook to preview');
  const asset = await saveImportAsset(file, req.admin?._id);
  const { rows, errors } = parseSchemeWorkbook(file.path);
  const [created, existing] = await Promise.all([Scheme.countDocuments({ schemeId: { $in: rows.map((row) => row.schemeId) } }).then((count) => rows.length - count), Scheme.find({ schemeId: { $in: rows.map((row) => row.schemeId) } }).select('schemeId').lean()]);
  const existingIds = new Set(existing.map((row) => row.schemeId));
  ok(res, { fileId: asset._id, originalName: asset.originalName, totalRows: rows.length, newRows: created, existingRows: existing.length, completeRows: rows.filter((row) => missingSchemeFields(row).length === 0).length, placeholders: rows.filter((row) => /^scheme\s*\d+$/i.test(row.name)).length, preview: rows.slice(0, 8).map((row) => ({ ...row, alreadyExists: existingIds.has(row.schemeId) })), errors: errors.slice(0, 25) }, 'Workbook preview ready');
});
export const importSchemes = wrap(async (req, res) => {
  let asset = req.files?.[0] ? await saveImportAsset(req.files[0], req.admin?._id) : null;
  if (!asset && req.body.fileId) asset = await FileAsset.findOne({ _id: req.body.fileId, kind: 'misc', ownerType: 'scheme-import' });
  if (!asset || !asset.path || !fsSync.existsSync(asset.path)) return fail(res, 400, 'Upload a workbook or choose a valid previewed workbook');
  const mode = req.body.mode || 'skip';
  if (!['skip', 'update'].includes(mode)) return fail(res, 400, 'Import mode must be skip or update');
  const { rows, errors: parseErrors } = parseSchemeWorkbook(asset.path);
  const errors = [...parseErrors], errorRows = new Set(parseErrors.map((error) => error.row));
  const counts = { created: 0, updated: 0, skipped: 0, failed: parseErrors.length };
  for (let index = 0; index < rows.length; index++) {
    const { __excelRow: rowNumber, ...row } = rows[index];
    if (!row.schemeId || !row.name || errorRows.has(rowNumber)) continue;
    try {
      const existing = await Scheme.findOne({ schemeId: row.schemeId });
      if (existing && mode === 'skip') { counts.skipped++; continue; }
      if (existing) { Object.assign(existing, row); await existing.save(); counts.updated++; }
      else { await Scheme.create(row); counts.created++; }
    } catch (error) {
      counts.failed++;
      errors.push({ row: rowNumber, schemeId: row.schemeId, message: error.code === 11000 ? 'Duplicate Scheme ID' : error.message });
    }
  }
  asset.ownerType = 'scheme-import'; asset.ownerId = req.admin?._id; await asset.save();
  clearData();
  ok(res, { ...counts, errors }, `Import complete: ${counts.created} created, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed`);
});
export const exportSchemes = wrap(async (_req, res) => {
  const rows = await Scheme.find().sort({ schemeId: 1 }).lean();
  const headers = ['Scheme ID', 'Scheme Name', 'Category', 'Level', 'Ministry/Agency', 'Target Applicant', 'Eligible Entity', 'Sector Fit', 'Promoter Category Fit', 'Stage Fit', 'State Filter', 'Must Have Regn', 'Preferred Regn', 'Funding Fit', 'Min Project ₹', 'Max Project ₹', 'Base Weight', 'Docs / Notes'];
  const data = rows.map((scheme) => [scheme.schemeId, scheme.name, scheme.category, scheme.level, scheme.ministryAgency || scheme.ministry, scheme.targetApplicant, (scheme.eligibleEntity || []).join('|'), (scheme.sectorFit || []).join('|'), (scheme.promoterCategoryFit || scheme.promoterFit || []).join('|'), (scheme.stageFit || []).join('|'), scheme.stateFilter, scheme.mustHaveRegn || scheme.mustHaveReg, scheme.preferredRegn || scheme.preferredReg, (scheme.fundingFit || []).join('|'), scheme.minProject, scheme.maxProject, scheme.baseWeight, scheme.docsNotes || scheme.notes]);
  const sheet = xlsx.utils.aoa_to_sheet([headers, ...data]), workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, 'Scheme_Matrix_100');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="growthora-schemes.xlsx"');
  res.send(buffer);
});

// ---- rules ----
export const getRulesCtl = wrap(async (_q, res) => ok(res, await getRules()));
export const putRules = wrap(async (req, res) => {
  const v = { ...DEFAULT_RULES, ...req.body }; if (!(v.thresholds.eligibleNow > v.thresholds.afterAction)) return fail(res, 400, '"Eligible Now" threshold must be higher than "After Action"');
  await RuleSetting.findOneAndUpdate({ key: 'default' }, { value: v }, { upsert: true }); clearData(); ok(res, v, 'Rules saved');
});
export const resetRules = wrap(async (_q, res) => { await RuleSetting.findOneAndUpdate({ key: 'default' }, { value: DEFAULT_RULES }, { upsert: true }); clearData(); ok(res, DEFAULT_RULES, 'Defaults restored'); });
export const simulateRules = wrap(async (req, res) => {
  const { profile, rules } = req.body, all = await Scheme.find({ isActive: true }).lean(), r = runEligibility(profile, all, { ...(await getRules()), ...(rules || {}) });
  ok(res, { counts: r.counts, top15: r.top15, readinessFlags: r.readinessFlags });
});

// ---- lookups & settings ----
export const listLookups = wrap(async (_q, res) => ok(res, await Lookup.find().sort({ key: 1 }).lean()));
export const putLookup = wrap(async (req, res) => {
  const values = [...new Set((req.body.values || []).map((v) => String(v).trim()).filter(Boolean))]; if (!values.length) return fail(res, 400, 'Add at least one value');
  const l = await Lookup.findOneAndUpdate({ key: String(req.params.key) }, { key: String(req.params.key), label: req.body.label || req.params.key, values }, { upsert: true, new: true }); clearData(); ok(res, l, 'Saved');
});
export const getSettings = wrap(async (_q, res) => ok(res, { ...(await getSite()), apiKeys: { pagespeed: !!process.env.PAGESPEED_API_KEY, anthropic: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL) } }));
export const putSettings = wrap(async (req, res) => { const { apiKeys, ...v } = req.body; await RuleSetting.findOneAndUpdate({ key: 'site' }, { value: v }, { upsert: true }); ok(res, v, 'Settings saved'); });

// ---- pre-built reports (CSV / JSON) ----
const REPORTS = { submissions: [Submission, subCols, '-resultSummary -topSchemes'], visitors: [Visitor, null, ''], leads: [Submission, ['clientName', 'mobile', 'email', 'state', 'status', 'overallReadiness', 'createdAt'], '-resultSummary -topSchemes'], audits: [DigitalAudit, ['websiteUrl', 'websiteScore', 'socialScore', 'createdAt'], ''], contacts: [ContactRequest, null, ''] };
export const report = wrap(async (req, res) => {
  const def = REPORTS[req.params.name]; if (!def) return notFound(res);
  const { from, to } = resolveRange(req.query), field = def[0] === Visitor ? 'lastSeen' : 'createdAt';
  const rows = await def[0].find({ [field]: { $gte: from, $lt: to } }).select(def[2]).sort({ [field]: -1 }).limit(10000).lean();
  if (req.query.format === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}-report.csv"`); return res.send(toCsv(rows, def[1] || undefined)); }
  ok(res, rows, 'OK', { total: rows.length, from, to });
});
