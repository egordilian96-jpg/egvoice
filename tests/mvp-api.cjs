const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://127.0.0.1:5000';
async function request(method, endpoint, token, data) {
  const r = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  return { status: r.status, body: await r.json() };
}
(async () => {
  const checks = [], members = [];
  for (let i = 0; i < 12; i++) {
    const r = await request('POST', '/api/auth/register', null, { email: `capacity-${Date.now()}-${i}@example.test`, password: 'Sandbox-Only-123', nickname: `Проверка ${i}` });
    assert.equal(r.status, 200); members.push(r.body.token);
  }
  const owner = members[0];
  const s = await request('POST', '/api/servers', owner, { name: 'Лимит MVP' });
  const id = s.body.server.id;
  const invite = await request('POST', `/api/servers/${id}/invites`, owner, { maxUses: 100 });
  for (const token of members.slice(1, 9)) assert.equal((await request('POST', `/api/invites/${invite.body.code}/accept`, token)).status, 200);
  // Fire together, not sequentially: there is only one free slot.
  const results = await Promise.all(members.slice(9).map(token => request('POST', `/api/invites/${invite.body.code}/accept`, token)));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 2);
  assert.equal((await request('GET', `/api/servers/${id}/members`, owner)).body.members.length, 10);
  checks.push('atomic last-slot invite acceptance never exceeds 10 members');
  const already = await request('POST', `/api/invites/${invite.body.code}/accept`, members[1]);
  assert.equal(already.status, 200); assert.equal(already.body.alreadyMember, true);
  checks.push('repeat invite acceptance is idempotent even when server is full');
  const unauthorized = await request('POST', `/api/servers/${id}/channels`, members[1], { name: 'новый', type: 'voice' });
  assert.equal(unauthorized.status, 403);
  const duplicate = await request('POST', `/api/servers/${id}/channels`, owner, { name: 'ОБЩИЙ', type: 'voice' });
  assert.equal(duplicate.status, 409);
  checks.push('server owner authorization and case-normalized duplicate channel rejection');
  const fractional = await request('POST', `/api/servers/${id}/invites`, owner, { maxUses: 1.5 });
  assert.equal(fractional.status, 400);
  checks.push('numeric invite limits reject fractional values on backend');
  const channels = (await request('GET', `/api/servers/${id}/channels`, owner)).body.channels;
  const channel = channels.find(c => c.type === 'text');
  assert.equal((await request('POST', `/api/channels/${channel.id}/messages`, owner, { text: '   ' })).status, 400);
  assert.equal((await request('POST', `/api/channels/${channel.id}/messages`, owner, { text: 'x'.repeat(2001) })).status, 400);
  checks.push('blank and oversized messages rejected by backend');
  const result = { passed: checks.length, checks };
  fs.writeFileSync(path.join(__dirname, 'mvp-api-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
