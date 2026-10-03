// Dashboard aggregations (date-range aware, IST). All counts use indexed date fields.
import Visitor from '../models/Visitor.js';
import PageView from '../models/PageView.js';
import Submission from '../models/Submission.js';
import DigitalAudit from '../models/DigitalAudit.js';
import ContactRequest from '../models/ContactRequest.js';
import ChatSession from '../models/ChatSession.js';
import FileAsset from '../models/FileAsset.js';
import { resolveRange } from '../utils/dateRange.js';

const pct = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : cur ? 100 : 0);
const card = (value, prev) => ({ value, prev, change: pct(value, prev) });
const between = (f, t, key = 'createdAt') => ({ [key]: { $gte: f, $lt: t } });
const TZ = 'Asia/Kolkata';
const group = (M, match, field, limit = 10) => M.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: limit }, { $project: { _id: 0, name: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } }]);

async function windowStats(f, t) {
  const m = between(f, t);
  const [events, uniq, subs, audits, contacts, chats, docs, newV] = await Promise.all([
    PageView.aggregate([{ $match: m }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    PageView.distinct('visitorId', m),
    Submission.aggregate([{ $match: m }, { $group: { _id: null, n: { $sum: 1 }, avgNow: { $avg: '$counts.eligibleNow' } } }]),
    DigitalAudit.aggregate([{ $match: m }, { $group: { _id: null, n: { $sum: 1 }, web: { $avg: '$websiteScore' }, soc: { $avg: '$socialScore' } } }]),
    ContactRequest.countDocuments(m), ChatSession.countDocuments(m), FileAsset.countDocuments({ ...m, kind: 'document' }), Visitor.countDocuments(between(f, t, 'firstSeen')),
  ]);
  const ev = Object.fromEntries(events.map((e) => [e._id, e.n]));
  return { ev, unique: uniq.length, newV, subs: subs[0]?.n || 0, avgNow: Math.round((subs[0]?.avgNow || 0) * 10) / 10, audits: audits[0]?.n || 0, web: Math.round(audits[0]?.web || 0), soc: Math.round(audits[0]?.soc || 0), contacts, chats, docs };
}
export async function dashboard(query) {
  const { from, to, prevFrom, prevTo } = resolveRange(query), m = between(from, to);
  const [c, p] = await Promise.all([windowStats(from, to), windowStats(prevFrom, prevTo)]);
  const e = (s, k) => s.ev[k] || 0;
  const rate = (s) => (s.ev.session_start ? Math.round((s.subs / s.ev.session_start) * 1000) / 10 : 0);
  const cards = {
    totalVisitors: card(e(c, 'session_start'), e(p, 'session_start')), uniqueVisitors: card(c.unique, p.unique), newVisitors: card(c.newV, p.newV), returningVisitors: card(Math.max(c.unique - c.newV, 0), Math.max(p.unique - p.newV, 0)),
    pageViews: card(e(c, 'page_view'), e(p, 'page_view')), checksStarted: card(e(c, 'eligibility_started'), e(p, 'eligibility_started')), checksCompleted: card(c.subs, p.subs),
    conversionRate: card(rate(c), rate(p)), auditsRun: card(c.audits, p.audits), avgWebsiteScore: card(c.web, p.web), avgSocialScore: card(c.soc, p.soc),
    contactRequests: card(c.contacts, p.contacts), whatsappCallClicks: card(e(c, 'contact_click'), e(p, 'contact_click')), chatSessions: card(c.chats, p.chats),
    reportsDownloaded: card(e(c, 'report_downloaded'), e(p, 'report_downloaded')), avgEligibleNow: card(c.avgNow, p.avgNow), documentsUploaded: card(c.docs, p.docs),
  };
  const day = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } };
  const daily = (M, match) => M.aggregate([{ $match: match }, { $group: { _id: day, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const [vTrend, sTrend, statusAgg, topAgg, flags, scoreBuckets, hourly, funnelE, latestSubs, latestVis, latestContacts] = await Promise.all([
    daily(PageView, { ...m, type: 'session_start' }), daily(Submission, m),
    Submission.aggregate([{ $match: m }, { $group: { _id: null, eligibleNow: { $sum: '$counts.eligibleNow' }, afterAction: { $sum: '$counts.afterAction' }, lowFit: { $sum: '$counts.lowFit' } } }]),
    Submission.aggregate([{ $match: m }, { $unwind: '$topSchemes' }, { $group: { _id: '$topSchemes.name', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }, { $project: { _id: 0, name: '$_id', count: 1 } }]),
    Submission.aggregate([{ $match: m }, { $group: { _id: null, n: { $sum: 1 }, ...Object.fromEntries(['Udyam', 'GST', 'DPIIT', 'IEC', 'FSSAI'].map((r) => [r, { $sum: { $cond: [`$readinessFlags.${r}.missing`, 1, 0] } }])) } }]),
    DigitalAudit.aggregate([{ $match: m }, { $facet: { website: [{ $bucket: { groupBy: '$websiteScore', boundaries: [0, 40, 60, 80, 101], default: 'n/a', output: { count: { $sum: 1 } } } }], social: [{ $bucket: { groupBy: '$socialScore', boundaries: [0, 40, 60, 80, 101], default: 'n/a', output: { count: { $sum: 1 } } } }] } }]),
    PageView.aggregate([{ $match: { ...m, type: 'session_start' } }, { $group: { _id: { $hour: { date: '$createdAt', timezone: TZ } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    PageView.aggregate([{ $match: m }, { $group: { _id: '$type', visitors: { $addToSet: '$visitorId' } } }, { $project: { n: { $size: '$visitors' } } }]),
    Submission.find(m).sort({ createdAt: -1 }).limit(10).select('clientName businessName state sector status counts createdAt').lean(),
    Visitor.find(between(from, to, 'lastSeen')).sort({ lastSeen: -1 }).limit(10).select('visitorId device browser city state referrer converted lastSeen').lean(),
    ContactRequest.find(m).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const fe = Object.fromEntries(funnelE.map((x) => [x._id, x.n]));
  const total = flags[0]?.n || 0, gap = (k) => (total ? Math.round(((flags[0]?.[k] || 0) / total) * 100) : 0);
  const [byState, bySector, byEntity, byPromoter, byFunding, sources, devices] = await Promise.all([
    ...['state', 'sector', 'entityType', 'promoterCategory', 'fundingPurpose'].map((f) => group(Submission, m, f)),
    group(Visitor, between(from, to, 'firstSeen'), 'referrer'), group(Visitor, between(from, to, 'firstSeen'), 'device'),
  ]);
  return {
    range: { from, to }, cards, sparklines: { totalVisitors: vTrend.map((x) => x.n), checksCompleted: sTrend.map((x) => x.n) },
    trend: { visitors: vTrend, submissions: sTrend },
    funnel: [{ stage: 'Visited', count: fe.session_start || 0 }, { stage: 'Started', count: fe.eligibility_started || 0 }, { stage: 'Completed', count: fe.submission_completed || 0 }, { stage: 'Report viewed', count: fe.report_viewed || 0 }, { stage: 'Contacted', count: fe.contact_click || 0 }],
    schemeStatus: statusAgg[0] ? [{ name: 'Eligible Now', count: statusAgg[0].eligibleNow }, { name: 'Eligible After Action', count: statusAgg[0].afterAction }, { name: 'Low Fit', count: statusAgg[0].lowFit }] : [],
    topSchemes: topAgg, byState, bySector, byEntity, byPromoter, byFunding, sources, devices, hourly: hourly.map((h) => ({ hour: h._id, count: h.count })),
    registrationGaps: { Udyam: gap('Udyam'), GST: gap('GST'), DPIIT: gap('DPIIT'), IEC: gap('IEC'), FSSAI: gap('FSSAI') }, scoreDistribution: scoreBuckets[0] || {},
    latestSubmissions: latestSubs, latestVisitors: latestVis, recentContacts: latestContacts,
  };
}
