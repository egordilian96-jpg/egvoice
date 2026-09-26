const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shots = path.join(__dirname, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const BASE = process.env.QA_URL || 'http://127.0.0.1:5175';
const checks = [];
const errors = [];

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
  await context.addInitScript(() => {
    localStorage.setItem('egv.token', 'local-test-only');
    // Actual WebAudio signal into getUserMedia result; gain=0 for controlled silence.
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__streams = [];
    navigator.mediaDevices.getUserMedia = async options => {
      if (window.__micDelay) await new Promise(r => setTimeout(r, window.__micDelay));
      if (window.__denyMic) throw new DOMException('denied', 'NotAllowedError');
      const stream = await original(options);
      window.__streams.push(stream);
      if (window.__silence) {
        const hardwareSettings = stream.getAudioTracks()[0].getSettings();
        stream.getTracks().forEach(t => t.stop());
        const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination();
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain).connect(dest); oscillator.start(); await ctx.resume();
        dest.stream.getAudioTracks()[0].getSettings = () => hardwareSettings;
        window.__signal = { ctx, gain, oscillator };
        window.__streams.push(dest.stream);
        return dest.stream;
      }
      return stream;
    };
  });
  const page = await context.newPage();
  let chatSocket;
  await page.routeWebSocket(/\/ws\?/, socket => { chatSocket = socket; });
  page.on('pageerror', e => errors.push(e.message));
  let messageFailure = false, authFailure = false, tokenDelay = 0;
  const histories = {};
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), endpoint = url.pathname;
    const user = { id: 'qa', nickname: 'Тестировщик', email: 'qa@example.test', avatarColor: '#1FD5F9' };
    let body = {};
    if (endpoint === '/api/auth/me') {
      if (authFailure) return route.fulfill({ status: 503, json: { message: 'offline' } });
      body = { user };
    } else if (endpoint === '/api/servers') body = { servers: [{ id: 's', name: 'MVP • QA', ownerId: 'qa' }] };
    else if (endpoint.endsWith('/channels')) body = { channels: [
      { id: 'v', serverId: 's', name: 'Общий', type: 'voice' },
      { id: 't', serverId: 's', name: 'общий', type: 'text' },
      { id: 't2', serverId: 's', name: 'тактика', type: 'text' },
    ] };
    else if (endpoint.endsWith('/members')) body = { members: [user] };
    else if (endpoint.endsWith('/messages')) {
      if (route.request().method() === 'POST') {
        if (messageFailure) return route.fulfill({ status: 500, json: { message: 'Тестовая ошибка доставки' } });
        body = { message: { id: String(Date.now()), channelId: endpoint.split('/')[3], authorId: 'qa', authorNickname: 'Тестировщик', text: route.request().postDataJSON().text, createdAt: new Date().toISOString() } };
        (histories[body.message.channelId] ||= []).push(body.message);
      } else body = { messages: histories[endpoint.split('/')[3]] || [] };
    } else if (endpoint === '/api/livekit/token') {
      if (tokenDelay) await new Promise(r => setTimeout(r, tokenDelay));
      body = { token: 'fixture-token', url: 'wss://fixture.invalid' };
    }
    await route.fulfill({ json: body });
  });
  const record = name => { checks.push(name); console.log('PASS', name); };
  const wait = fn => page.waitForFunction(fn);
  const join = async () => {
    await page.getByTestId('button-voice-v').click();
    await page.getByTestId('voice-toolbar').waitFor();
    await wait(() => window.__rooms?.at(-1)?.publication != null);
  };
  try {
    await page.goto(BASE);
    await join();
    record('join: real browser capture + real AudioWorklet + mocked RTC publication');
    assert.equal(await page.evaluate(() => window.__rooms.at(-1).options.singlePeerConnection), false);
    const roomsBefore = await page.evaluate(() => window.__rooms.length);
    await page.evaluate(() => { location.hash = '/friends'; });
    await page.getByRole('heading', { name: 'Друзья', exact: true }).waitFor();
    await page.getByTestId('voice-toolbar').waitFor();
    assert.equal(await page.evaluate(() => window.__rooms.length), roomsBefore);
    await page.getByLabel('Микрофон', { exact: true }).click();
    assert.equal(await page.getByLabel('Микрофон', { exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByLabel('Микрофон', { exact: true }).click();
    await page.getByRole('link', { name: 'К каналам', exact: false }).click();
    await page.getByTestId('button-voice-v').waitFor();
    record('friends navigation keeps connected room and visible working mute/leave controls');
    await page.getByTestId('voice-mode-quick').selectOption('open');
    await page.getByLabel('Настройки голоса', { exact: true }).click();
    await page.getByTestId('mode-open').waitFor();
    assert.equal(await page.getByTestId('mode-open').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__rooms.length), roomsBefore);
    assert.equal(await page.evaluate(() => window.__rooms.at(-1).disconnects), 0);
    record('settings route preserves room and mode');
    await page.screenshot({ path: path.join(shots, 'settings-desktop.png') });
    await page.getByTestId('button-back').click();
    await page.getByTestId('button-voice-v').waitFor();
    await page.getByTestId('voice-mode-quick').selectOption('ptt');
    await page.keyboard.press('Tab');
    await page.keyboard.down('v');
    await wait(() => document.querySelector('[data-testid="voice-toolbar"]').textContent.includes('Передача открыта'));
    await page.keyboard.up('v');
    await wait(() => document.querySelector('[data-testid="voice-toolbar"]').textContent.includes('Передача закрыта'));
    record('PTT hold keydown/up');
    await page.getByLabel('Способ нажатия').selectOption('toggle');
    await page.keyboard.press('Tab');
    await page.keyboard.press('v');
    await wait(() => document.querySelector('[data-testid="voice-toolbar"]').textContent.includes('Передача открыта'));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await wait(() => document.querySelector('[data-testid="voice-toolbar"]').textContent.includes('Передача закрыта'));
    record('PTT toggle is fail-closed on focus loss');
    await page.getByTestId('voice-mode-quick').selectOption('open');
    await page.getByLabel('Микрофон', { exact: true }).click();
    await page.getByLabel('Выключить звук и микрофон').click();
    await page.getByLabel('Выключить звук и микрофон').click();
    assert.equal(await page.getByLabel('Микрофон', { exact: true }).getAttribute('aria-pressed'), 'true');
    record('deafen restores manual mute instead of opening microphone');
    await page.getByLabel('Микрофон', { exact: true }).click();
    await page.getByTestId('button-channel-t').click();
    await page.getByTestId('input-message').fill('Текст с v и m');
    assert.equal(await page.getByTestId('input-message').inputValue(), 'Текст с v и m');
    await page.getByTestId('button-channel-t2').click();
    assert.equal(await page.getByTestId('input-message').inputValue(), '');
    await page.getByTestId('button-channel-t').click();
    assert.equal(await page.getByTestId('input-message').inputValue(), 'Текст с v и m');
    record('per-channel drafts and no hotkeys while typing');
    messageFailure = true;
    await page.getByTestId('button-send-message').click();
    await page.getByText('Тестовая ошибка доставки').waitFor();
    assert.equal(await page.getByTestId('input-message').inputValue(), 'Текст с v и m');
    messageFailure = false;
    await page.getByTestId('button-send-message').click();
    await wait(() => document.querySelector('[data-testid="input-message"]').value === '');
    record('send failure retains draft and explicit retry succeeds');
    await page.getByTestId('input-message').fill('Первая строка');
    await page.getByTestId('input-message').press('Shift+Enter');
    await page.getByTestId('input-message').pressSequentially('Вторая строка');
    assert.equal(await page.getByTestId('input-message').inputValue(), 'Первая строка\nВторая строка');
    await page.getByTestId('input-message').press('Enter');
    await page.locator('[data-testid^="text-message-"]').filter({ hasText: 'Вторая строка' }).waitFor();
    await wait(() => document.querySelector('[data-testid="input-message"]').value === '');
    assert.equal(await page.getByTestId('input-message').inputValue(), '');
    record('Shift+Enter retains newline; Enter sends multiline message');
    assert.ok(chatSocket, 'chat realtime socket connected');
    const incoming = i => {
      const data = { id: `incoming-${i}`, channelId: 't', authorId: 'friend', authorNickname: 'Друг', text: `Сообщение друга ${i}`, createdAt: new Date().toISOString() };
      (histories.t ||= []).push(data);
      return { type: 'message', data };
    };
    for (let i = 0; i < 60; i++) chatSocket.send(JSON.stringify(incoming(i)));
    await page.getByTestId('text-message-incoming-59').waitFor();
    const history = page.getByTestId('message-history');
    await history.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
    chatSocket.send(JSON.stringify(incoming(60)));
    await page.getByTestId('jump-new-messages').waitFor();
    assert.equal(await history.evaluate(el => el.scrollTop), 0);
    await page.getByTestId('jump-new-messages').click();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="message-history"]');
      return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    });
    await page.screenshot({ path: path.join(shots, 'chat-desktop.png') });
    record('incoming realtime messages do not jump while reading; new-message button returns to bottom');
    await page.evaluate(() => window.__rooms.at(-1).emit('Reconnecting'));
    await page.getByText('Восстанавливаем голосовое соединение').waitFor();
    await page.evaluate(() => window.__rooms.at(-1).emit('Reconnected'));
    await page.getByTestId('button-voice-v').click();
    record('reconnect state and recovery');
    await page.getByTestId('voice-invite-tile').waitFor();
    await page.getByTestId('voice-card-qa').click();
    await page.getByText('Настройки своего микрофона', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(shots, 'lab-voice-desktop.png') });
    record('Design Lab wide participant tile, invitation tile and keyboard-dismissable profile');
    await page.evaluate(() => window.__rooms.at(-1).emit('Reconnecting'));
    await page.waitForTimeout(21_000);
    await page.getByText('Голосовое соединение прервано', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__streams.some(s => s.getTracks().some(t => t.readyState === 'live'))), false);
    await page.screenshot({ path: path.join(shots, 'reconnect-terminal.png') });
    await page.getByText('Повторить подключение', { exact: true }).click();
    await wait(() => window.__rooms.at(-1).publication != null);
    record('reconnect deadline ends in honest failure, releases microphone and explicit retry rejoins');
    await page.evaluate(() => {
      const track = window.__streams.at(-1).getAudioTracks()[0];
      track.stop(); track.dispatchEvent(new Event('ended'));
    });
    await page.getByText('Микрофон отключён', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(shots, 'device-lost.png') });
    await page.getByText('Повторить с этим микрофоном').click();
    await page.getByText('Микрофон отключён', { exact: true }).waitFor({ state: 'hidden' });
    record('device loss closes transmission and explicit retry recovers');
    await page.getByLabel('Выйти из голоса', { exact: true }).click();
    assert.equal(await page.evaluate(() => window.__streams.some(s => s.getTracks().some(t => t.readyState === 'live'))), false);
    record('leave releases capture tracks');
    await page.evaluate(() => { window.__denyMic = true; });
    await page.getByTestId('button-voice-v').click();
    await page.getByText('Ты только слушаешь', { exact: true }).waitFor();
    await page.evaluate(() => { window.__denyMic = false; });
    await page.getByText('Повторить с этим микрофоном').click();
    await wait(() => window.__rooms.at(-1).publication != null);
    record('permission denial keeps listen-only room; retry publishes without reconnect');
    await page.getByLabel('Выйти из голоса', { exact: true }).click();
    await page.evaluate(() => { window.__failPublish = true; });
    await page.getByTestId('button-voice-v').click();
    await page.getByText('Не удалось отправить звук', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__streams.some(s => s.getTracks().some(t => t.readyState === 'live'))), false);
    await page.getByText('Технические подробности', { exact: true }).click();
    assert.match(await page.getByTestId('voice-diagnostic').textContent(), /publish/);
    assert.match(await page.getByTestId('voice-diagnostic').textContent(), /publication timeout/);
    await page.screenshot({ path: path.join(shots, 'voice-publication-diagnostic.png') });
    await page.evaluate(() => { window.__failPublish = false; });
    await page.getByText('Совместимое + TCP/TLS', { exact: true }).click();
    await wait(() => window.__rooms.at(-1).publication != null);
    assert.equal(await page.evaluate(() => window.__rooms.at(-1).connectOptions.rtcConfig.iceTransportPolicy), 'relay');
    assert.equal(await page.evaluate(() => window.__rooms.at(-1).options.singlePeerConnection), false);
    record('publication diagnostics identify publish stage and explicit TURN reconnect uses relay policy');
    await page.getByLabel('Выйти из голоса', { exact: true }).click();
    await page.evaluate(() => { window.__micDelay = 900; });
    await page.getByTestId('button-voice-v').click();
    await wait(() => window.__rooms.at(-1).publication == null);
    await page.getByLabel('Отменить подключение').click();
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await page.evaluate(() => window.__streams.some(s => s.getTracks().some(t => t.readyState === 'live'))), false);
    await page.evaluate(() => { window.__micDelay = 0; });
    record('cancel while permission pending stops late-arriving capture');
    tokenDelay = 1000;
    await page.getByTestId('button-voice-v').click();
    await page.getByLabel('Отменить подключение').click();
    // Real delayed token completion: check it cannot resurrect a cancelled room.
    await new Promise(r => setTimeout(r, 1300));
    assert.equal(await page.getByTestId('voice-toolbar').count(), 0);
    tokenDelay = 0;
    record('cancel token request never resurrects room');
    await page.evaluate(() => { window.__silence = true; });
    await page.evaluate(async () => {
      const { VoiceEngine } = await import('/src/lib/voice.ts');
      const original = VoiceEngine.prototype.sample;
      VoiceEngine.prototype.sample = function(...args) {
        original.apply(this, args);
        window.__diagnosticDebug = { ...this.state, room: undefined, devices: undefined, participants: undefined, silenceSince: this.silenceSince };
      };
    });
    await join();
    await page.getByTestId('voice-mode-quick').selectOption('open');
    // Silence diagnosis intentionally tested at the real production 30-second threshold.
    try {
      await page.getByText('Тебя не слышно? Проверь микрофон', { exact: true }).waitFor({ timeout: 38000 });
    } catch (e) {
      console.log('DIAGNOSTIC DEBUG', await page.evaluate(() => window.__diagnosticDebug));
      console.log('UI', await page.locator('body').innerText());
      throw e;
    }
    await page.screenshot({ path: path.join(shots, 'no-signal.png') });
    await page.getByText('Я просто молчу').click();
    await page.getByText('Тебя не слышно? Проверь микрофон', { exact: true }).waitFor({ state: 'hidden' });
    record('30-second real silent capture produces cautious diagnosis, dismiss works');
    await page.getByLabel('Настройки голоса', { exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(shots, 'settings-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    record('settings mobile viewport fit');
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.reload();
    await page.getByTestId('mode-open').waitFor();
    assert.equal(await page.getByTestId('mode-open').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByTestId('voice-toolbar').count(), 0);
    record('reload retains mode but does not reconnect/unmute automatically');
    authFailure = true;
    await page.reload();
    await page.getByText('Не удалось проверить подключение').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('egv.token')), 'local-test-only');
    authFailure = false;
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await page.getByTestId('mode-open').waitFor();
    record('offline auth retains token and retries instead of logging user out');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
    fs.writeFileSync(path.join(__dirname, 'voice-ui-result.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exit(1); });
