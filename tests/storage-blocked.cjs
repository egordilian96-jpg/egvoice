const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, {
      get() { throw new DOMException('Disabled for privacy', 'SecurityError'); },
    });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:5000/#/register');
    await page.getByTestId('input-email').fill(`no-storage-${Date.now()}@example.test`);
    await page.getByTestId('input-nickname').fill('Без хранилища');
    await page.getByTestId('input-password').fill('Local-preview-only-123');
    await page.getByTestId('button-register').click();
    await page.locator('h2:visible').filter({ hasText: 'Создай первый сервер' }).waitFor();
    await page.locator('input[placeholder="Имя сервера"]:visible').fill('Проверка privacy');
    await page.getByRole('button', { name: 'Создать сервер', exact: true }).click();
    await page.getByTestId('button-invite').waitFor();
    await page.getByTestId('button-open-settings').click();
    await page.getByTestId('mode-open').click();
    await page.getByText('Хранилище недоступно.', { exact: false }).waitFor();
    await page.getByTestId('button-back').click();
    await page.getByTestId('button-open-settings').click();
    assert.equal(await page.getByTestId('mode-open').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
    console.log('PASS registration, authenticated API, navigation, settings memory fallback with both storage getters throwing; no JS errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
