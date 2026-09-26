// Real installed Tauri/WebView2 + real temporary backend/LiveKit.
// Synthetic microphone only. Never records or exports user tokens/SDP/addresses.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const { SignalRequest, SignalResponse } = await import('@livekit/protocol');
  const out = path.resolve('windows-diagnostics');
  fs.mkdirSync(out, { recursive: true });
  const report = { version: require('../package.json').version, native: true, syntheticMicrophone: true, attempts: [] };
  const exe = path.join(process.env.RUNNER_TEMP, 'egvoice-installed', 'eg-voice.exe');
  assert.ok(fs.existsSync(exe), 'installed executable exists');
  const app = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: path.join(process.env.RUNNER_TEMP, 'egvoice-voice-qa'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required',
    }, stdio: 'ignore',
  });
  let browser;
  const redact = text => String(text).replace(/(?:https?|wss?):\/\/\S+/g, '[url]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]').slice(0, 700);
  try {
    for (let i = 0; i < 60; i++) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); break; }
      catch { await new Promise(r => setTimeout(r, 500)); }
    }
    assert.ok(browser, 'WebView2 debugging endpoint became available');
    const context = browser.contexts()[0];
    let page;
    for (let i = 0; i < 40; i++) {
      page = context.pages().find(p => /tauri\.localhost|tauri:/.test(p.url()));
      if (page) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(page, 'native application page found');
    await page.addInitScript(() => {
      window.__qaPeerConnections = [];
      window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
        construct(Target, args) {
          const pc = new Target(...args); window.__qaPeerConnections.push(pc); return pc;
        },
      });
    });
    const api = process.env.VITE_API_URL;
    const password = randomUUID() + randomUUID();
    const auth = await page.evaluate(async ({ api, password, id }) => {
      const r = await fetch(api + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `native-voice-${id}@example.test`, nickname: 'Native voice QA', password }),
      });
      if (!r.ok) throw new Error(`QA registration HTTP ${r.status}`);
      const auth = await r.json();
      localStorage.setItem('egv.token', auth.token);
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
      const created = await fetch(api + '/api/servers', { method: 'POST', headers, body: JSON.stringify({ name: 'Native isolated voice QA' }) });
      if (!created.ok) throw new Error(`QA server HTTP ${created.status}`);
      const { server } = await created.json();
      const channels = await fetch(api + `/api/servers/${server.id}/channels`, { headers });
      const { channels: list } = await channels.json();
      return { channelId: list.find(c => c.type === 'voice').id };
    }, { api, password, id: randomUUID() });
    for (const mode of ['auto', 'relay']) {
      const attempt = { mode, signals: [], publication: false };
      report.attempts.push(attempt);
      await page.evaluate(mode => {
        localStorage.setItem('egv.voice.v1', JSON.stringify({ mode: 'open', networkMode: mode, inputId: 'default' }));
        location.hash = '/';
      }, mode);
      await page.reload();
      await page.getByTestId(`button-voice-${auth.channelId}`).waitFor({ timeout: 30000 });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      const signalIds = new Set();
      cdp.on('Network.webSocketCreated', e => {
        try { if (new URL(e.url).pathname.includes('/rtc')) signalIds.add(e.requestId); } catch {}
      });
      const frame = (direction, e) => {
        if (!signalIds.has(e.requestId) || e.response.opcode !== 2) return;
        try {
          const proto = direction === 'sent' ? SignalRequest : SignalResponse;
          const decoded = proto.fromBinary(Buffer.from(e.response.payloadData, 'base64'));
          const msg = decoded.message;
          if (!msg?.case) return;
          const entry = { direction, type: msg.case, at: Date.now() };
          if (msg.case === 'join') {
            entry.serverVersion = msg.value.serverInfo?.version || msg.value.serverVersion;
            entry.canPublish = msg.value.participant?.permission?.canPublish;
            entry.subscriberPrimary = msg.value.subscriberPrimary;
          }
          if (attempt.signals.length < 100) attempt.signals.push(entry);
        } catch {}
      };
      cdp.on('Network.webSocketFrameSent', e => frame('sent', e));
      cdp.on('Network.webSocketFrameReceived', e => frame('received', e));
      await page.getByTestId(`button-voice-${auth.channelId}`).click();
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-testid="voice-toolbar"]')?.textContent || '';
        return text.includes('Передача открыта') || !!document.querySelector('[data-testid="voice-diagnostic"]');
      }, null, { timeout: 60000 });
      attempt.publication = await page.getByTestId('voice-toolbar').textContent().then(t => t.includes('Передача открыта'));
      attempt.diagnostic = redact(await page.getByTestId('voice-diagnostic').textContent({ timeout: 500 }).catch(() => ''));
      attempt.peers = await page.evaluate(async () => Promise.all(window.__qaPeerConnections.map(async pc => {
        const result = { connection: pc.connectionState, ice: pc.iceConnectionState, signaling: pc.signalingState, outboundAudioPackets: 0 };
        const stats = await pc.getStats();
        for (const stat of stats.values()) {
          if (stat.type === 'outbound-rtp' && stat.kind === 'audio') result.outboundAudioPackets += stat.packetsSent || 0;
          if (stat.type === 'transport' && stat.selectedCandidatePairId) {
            const pair = stats.get(stat.selectedCandidatePairId);
            const local = stats.get(pair?.localCandidateId);
            const remote = stats.get(pair?.remoteCandidateId);
            result.localType = local?.candidateType; result.remoteType = remote?.candidateType;
            result.protocol = local?.protocol;
          }
        }
        return result;
      })));
      await page.getByLabel('Выйти из голоса', { exact: true }).click().catch(() => {});
      await cdp.detach();
    }
    assert.ok(report.attempts.every(a => a.publication), 'native audio publication succeeds in auto and relay');
  } catch (error) {
    report.error = redact(error.message);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, 'native-voice-result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser?.close().catch(() => {});
    if (app.pid) {
      try { execFileSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
    }
  }
})();
