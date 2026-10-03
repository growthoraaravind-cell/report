// Re-implements Rule_Engine from the Excel with the documented bug fixes.
import { DEFAULT_RULES } from '../config/defaultRules.js';

const REQUIRED = ['entityType', 'businessStage', 'promoterCategory', 'sector', 'state', 'fundingPurpose', 'udyam', 'dpiit', 'gst', 'iec', 'gem', 'fssai', 'businessAge', 'annualTurnover', 'projectCost'];
const REG_FIELD = { Udyam: 'udyam', DPIIT: 'dpiit', IEC: 'iec', FSSAI: 'fssai', GST: 'gst' };
const lc = (s) => String(s).trim().toLowerCase();
// Exact matching on arrays (fixes the SEARCH() substring bug).
const has = (list = [], v) => list.some((x) => lc(x) === lc(v));
const isYes = (v) => lc(v) === 'yes';

export function validateProfile(p) {
  const missing = REQUIRED.filter((k) => p[k] === undefined || p[k] === null || String(p[k]).trim() === '');
  if (missing.length) { const e = new Error('Please complete: ' + missing.join(', ')); e.status = 400; e.fields = missing; throw e; }
}

export function scoreScheme(p, s, rules = DEFAULT_RULES) {
  const pts = rules.points, g = rules.gates;
  const aliases = rules.sectorAliases[p.sector] || [];
  const promoterFit = s.promoterCategoryFit || s.promoterFit || [];
  const mustHaveReg = s.mustHaveRegn || s.mustHaveReg || 'None';
  const preferredReg = s.preferredRegn || s.preferredReg || 'None';
  const entityOk = has(s.eligibleEntity, p.entityType);
  const stateOk = lc(s.stateFilter || 'All') === 'all' || lc(s.stateFilter) === lc(p.state);
  const must = mustHaveReg;
  const mustOk = must === 'None' ? true : isYes(p[REG_FIELD[must]]);
  const prefOk = preferredReg === 'GST' ? isYes(p.gst) : preferredReg === 'Udyam' ? isYes(p.udyam) : true;
  const c = {
    base: s.baseWeight || 0,
    entity: entityOk ? pts.entity : 0,
    stage: has(s.stageFit, p.businessStage) ? pts.stage : 0,
    promoter: has(promoterFit, 'General') || has(promoterFit, p.promoterCategory) ? pts.promoter : 0,
    sector: has(s.sectorFit, 'General') || has(s.sectorFit, p.sector) || aliases.some((a) => has(s.sectorFit, a)) ? pts.sector : 0,
    state: stateOk ? pts.state : 0,
    mustReg: mustOk ? pts.mustReg : 0,
    preferredReg: prefOk ? pts.preferredReg : 0,
    funding: has(s.fundingFit, p.fundingPurpose) ? pts.funding : 0,
    // FIX: uses Project Cost (Excel pointed at Turnover by mistake)
    project: !s.minProject || (Number(p.projectCost) >= s.minProject && (!s.maxProject || Number(p.projectCost) <= s.maxProject)) ? pts.project : 0,
  };
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  let status = total >= rules.thresholds.eligibleNow ? 'Eligible Now' : total >= rules.thresholds.afterAction ? 'Eligible After Action' : 'Low Fit';
  const actions = [];
  if (!mustOk) { actions.push(`Get ${must} registration`); if (g.missingMustRegCapsAtAfterAction && status === 'Eligible Now') status = 'Eligible After Action'; }
  if (!prefOk) actions.push('Register on GST');
  if (!stateOk && g.stateMismatchIsLowFit) status = 'Low Fit';
  if (!entityOk && g.entityMismatchIsLowFit) status = 'Low Fit';
  if (s.minBusinessAge && p.businessAge < s.minBusinessAge) actions.push(`Business needs ${s.minBusinessAge}+ years of operation`);
  if (s.requiresGeM && !isYes(p.gem)) actions.push('Register on GeM');
  return { schemeId: s.schemeId, name: s.name, category: s.category, level: s.level, description: s.description, benefits: s.benefits || [], subsidyPercent: s.subsidyPercent, officialUrl: s.officialUrl, documentsRequired: s.documentsRequired || [], howToApply: s.howToApply || [], baseWeight: s.baseWeight, score: total, maxScore: (s.baseWeight || 0) + 20, breakdown: c, status, missingRegistration: mustOk ? null : must, actions, why: status === 'Eligible Now' ? 'Strong fit' : 'Check missing registrations / conditions' };
}

const LEVEL_RANK = { Central: 0, 'Central/State': 1, State: 2 };
export function runEligibility(profile, schemes, rules = DEFAULT_RULES) {
  validateProfile(profile);
  const active = schemes.filter((s) => s.isActive === true && s.isPublished === true && s.isComplete === true);
  const results = active.map((s) => scoreScheme(profile, s, rules));
  // FIX: deterministic tie-break, unique schemes
  results.sort((a, b) => b.score - a.score || b.baseWeight - a.baseWeight || (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) || a.schemeId.localeCompare(b.schemeId));
  const counts = { eligibleNow: 0, afterAction: 0, lowFit: 0 };
  results.forEach((r) => { counts[r.status === 'Eligible Now' ? 'eligibleNow' : r.status === 'Eligible After Action' ? 'afterAction' : 'lowFit']++; });
  const nowIds = new Set(results.filter((r) => r.status === 'Eligible Now').map((r) => r.schemeId));
  // Readiness flags + how many extra schemes each registration unlocks
  const readinessFlags = {};
  for (const [reg, field] of Object.entries(REG_FIELD)) {
    const missing = !isYes(profile[field]);
    const sim = { ...profile, [field]: 'Yes' };
    const unlocks = missing ? active.filter((s) => !nowIds.has(s.schemeId) && scoreScheme(sim, s, rules).status === 'Eligible Now').length : 0;
    readinessFlags[reg] = { missing, unlocks };
  }
  const schemeReadiness = results.length ? Math.round((results.reduce((a, r) => a + Math.min(r.score / r.maxScore, 1), 0) / results.length) * 100) : 0;
  return { results, top15: results.filter((r) => r.status !== 'Low Fit').slice(0, 15), counts, readinessFlags, schemeReadiness };
}
