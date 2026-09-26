// Isolated API + real UI: search privacy, request direction, acceptance,
// duplicate/self/cross requests, decline/cancel, unauthorized access, Cyrillic,
// old-backend fallback and responsive screens. No production records touched.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), API = 'http://127.0.0.1:5001';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'egvoice-friends-'));
const child = spawn(process.execPath, ['dist/index.cjs'], { cwd: ROOT, env: {
  PATH: process.env.PATH, NODE_ENV: 'production', PORT: '5001', DATA_DIR: temp, JWT_SECRET: randomUUID() + randomUUID(),
}, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
(async () => {
  let browser;
  const checks = [];
  async function request(user, method, route, body, expected = 200) {
    const r = await fetch(API + route, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(r.status, expected, `${method} ${route}`);
    return r.json();
  }
  try {
    for (let i = 0; i < 60; i++) {
      try { await fetch(API + '/api/auth/me'); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    const register = name => request(null, 'POST', '/api/auth/register', { email: `${randomUUID()}@example.test`, nickname: name, password: randomUUID() });
    const a = await register('Егор тест'), b = await register('Катя тест'), c = await register('Никто тест');
    await request(null, 'GET', '/api/friends', null, 401);
    await request(a, 'GET', '/api/users/search?q=к', null, 400);
    const found = await request(a, 'GET', '/api/users/search?q=' + encodeURIComponent('КАТЯ'));
    assert.equal(found.users[0].id, b.user.id);
    assert.equal(found.users[0].email, undefined);
    assert.equal(found.users[0].passwordHash, undefined);
    checks.push('authenticated bounded Cyrillic search; no email/password exposed');
    await request(a, 'POST', '/api/friends/requests', { userId: a.user.id }, 400);
    await request(a, 'POST', '/api/friends/requests', { userId: b.user.id });
    await request(a, 'POST', '/api/friends/requests', { userId: b.user.id });
    await request(b, 'POST', '/api/friends/requests', { userId: a.user.id }, 409);
    await request(a, 'POST', `/api/friends/requests/${b.user.id}/accept`, {}, 403);
    await request(c, 'POST', `/api/friends/requests/${a.user.id}/accept`, {}, 404);
    assert.equal((await request(b, 'GET', '/api/friends')).incoming.length, 1);
    checks.push('self/duplicate/cross requests and ownership enforced');
    await request(b, 'POST', `/api/friends/requests/${a.user.id}/accept`, {});
    await request(b, 'POST', `/api/friends/requests/${a.user.id}/accept`, {});
    assert.equal((await request(a, 'GET', '/api/friends')).friends[0].id, b.user.id);
    assert.equal((await request(b, 'GET', '/api/friends')).friends[0].id, a.user.id);
    await request(a, 'POST', '/api/friends/requests', { userId: c.user.id });
    await request(a, 'POST', `/api/friends/requests/${c.user.id}/cancel`, {});
    await request(a, 'POST', '/api/friends/requests', { userId: c.user.id });
    await request(c, 'POST', `/api/friends/requests/${a.user.id}/decline`, {});
    checks.push('two-sided acceptance, repeat accept, cancel and decline');
    browser = await chromium.launch();
    async function pageFor(user) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      await context.addInitScript(token => localStorage.setItem('egv.token', token), user.token);
      const page = await context.newPage();
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: API + url.pathname + url.search });
        await route.fulfill({ response });
      });
      await page.goto('http://127.0.0.1:5178/#/friends');
      await page.getByTestId('friend-search').waitFor();
      return page;
    }
    const pa = await pageFor(a), pc = await pageFor(c);
    await pa.getByTestId('friend-search').fill('Никто');
    await pa.getByRole('button', { name: 'Найти', exact: true }).click();
    await pa.getByRole('button', { name: 'Добавить в друзья', exact: true }).click();
    await pa.getByTestId('friends-outgoing').getByText('Никто тест', { exact: true }).waitFor();
    await pc.reload();
    await pc.getByTestId('friends-incoming').getByRole('button', { name: 'Принять', exact: true }).click();
    await pc.getByTestId('friends-friends').getByText('Егор тест', { exact: true }).waitFor();
    await pa.reload();
    await pa.getByTestId('friends-friends').getByText('Никто тест', { exact: true }).waitFor();
    fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
    await pa.screenshot({ path: path.join(__dirname, 'screenshots/friends-desktop.png') });
    await pc.setViewportSize({ width: 375, height: 812 });
    await pc.screenshot({ path: path.join(__dirname, 'screenshots/friends-mobile.png') });
    assert.ok(await pc.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push('real UI search/send/accept on two accounts; desktop/mobile fit');
    await pa.route('**/api/friends', r => r.fulfill({ contentType: 'text/html', body: '<html>old backend</html>' }));
    await pa.reload();
    await pa.getByText('Поиск и заявки ещё не активированы', { exact: false }).waitFor();
    assert.equal(await pa.getByTestId('friend-search').count(), 0);
    checks.push('legacy backend honestly disables unsupported friend actions');
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
    await new Promise(r => child.once('exit', r));
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
