// QA inventory: create/copy public invitation; clipboard failure/manual copy;
// reject invalid and missing codes; existing-account + existing-server accept;
// select invited server/voice channel without starting microphone; repeat accept;
// unauthenticated invite -> registration -> confirmation; desktop/mobile fit.
// Run only against the isolated local API, never the public production database.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.INVITE_QA_URL || 'http://127.0.0.1:5178';
const checks = [];
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const shots = path.join(__dirname, 'screenshots');
  fs.mkdirSync(shots, { recursive: true });
  try {
    async function client() {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      return page;
    }
    async function register(page, nickname) {
      await page.getByTestId('input-email').fill(`invite-${crypto.randomUUID()}@example.test`);
      await page.getByTestId('input-nickname').fill(nickname);
      await page.getByTestId('input-password').fill('Isolated-Local-Test-123!');
      await page.getByTestId('button-register').click();
    }
    async function create(page, name) {
      await page.locator('input[placeholder="Имя сервера"]:visible').fill(name);
      await page.getByRole('button', { name: 'Создать сервер', exact: true }).click();
      await page.getByTestId('button-invite').waitFor();
    }
    const owner = await client();
    await owner.goto(`${BASE}/#/register`);
    await register(owner, 'Хозяин теста');
    await create(owner, 'Тусовка друзей');
    await owner.getByTestId('button-invite').click();
    await owner.getByTestId('text-invite-code').waitFor();
    const code = await owner.getByTestId('text-invite-code').inputValue();
    const link = await owner.getByTestId('text-invite-link').inputValue();
    assert.match(code, /^[A-Za-z0-9_-]{8}$/);
    assert.equal(link, `https://egvoice.pplx.app/#/invite/${code}`);
    await owner.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await owner.getByTestId('button-copy-invite').click();
    assert.equal(await owner.evaluate(() => navigator.clipboard.readText()), link);
    await owner.getByTestId('button-copy-code').click();
    assert.equal(await owner.evaluate(() => navigator.clipboard.readText()), code);
    await owner.screenshot({ path: path.join(shots, 'invite-desktop.png') });
    checks.push('public HTTPS link, case-sensitive short code, both copy actions');
    await owner.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error('clipboard denied'); };
      document.execCommand = () => false;
    });
    await owner.getByTestId('button-copy-code').click();
    await owner.getByText('Буфер обмена недоступен').waitFor();
    await owner.getByTestId('text-invite-code').focus();
    assert.equal(await owner.getByTestId('text-invite-code').evaluate(el => el.selectionEnd - el.selectionStart), 8);
    checks.push('denied clipboard leaves selectable manual-copy fields');
    const friend = await client();
    await friend.goto(`${BASE}/#/register`);
    await register(friend, 'Друг теста');
    await create(friend, 'Старый сервер друга');
    await friend.getByTestId('button-join-server').click();
    await friend.getByTestId('input-invite').fill('not a valid invite');
    await friend.getByTestId('button-preview-invite').click();
    await friend.getByRole('alert').waitFor();
    await friend.getByTestId('input-invite').fill('XXXXXXXX');
    await friend.getByTestId('button-preview-invite').click();
    await friend.getByText('Инвайт не найден').waitFor();
    await friend.getByRole('link', { name: 'Ввести другое приглашение' }).click();
    checks.push('invalid format and nonexistent invite have recoverable errors');
    await friend.getByTestId('input-invite').fill(code);
    await friend.getByTestId('button-preview-invite').click();
    await friend.getByTestId('text-server-name').waitFor();
    assert.equal(await friend.getByTestId('text-server-name').textContent(), 'Тусовка друзей');
    await friend.getByTestId('button-accept-invite').click();
    await friend.getByTestId('joined-server-notice').waitFor();
    assert.match(await friend.getByTestId('joined-server-notice').textContent(), /Тусовка друзей/);
    assert.equal(await friend.getByTestId('text-channel-name').textContent(), 'общий');
    assert.equal(await friend.getByTestId('voice-toolbar').count(), 0);
    await friend.screenshot({ path: path.join(shots, 'invite-accepted.png') });
    checks.push('existing account accepts into invited server, not its old server; no automatic voice');
    await friend.getByTestId('button-join-server').click();
    await friend.getByTestId('input-invite').fill(`http://tauri.localhost/#/invite/${code}`);
    await friend.getByTestId('button-preview-invite').click();
    await friend.getByTestId('button-accept-invite').click();
    await friend.getByTestId('joined-server-notice').waitFor();
    checks.push('legacy Windows link recovered; repeat accept works');
    const guest = await client();
    await guest.goto(`${BASE}/#/join`);
    await guest.getByTestId('input-invite').fill(link);
    await guest.getByTestId('button-preview-invite').click();
    await guest.getByTestId('button-accept-invite').click();
    await guest.getByTestId('link-register').click();
    await register(guest, 'Новый друг');
    await guest.getByTestId('button-accept-invite').waitFor();
    await guest.getByTestId('button-accept-invite').click();
    await guest.getByTestId('joined-server-notice').waitFor();
    checks.push('invite survives login/registration and requires explicit acceptance');
    await guest.getByTestId('button-join-server').click();
    await guest.setViewportSize({ width: 375, height: 812 });
    await guest.screenshot({ path: path.join(shots, 'invite-mobile.png') });
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const box = await guest.getByTestId('button-preview-invite').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 375);
    checks.push('375px entry screen fits and primary action stays visible');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
