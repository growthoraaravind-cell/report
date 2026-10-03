import test from 'node:test';
import assert from 'node:assert/strict';
import { runEligibility, scoreScheme } from '../src/services/eligibilityEngine.service.js';

const profile = { entityType: 'Proprietorship', businessStage: 'New', promoterCategory: 'Women', sector: 'Manufacturing', state: 'Karnataka', fundingPurpose: 'Loan', udyam: 'No', dpiit: 'No', gst: 'Yes', iec: 'No', gem: 'No', fssai: 'No', businessAge: 1, annualTurnover: 500000, projectCost: 1000000 };
const base = { schemeId: 'S1', name: 'A', level: 'Central', baseWeight: 6, eligibleEntity: ['Proprietorship'], stageFit: ['New'], promoterFit: ['General'], sectorFit: ['General'], stateFilter: 'All', mustHaveReg: 'None', preferredReg: '', fundingFit: ['Loan'], minProject: 0, maxProject: 0, isActive: true, isPublished: true, isComplete: true };

test('blank input is rejected', () => assert.throws(() => runEligibility({}, [base]), /complete/));
test('tie-break: score, base weight, level, id', () => {
  const r = runEligibility(profile, [{ ...base, schemeId: 'S3', level: 'Central/State' }, { ...base, schemeId: 'S2' }, { ...base, schemeId: 'S1', baseWeight: 7 }]).results.map((x) => x.schemeId);
  assert.deepEqual(r, ['S1', 'S2', 'S3']);
});
test('scheme guidance fields pass through to recommendations', () => {
  const details = { description: 'Funding support for eligible businesses', benefits: ['Credit support'], documentsRequired: ['Business plan'], officialUrl: 'https://example.gov.in/scheme' };
  const result = scoreScheme(profile, { ...base, ...details });
  assert.equal(result.description, details.description);
  assert.deepEqual(result.benefits, details.benefits);
  assert.deepEqual(result.documentsRequired, details.documentsRequired);
  assert.equal(result.officialUrl, details.officialUrl);
});
test('missing must-have registration caps at After Action', () => {
  const r = scoreScheme(profile, { ...base, baseWeight: 10, mustHaveReg: 'Udyam' });
  assert.equal(r.status, 'Eligible After Action'); assert.equal(r.missingRegistration, 'Udyam');
});
test('Gujarat scheme is Low Fit for Karnataka client', () => assert.equal(scoreScheme(profile, { ...base, stateFilter: 'Gujarat' }).status, 'Low Fit'));
test('project range uses Project Cost, not turnover', () => {
  assert.equal(scoreScheme(profile, { ...base, minProject: 2000000 }).breakdown.project, 0);
  assert.equal(scoreScheme(profile, { ...base, minProject: 500000, maxProject: 2000000 }).breakdown.project, 2);
});
test('canonical field names preserve exact matching and wildcard behavior', () => {
  const canonical = { ...base, promoterFit: undefined, promoterCategoryFit: ['Women'], mustHaveReg: undefined, mustHaveRegn: 'None', sectorFit: ['General'], stateFilter: 'All' };
  const result = scoreScheme(profile, canonical);
  assert.equal(result.breakdown.promoter, 3);
  assert.equal(result.breakdown.sector, 2);
  assert.equal(result.breakdown.state, 2);
  assert.equal(scoreScheme(profile, { ...canonical, promoterCategoryFit: ['ST'] }).breakdown.promoter, 0);
  assert.equal(scoreScheme({ ...profile, udyam: 'No' }, { ...canonical, preferredRegn: 'Udyam' }).breakdown.preferredReg, 0);
});
test('incomplete and unpublished schemes are excluded from scoring', () => {
  const results = runEligibility(profile, [{ ...base, schemeId: 'PUBLISHED' }, { ...base, schemeId: 'DRAFT', isPublished: false, isComplete: false }, { ...base, schemeId: 'UNCHECKED', isComplete: undefined }]).results;
  assert.deepEqual(results.map((scheme) => scheme.schemeId), ['PUBLISHED']);
});
test('readiness unlock count', () => {
  const r = runEligibility(profile, [{ ...base, baseWeight: 10, mustHaveReg: 'Udyam' }]);
  assert.equal(r.readinessFlags.Udyam.unlocks, 1);
});
