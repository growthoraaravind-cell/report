import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, assertPublicUrl } from '../src/utils/safeFetch.js';
import { resolveRange } from '../src/utils/dateRange.js';
import { auditSocial, parseSocial } from '../src/services/socialAudit.service.js';
import { faqReply } from '../src/services/chat.service.js';
import { normalizeOrigin } from '../src/config/cors.js';
test('SSRF: private ranges are blocked', () => { for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1']) assert.ok(isPrivateIp(ip), ip); assert.ok(!isPrivateIp('8.8.8.8')); });
test('SSRF: localhost and non-http urls rejected', async () => { await assert.rejects(assertPublicUrl('http://127.0.0.1/admin')); await assert.rejects(assertPublicUrl('file:///etc/passwd')); });
test('IST date range: today is 24h and previous period precedes it', () => {
  const r = resolveRange({ range: 'today' }, Date.parse('2026-10-03T20:00:00Z')); // 01:30 IST on 4 Oct
  assert.equal(r.to - r.from, 864e5); assert.equal(r.from.toISOString(), '2026-10-03T18:30:00.000Z'); assert.equal(r.prevTo.getTime(), r.from.getTime());
});
test('custom range validates', () => assert.throws(() => resolveRange({ range: 'custom', from: 'x', to: 'y' })));
test('CORS origins normalize whitespace and trailing paths', () => {
  assert.equal(normalizeOrigin(' https://reportfrontend.vercel.app/ '), 'https://reportfrontend.vercel.app');
  assert.equal(normalizeOrigin('http://localhost:5173/path'), 'http://localhost:5173');
  assert.equal(normalizeOrigin('not a url'), '');
});
test('social url platform matching', () => { assert.ok(parseSocial('instagram', 'instagram.com/growthora').ok); assert.equal(parseSocial('instagram', 'https://facebook.com/x').ok, false); assert.equal(parseSocial('linkedin', 'linkedin.com/company/growthora').handle, 'growthora'); });
test('social audit handles empty and invalid profile sets', async () => {
  const empty = await auditSocial({}, {});
  assert.deepEqual(empty.platforms, {});
  assert.equal(empty.score, null);
  const invalid = await auditSocial({ instagram: 'https://facebook.com/not-instagram' }, {});
  assert.equal(invalid.platforms.instagram.valid, false);
  assert.equal(invalid.score, null);
});
test('FAQ fallback always offers the human team', () => assert.match(faqReply('hello'), /6360886843/));
