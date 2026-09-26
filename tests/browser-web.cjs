// Two real browser clients, published bundle, existing API and LiveKit.
// Creates isolated QA accounts/server. Never exports passwords or tokens.
const { chromium } = require('playwright');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.QA_WEB_URL || 'http://127.0.0.1:5180';
const api = 'https://egvoice.pplx.app/port/5000';
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const checks = [];
  const errors = [];
  try {
    async function user(name) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
      await context.addInitScript(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async options => {
          const hw = await original(options), settings = hw.getAudioTracks()[0].getSettings();
          hw.getTracks().forEach(t => t.stop());
          const ctx = new AudioContext(), tone = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
          gain.gain.value = .15; tone.frequency.value = 440;
          tone.connect(gain).connect(dest); tone.start(); await ctx.resume();
          dest.stream.getAudioTracks()[0].getSettings = () => settings;
          return dest.stream;
        };
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/#/register');
      const response = page.waitForResponse(r => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST');
      await page.getByTestId('input-email').fill(`web-qa-${randomUUID()}@example.test`);
      await page.getByTestId('input-nickname').fill(name);
      await page.getByTestId('input-password').fill(randomUUID());
      await page.getByTestId('button-register').click();
      const r = await response;
      assert.equal(r.status(), 200);
      const auth = await r.json();
      await page.locator('h2:visible').filter({ hasText: 'Создай первый сервер' }).waitFor();
      return { page, token: auth.token };
    }
    const a = await user('Браузер QA один'), b = await user('Браузер QA два');
    await a.page.locator('input[placeholder="Имя сервера"]:visible').fill('Web client isolated QA');
    await a.page.getByRole('button', { name: 'Создать сервер', exact: true }).click();
    await a.page.getByTestId('button-invite').click();
    const code = await a.page.getByTestId('text-invite-code').inputValue();
    const link = await a.page.getByTestId('text-invite-link').inputValue();
    assert.equal(link, `https://egvoice-web.pplx.app/#/invite/${code}`);
    await a.page.keyboard.press('Escape');
    // Hash navigation retains the in-memory browser session.
    await b.page.evaluate(code => { location.hash = '/invite/' + code; }, code);
    await b.page.getByTestId('button-accept-invite').click();
    await b.page.getByTestId('button-invite').waitFor();
    checks.push('real browser registration, CORS, public web invitation and acceptance');
    const channels = await a.page.evaluate(async ({ api, token }) => {
      const headers = { Authorization: `Bearer ${token}` };
      const { servers } = await fetch(api + '/api/servers', { headers }).then(r => r.json());
      return fetch(api + `/api/servers/${servers[0].id}/channels`, { headers }).then(r => r.json());
    }, { api, token: a.token });
    const text = channels.channels.find(c => c.type === 'text');
    const voice = channels.channels.find(c => c.type === 'voice');
    for (const u of [a, b]) await u.page.getByTestId(`button-channel-${text.id}`).click();
    await a.page.getByTestId('input-message').fill('Сообщение из браузера\nПроверка доставки');
    await a.page.getByTestId('button-send-message').click();
    await b.page.locator('[data-testid^="text-message-"]').filter({ hasText: 'Проверка доставки' }).waitFor();
    checks.push('text message delivered to second browser, including HTTP fallback');
    for (const u of [a, b]) {
      await u.page.getByTestId('button-open-settings').click();
      await u.page.getByLabel('Маршрут голоса', { exact: true }).selectOption('relay-tcp');
      await u.page.getByLabel('Согласование соединения', { exact: true }).selectOption('compatible');
      await u.page.getByTestId('mode-open').click();
      await u.page.getByTestId('button-back').click();
      await u.page.getByTestId(`button-voice-${voice.id}`).click();
      await u.page.waitForFunction(() => document.querySelector('[data-testid="voice-toolbar"]')?.textContent.includes('Передача открыта'), null, { timeout: 60000 });
    }
    async function level(page) {
      await page.waitForFunction(() => document.querySelector('audio')?.srcObject != null);
      return page.evaluate(async () => {
        const audio = document.querySelector('audio');
        const ctx = new AudioContext(); await ctx.resume();
        const source = ctx.createMediaStreamSource(audio.srcObject), analyser = ctx.createAnalyser();
        source.connect(analyser); const data = new Float32Array(2048); let max = 0;
        for (let i = 0; i < 25; i++) {
          await new Promise(r => setTimeout(r, 40)); analyser.getFloatTimeDomainData(data);
          max = Math.max(max, Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length));
        }
        source.disconnect(); await ctx.close(); return max;
      });
    }
    const levels = [await level(a.page), await level(b.page)];
    assert.ok(levels.every(n => n > .01), 'decoded audio received in both directions');
    checks.push('two-way decoded audio via real LiveKit with TCP/TLS route');
    await a.page.getByLabel('Микрофон', { exact: true }).click();
    await a.page.waitForTimeout(1800);
    assert.ok(await level(b.page) < .001, 'muted client stops remote audio');
    checks.push('mute stops decoded remote audio');
    fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
    await a.page.screenshot({ path: path.join(__dirname, 'screenshots/browser-voice.png') });
    for (const u of [a, b]) await u.page.getByLabel('Выйти из голоса', { exact: true }).click();
    await a.page.reload();
    await a.page.getByTestId('button-login').waitFor();
    checks.push('reload visibly requires login, no automatic microphone activation');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: checks.length, checks, decodedAudioRms: levels }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
