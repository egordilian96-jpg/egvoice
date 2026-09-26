import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeSettings, DEFAULT_VOICE_SETTINGS as defaults, wantsTransmission, mediaError } from '../client/src/lib/voice-policy';
import { safeVoiceError } from '../client/src/lib/voice-diagnostics';
import { routeRtcConfiguration, monitorRtcTransport } from '../client/src/lib/rtc-transport';

test('RTC history survives closed peers, contains no candidates/credentials, restores constructor', async () => {
  class Peer extends EventTarget {
    connectionState = 'new'; iceConnectionState = 'new'; signalingState = 'stable';
    setConfiguration() {}
    async getStats() { return new Map([['candidate', { type: 'local-candidate', address: '192.168.1.55', username: 'secret' }]]); }
  }
  const previous = globalThis.window;
  (globalThis as any).window = { RTCPeerConnection: Peer };
  try {
    const monitor = monitorRtcTransport('auto');
    const peer = new window.RTCPeerConnection() as unknown as Peer;
    peer.connectionState = 'connecting'; peer.dispatchEvent(new Event('connectionstatechange'));
    peer.iceConnectionState = 'failed'; peer.dispatchEvent(new Event('iceconnectionstatechange'));
    peer.connectionState = 'closed'; peer.dispatchEvent(new Event('connectionstatechange'));
    const result = (await monitor.summary()).join('\n');
    assert.match(result, /connection=connecting/);
    assert.match(result, /ice=failed/);
    assert.ok(!result.includes('192.168') && !result.includes('secret'));
    monitor.stop();
    assert.equal(window.RTCPeerConnection, Peer);
  } finally {
    if (previous) (globalThis as any).window = previous;
    else delete (globalThis as any).window;
  }
});

test('TCP-only routing retains advertised credentials, rejects UDP and does not invent servers', () => {
  const result = routeRtcConfiguration({ iceServers: [{ urls: ['stun:example.test', 'turn:example.test?transport=udp', 'turn:example.test?transport=tcp', 'turns:example.test:443', 'turns:example.test?transport=udp'], username: 'user', credential: 'test-only' }] }, 'relay-tcp');
  assert.equal(result.iceTransportPolicy, 'relay');
  assert.deepEqual(result.iceServers?.[0].urls, ['turn:example.test?transport=tcp', 'turns:example.test:443']);
  assert.equal(result.iceServers?.[0].credential, 'test-only');
  assert.throws(() => routeRtcConfiguration({ iceServers: [{ urls: 'turn:example.test?transport=udp' }] }, 'relay-tcp'), /TURN_TCP_UNAVAILABLE/);
  assert.deepEqual(routeRtcConfiguration({}, 'relay-tcp'), { iceTransportPolicy: 'relay' });
  assert.equal(normalizeSettings({}).connectionMode, 'compatible');
});

test('diagnostics remove URLs, tokens and IP addresses', () => {
  const result = safeVoiceError(new Error('Failed wss://example.com/rtc?token=secret 192.168.1.1 eyJabc.def.ghi'));
  assert.ok(!result.includes('secret') && !result.includes('192.168') && !result.includes('eyJabc'));
});
test('network mode accepts relay only explicitly', () => {
  assert.equal(normalizeSettings({}).networkMode, 'auto');
  assert.equal(normalizeSettings({ networkMode: 'relay' }).networkMode, 'relay');
});

test('settings reject corrupt values, clamp numbers and preserve valid modes', () => {
  assert.equal(normalizeSettings({ threshold: NaN }).threshold, -42);
  assert.equal(normalizeSettings({ threshold: 50 }).threshold, -10);
  assert.equal(normalizeSettings({ threshold: -999 }).threshold, -80);
  assert.equal(normalizeSettings({ releaseMs: 9999 }).releaseMs, 1000);
  assert.equal(normalizeSettings({ mode: 'bad' as any }).mode, 'vad');
  assert.equal(normalizeSettings({ pttKind: 'toggle' }).pttKind, 'toggle');
});
test('manual mute/deafen override every transmission mode', () => {
  for (const mode of ['vad', 'open', 'ptt'] as const) {
    assert.equal(wantsTransmission({ ...defaults, mode }, true, false, true), false);
    assert.equal(wantsTransmission({ ...defaults, mode }, false, true, true), false);
  }
  assert.equal(wantsTransmission({ ...defaults, mode: 'ptt' }, false, false, false), false);
  assert.equal(wantsTransmission({ ...defaults, mode: 'ptt' }, false, false, true), true);
});
test('permission, missing, busy and constraints have separate recovery copy', () => {
  assert.match(mediaError({ name: 'NotAllowedError' }), /запрещён/);
  assert.match(mediaError({ name: 'NotFoundError' }), /не найден/);
  assert.match(mediaError({ name: 'NotReadableError' }), /другой программой/);
  assert.match(mediaError({ name: 'OverconstrainedError' }), /другое устройство/);
});
function gate() {
  let Processor: any;
  vm.runInNewContext(fs.readFileSync(new URL('../client/src/lib/voice-worklet.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: class { port = { onmessage: null, postMessage() {} }; },
    sampleRate: 48000, registerProcessor(_name: string, type: unknown) { Processor = type; },
  });
  const p = new Processor();
  return {
    set: (c: any) => p.port.onmessage({ data: { ...defaults, enabled: true, ...c } }),
    run: (amplitude: number, blocks = 1) => {
      let out = new Float32Array(128);
      for (let i = 0; i < blocks; i++) p.process([[new Float32Array(128).fill(amplitude)]], [[out]]);
      return Math.max(...out.map(Math.abs));
    },
  };
}
test('audio worklet defaults to silence (privacy before publication)', () => {
  assert.equal(gate().run(.3, 100), 0);
});
test('VAD opens on loud signal, holds tail, closes below threshold', () => {
  const p = gate(); p.set({ mode: 'vad', threshold: -42, releaseMs: 200 });
  assert.equal(p.run(.001, 100), 0);
  assert.ok(p.run(.1, 10) > .09);
  assert.ok(p.run(.001, 10) > 0);
  assert.equal(p.run(.001, 100), 0);
});
test('always-on passes quiet signal; PTT disabled never transmits', () => {
  const p = gate(); p.set({ mode: 'open' });
  assert.ok(p.run(.001, 10) > 0);
  p.set({ mode: 'ptt', enabled: false }); assert.equal(p.run(.3, 100), 0);
  p.set({ mode: 'ptt', enabled: true }); assert.ok(p.run(.3, 10) > .29);
  p.set({ mode: 'ptt', enabled: false }); assert.equal(p.run(.3), 0);
});
