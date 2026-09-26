// Requires local LiveKit --dev and the real application backend on port 5000.
// Uses real HTTP auth/invites, LiveKit SDK, WebRTC and received decoded audio.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function user(index) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
    await context.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => {
        const hw = await original(options), settings = hw.getAudioTracks()[0].getSettings();
        hw.getTracks().forEach(t => t.stop());
        const ctx = new AudioContext(), tone = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
        gain.gain.value = .15; tone.frequency.value = 440; tone.connect(gain).connect(dest); tone.start(); await ctx.resume();
        dest.stream.getAudioTracks()[0].getSettings = () => settings;
        window.__capture = dest.stream;
        return dest.stream;
      };
    });
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('http://127.0.0.1:5000/#/register');
    await page.getByTestId('input-email').fill(`rtc-${index}-${Date.now()}@example.test`);
    await page.getByTestId('input-nickname').fill(`RTC тест ${index}`);
    await page.getByTestId('input-password').fill('Local-QA-Only-123!');
    await page.getByTestId('button-register').click();
    await page.locator('h2:visible').filter({ hasText: 'Создай первый сервер' }).waitFor();
    return page;
  }
  const api = (page, method, endpoint, body) => page.evaluate(async ({ method, endpoint, body }) => {
    const res = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${localStorage.getItem('egv.token')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }, { method, endpoint, body });
  const level = async page => page.evaluate(async () => {
    const audio = document.querySelector('audio');
    if (!audio?.srcObject) return -1;
    const ctx = new AudioContext(); await ctx.resume();
    const source = ctx.createMediaStreamSource(audio.srcObject), a = ctx.createAnalyser();
    source.connect(a); const samples = new Float32Array(2048);
    let max = 0;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 40)); a.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length); max = Math.max(max, rms);
    }
    source.disconnect(); await ctx.close(); return max;
  });
  const silent = async page => {
    // Already-sent samples can remain in the WebRTC jitter buffer briefly.
    const until = Date.now() + 3500;
    let rms;
    do { rms = await level(page); if (rms < .001) return rms; } while (Date.now() < until);
    return rms;
  };
  try {
    const a = await user(1);
    await a.locator('input[placeholder="Имя сервера"]:visible').fill('RTC end-to-end');
    await a.getByRole('button', { name: 'Создать сервер', exact: true }).click();
    await a.getByTestId('button-invite').waitFor();
    const { servers } = await api(a, 'GET', '/api/servers');
    const { code } = await api(a, 'POST', `/api/servers/${servers[0].id}/invites`, {});
    const b = await user(2);
    await b.goto(`http://127.0.0.1:5000/#/invite/${code}`);
    await b.getByTestId('button-accept-invite').click();
    await b.getByTestId('button-invite').waitFor();
    const { channels } = await api(a, 'GET', `/api/servers/${servers[0].id}/channels`);
    const channel = channels.find(c => c.type === 'voice');
    for (const page of [a, b]) {
      await page.getByTestId(`button-voice-${channel.id}`).click();
      await page.getByTestId('voice-mode-quick').selectOption('open');
      await page.waitForFunction(() => document.querySelector('[data-testid="voice-toolbar"]')?.textContent.includes('Передача открыта'));
    }
    await b.waitForFunction(() => document.querySelector('audio')?.srcObject != null);
    const received = await level(b);
    assert.ok(received > .01, `Expected received sound, got ${received}`);
    await a.getByLabel('Микрофон', { exact: true }).click();
    await b.waitForFunction(() => [...document.querySelectorAll('[data-testid^="voice-card-"]')].some(el => el.textContent.includes('RTC тест 1') && el.textContent.includes('микрофон выкл')));
    const muted = await level(b);
    assert.ok(muted < .001, `Manual mute leaked ${muted}`);
    await a.getByLabel('Микрофон', { exact: true }).click();
    await a.getByLabel('Настройки голоса', { exact: true }).click();
    await a.getByTestId('mode-ptt').click();
    const closed = await silent(b);
    assert.ok(closed < .001, `PTT idle leaked ${closed}`);
    await a.getByTestId('mode-open').click();
    const reopened = await level(b);
    assert.ok(reopened > .01, `Mode change failed ${reopened}`);
    await a.getByTestId('mode-vad').click();
    await a.getByLabel('Порог активации', { exact: true }).fill('-10');
    const vadClosed = await silent(b);
    assert.ok(vadClosed < .001, `VAD threshold failed ${vadClosed}`);
    await a.getByLabel('Порог активации', { exact: true }).fill('-60');
    const vadOpen = await level(b);
    assert.ok(vadOpen > .01, `VAD did not reopen ${vadOpen}`);
    await a.getByTestId('mode-open').click();
    await a.getByTestId('button-back').click();
    await b.screenshot({ path: path.join(__dirname, 'screenshots', 'real-two-peers.png') });
    await a.getByLabel('Выключить звук и микрофон').click();
    const deaf = await silent(b);
    assert.ok(deaf < .001, `Deafen leaked ${deaf}`);
    await a.getByLabel('Выйти из голоса', { exact: true }).click();
    assert.equal(await a.evaluate(() => window.__capture.getTracks().every(t => t.readyState === 'ended')), true);
    await b.getByLabel('Выйти из голоса', { exact: true }).click();
    assert.deepEqual(errors, []);
    const result = { received, muted, pttClosed: closed, reopened, vadClosed, vadOpen, deafen: deaf, errors, transport: 'Real local LiveKit 1.13.7 + two Chromium contexts + WebRTC decoded audio' };
    console.log(JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(__dirname, 'voice-live-result.json'), JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exit(1); });
