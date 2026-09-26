import { createContext, createElement, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Room, RoomEvent, Track, LocalAudioTrack, type RemoteAudioTrack, type Participant } from 'livekit-client';
import { api, ApiError } from './api';
import { DEFAULT_VOICE_SETTINGS, normalizeSettings, wantsTransmission, mediaError, type VoiceSettings } from './voice-policy';
import workletUrl from './voice-worklet.js?url';
import { localStore } from './storage';
import { safeVoiceError, publishErrorText, type VoiceStep } from './voice-diagnostics';
import { monitorRtcTransport } from './rtc-transport';

export type VoiceParticipant = {
  identity: string; name: string; isLocal: boolean; isSpeaking: boolean; isMicMuted: boolean;
  audioLevel: number; audioTrack: LocalAudioTrack | RemoteAudioTrack | null;
  connectionQuality?: string; listenOnly?: boolean;
};
type Phase = 'idle' | 'token' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
type Capture = { stream: MediaStream; ctx: AudioContext; source: MediaStreamAudioSourceNode; gate: AudioWorkletNode; dest: MediaStreamAudioDestinationNode; published: LocalAudioTrack };
const SETTINGS_KEY = 'egv.voice.v1';
export class VoiceEngine {
  private listeners = new Set<() => void>();
  private epoch = 0;
  private captureEpoch = 0;
  private capture: Capture | null = null;
  private pendingCapture: Capture | null = null;
  private ptt = false;
  private silenceSince = 0;
  private suppressUntil = 0;
  private testing = false;
  private disposed = false;
  private audio = new Map<RemoteAudioTrack, HTMLAudioElement>();
  private diagnosticStart = 0;
  private diagnosticEvents: string[] = [];
  private rtcMonitor: ReturnType<typeof monitorRtcTransport> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  state = {
    room: null as Room | null, connectedChannelId: null as string | null, targetChannelId: null as string | null,
    participants: [] as VoiceParticipant[], micMuted: false, outputMuted: false, connecting: false,
    phase: 'idle' as Phase, error: null as string | null,
    settings: { ...DEFAULT_VOICE_SETTINGS }, devices: [] as MediaDeviceInfo[],
    permission: false, deviceBusy: false, inputLabel: '', levelDb: -120, transmitting: false,
    noSignal: false, deviceLost: false, listenOnly: false, audioBlocked: false, processingPaused: false,
    storageWarning: false, testing: false,
    voiceStep: 'idle' as VoiceStep, diagnostic: '', publicationFailed: false,
    participantVolumes: {} as Record<string, number>,
  };
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.state;
  private emit(patch: Partial<typeof this.state>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => fn());
  }
  private step(value: VoiceStep) {
    this.diagnosticEvents.push(`${Math.round(performance.now() - this.diagnosticStart)}ms ${value}`);
    this.diagnosticEvents = this.diagnosticEvents.slice(-24);
    this.emit({ voiceStep: value });
  }
  private async failure(err: unknown) {
    const epoch = this.epoch, captureEpoch = this.captureEpoch;
    const trace = [...this.diagnosticEvents, `${Math.round(performance.now() - this.diagnosticStart)}ms failed`];
    const rtc = await this.rtcMonitor?.summary() ?? [];
    if (epoch !== this.epoch || captureEpoch !== this.captureEpoch) return;
    this.emit({ diagnostic: [
      'EG Voice 0.2.4',
      `route=${this.state.settings.networkMode}`,
      `connection=${this.state.settings.connectionMode}`,
      ...trace, ...rtc,
      safeVoiceError(err),
    ].join('\n') });
  }
  private async endFailed(err: unknown, message: string) {
    const epoch = this.epoch;
    // Close the gate immediately; collect evidence before destroying the room.
    this.emit({ phase: 'failed', transmitting: false }); this.applyGate();
    await this.failure(err);
    if (epoch !== this.epoch) return;
    const channel = this.state.connectedChannelId || this.state.targetChannelId;
    void this.leave();
    this.emit({ phase: 'failed', targetChannelId: channel, error: message });
  }
  start() {
    this.disposed = false;
    try { this.emit({ settings: normalizeSettings(JSON.parse(localStore.getItem(SETTINGS_KEY) || '{}')) }); }
    catch { /* Invalid or unavailable storage: safe defaults. */ }
    navigator.mediaDevices?.addEventListener('devicechange', this.refreshDevices);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releasePtt);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('beforeunload', this.beforeUnload);
    void this.refreshDevices();
  }
  dispose() {
    void this.leave();
    this.disposed = true;
    navigator.mediaDevices?.removeEventListener('devicechange', this.refreshDevices);
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.releasePtt);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('beforeunload', this.beforeUnload);
    this.listeners.clear();
  }
  private beforeUnload = (e: BeforeUnloadEvent) => {
    if (this.state.room || this.state.connecting) { e.preventDefault(); e.returnValue = ''; }
  };
  private visibility = () => { if (document.hidden) this.releasePtt(); };
  private isTyping(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    return !!el?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
  }
  private keyDown = (e: KeyboardEvent) => {
    if (!this.state.room || e.repeat || e.isComposing || this.isTyping(e)) return;
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); this.toggleOutput(); return; }
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyX') { e.preventDefault(); void this.leave(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.code === 'KeyM') { e.preventDefault(); this.toggleMic(); }
    if (e.code === 'KeyV' && this.state.settings.mode === 'ptt') {
      e.preventDefault();
      this.ptt = this.state.settings.pttKind === 'hold' || !this.ptt;
      this.applyGate();
    }
  };
  private keyUp = (e: KeyboardEvent) => {
    if (e.code === 'KeyV' && this.state.settings.pttKind === 'hold') this.releasePtt();
  };
  releasePtt = () => { this.ptt = false; this.applyGate(); };
  pressPtt = () => {
    if (this.state.settings.mode !== 'ptt') return;
    this.ptt = this.state.settings.pttKind === 'hold' || !this.ptt;
    this.applyGate();
  };
  private applyGate() {
    const s = this.state;
    const enabled = s.phase === 'connected' && !s.deviceBusy && !s.deviceLost && !s.listenOnly && !s.processingPaused
      && wantsTransmission(s.settings, s.micMuted, s.outputMuted, this.ptt);
    this.capture?.gate.port.postMessage({ ...s.settings, enabled });
    if (!enabled) {
      this.silenceSince = 0;
      if (s.transmitting || s.noSignal) this.emit({ transmitting: false, noSignal: false });
    }
  }
  updateSettings = (patch: Partial<VoiceSettings>) => {
    const settings = normalizeSettings({ ...this.state.settings, ...patch });
    if (settings.mode !== this.state.settings.mode || settings.pttKind !== this.state.settings.pttKind) this.ptt = false;
    this.silenceSince = 0;
    this.emit({ settings, noSignal: false });
    try { if (!localStore.setItem(SETTINGS_KEY, JSON.stringify(settings))) this.emit({ storageWarning: true }); }
    catch { this.emit({ storageWarning: true }); }
    this.applyGate();
  };
  refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      if (!devices) return;
      this.emit({ devices: devices.filter(d => d.kind === 'audioinput'), permission: devices.some(d => d.kind === 'audioinput' && !!d.label) });
      const id = this.capture?.stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (id && !devices.some(d => d.deviceId === id)) this.lostDevice();
    } catch { /* No fabricated device names or permission assertions. */ }
  };
  private closeCapture(c: Capture | null) {
    if (!c) return;
    c.gate.port.onmessage = null; c.gate.disconnect(); c.source.disconnect();
    c.stream.getTracks().forEach(t => t.stop());
    c.published.stop(); void c.ctx.close().catch(() => {});
  }
  private lostDevice() {
    if (this.state.deviceLost) return;
    this.ptt = false;
    this.emit({ deviceLost: true, transmitting: false, noSignal: false });
    this.applyGate();
  }
  private async buildCapture(settings: VoiceSettings): Promise<Capture> {
    this.step('capture');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPS required');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: settings.inputId === 'default' ? undefined : { exact: settings.inputId },
        echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl, channelCount: 1,
      },
    });
    let ctx: AudioContext | undefined;
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      this.step('worklet');
      await ctx.audioWorklet.addModule(workletUrl);
      this.step('resume');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([ctx.resume(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('AudioContext resume timeout')), 8000);
        })]);
      } finally { clearTimeout(timer); }
      if (ctx.state !== 'running') throw new Error('AudioContext suspended');
      const source = ctx.createMediaStreamSource(stream);
      const gate = new AudioWorkletNode(ctx, 'eg-voice-gate', { outputChannelCount: [1] });
      const dest = ctx.createMediaStreamDestination();
      source.connect(gate).connect(dest);
      const published = new LocalAudioTrack(dest.stream.getAudioTracks()[0], undefined, true);
      return { stream, ctx, source, gate, dest, published };
    } catch (err) {
      stream.getTracks().forEach(t => t.stop()); void ctx?.close().catch(() => {});
      throw err;
    }
  }
  private sample(c: Capture, data: { db: number; open: boolean }) {
    if (this.capture !== c) return;
    const s = this.state;
    const eligible = s.phase === 'connected' && !s.deviceBusy && !s.deviceLost && !s.listenOnly
      && !s.micMuted && !s.outputMuted && s.settings.mode !== 'ptt' && c.ctx.state === 'running';
    const now = performance.now();
    if (eligible && data.db < -75) this.silenceSince ||= now;
    else this.silenceSince = 0;
    this.emit({
      levelDb: data.db, transmitting: s.phase === 'connected' && !s.deviceBusy && !s.deviceLost && !s.listenOnly && !s.processingPaused
        && wantsTransmission(s.settings, s.micMuted, s.outputMuted, this.ptt) && data.open,
      noSignal: !!this.silenceSince && now - this.silenceSince >= 30_000 && now > this.suppressUntil,
    });
    this.rebuild();
  }
  private async acquire(settings: VoiceSettings, resetDiagnostic = true) {
    if (this.state.deviceBusy) return false;
    const operation = ++this.captureEpoch, epoch = this.epoch, room = this.state.room;
    if (resetDiagnostic) { this.diagnosticStart = performance.now(); this.diagnosticEvents = []; }
    this.emit({ deviceBusy: true, error: null, noSignal: false, diagnostic: '', publicationFailed: false }); this.applyGate();
    let c: Capture | null = null;
    try {
      c = await this.buildCapture(settings);
      if (operation !== this.captureEpoch || epoch !== this.epoch || this.disposed) { this.closeCapture(c); return false; }
      this.pendingCapture = c;
      const previous = this.capture;
      // Do not publish a second microphone. Gate is closed until commit succeeds.
      if (room) {
        this.step('publish');
        if (previous) await room.localParticipant.unpublishTrack(previous.published, false);
        await room.localParticipant.publishTrack(c.published, { source: Track.Source.Microphone });
      }
      if (operation !== this.captureEpoch || epoch !== this.epoch || this.disposed) { this.closeCapture(c); return false; }
      this.capture = c; this.closeCapture(previous);
      c.stream.getAudioTracks()[0].addEventListener('ended', () => { if (this.capture === c) this.lostDevice(); });
      c.ctx.onstatechange = () => {
        if (this.capture !== c) return;
        this.emit({ processingPaused: c!.ctx.state !== 'running', transmitting: false });
        this.releasePtt();
      };
      c.gate.port.onmessage = ({ data }) => this.sample(c!, data);
      this.updateSettings({
        inputId: settings.inputId, echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl,
      });
      this.emit({ inputLabel: c.stream.getAudioTracks()[0].label || 'Микрофон', permission: true, listenOnly: false, deviceLost: false, processingPaused: false });
      this.silenceSince = 0;
      await this.refreshDevices();
      this.step('ready');
      return true;
    } catch (err) {
      this.closeCapture(c);
      if (epoch !== this.epoch || operation !== this.captureEpoch) return false;
      // A failed replacement never silently returns to an unpublished microphone.
      this.closeCapture(this.capture); this.capture = null;
      const publicationFailed = this.state.voiceStep === 'publish';
      if (publicationFailed && this.state.phase === 'reconnecting') {
        await this.endFailed(err, 'Связь с голосовым сервером оборвалась во время отправки звука. Микрофон закрыт. Чат остаётся доступен.');
        return false;
      }
      await this.failure(err);
      if (epoch !== this.epoch || operation !== this.captureEpoch) return false;
      this.emit({ error: publicationFailed ? publishErrorText() : `${mediaError(err)}${room ? ' Канал открыт в режиме слушателя.' : ''}`, publicationFailed, listenOnly: !!room, transmitting: false });
      return false;
    } finally {
      if (this.pendingCapture === c) this.pendingCapture = null;
      if (epoch === this.epoch && operation === this.captureEpoch) {
        this.emit({ deviceBusy: false }); this.applyGate(); this.syncMute();
      }
    }
  }
  requestMicrophone = async () => {
    this.testing = !this.state.room;
    this.emit({ testing: this.testing });
    await this.acquire(this.state.settings);
  };
  stopTest = () => {
    if (this.state.room) return;
    ++this.captureEpoch;
    this.testing = false; this.closeCapture(this.capture); this.capture = null;
    this.emit({ testing: false, deviceBusy: false, levelDb: -120, noSignal: false, processingPaused: false });
  };
  changeInput = async (inputId: string) => {
    const settings = normalizeSettings({ ...this.state.settings, inputId });
    if (this.capture || this.state.room) await this.acquire(settings);
    else this.updateSettings(settings);
  };
  changeProcessing = async (patch: Partial<VoiceSettings>) => {
    const settings = normalizeSettings({ ...this.state.settings, ...patch });
    if (this.capture) await this.acquire(settings);
    else this.updateSettings(settings);
  };
  retryWithRelay = async () => {
    const channel = this.state.connectedChannelId || this.state.targetChannelId;
    if (!channel || this.state.connecting || this.state.deviceBusy) return;
    this.updateSettings({ networkMode: 'relay' });
    await this.leave();
    await this.joinChannel(channel);
  };
  retryCompatibleTcp = async () => {
    const channel = this.state.connectedChannelId || this.state.targetChannelId;
    if (!channel || this.state.connecting || this.state.deviceBusy) return;
    this.updateSettings({ networkMode: 'relay-tcp', connectionMode: 'compatible' });
    await this.leave();
    await this.joinChannel(channel);
  };
  retry = async () => {
    const channel = this.state.connectedChannelId || this.state.targetChannelId;
    if (!channel || this.state.connecting || this.state.deviceBusy) return;
    await this.leave();
    await this.joinChannel(channel);
  };
  joinChannel = async (channelId: string) => {
    if (this.state.connecting || this.state.connectedChannelId === channelId) return;
    await this.leave();
    const epoch = ++this.epoch;
    this.diagnosticStart = performance.now(); this.diagnosticEvents = [];
    this.step('token');
    this.emit({ phase: 'token', connecting: true, targetChannelId: channelId, error: null });
    let r: Room | null = null;
    try {
      const { token, url } = await api.post<{ token: string; url: string }>('/api/livekit/token', { channelId });
      if (epoch !== this.epoch || this.disposed) return;
      this.rtcMonitor = monitorRtcTransport(this.state.settings.networkMode);
      r = new Room({ adaptiveStream: true, dynacast: true, singlePeerConnection: this.state.settings.connectionMode === 'standard' });
      this.emit({ room: r, phase: 'connecting' });
      this.wire(r, epoch);
      this.step('connect');
      await r.connect(url, token, {
        peerConnectionTimeout: 20000, websocketTimeout: 15000,
        rtcConfig: this.state.settings.networkMode !== 'auto' ? { iceTransportPolicy: 'relay' } : undefined,
      });
      if (epoch !== this.epoch || this.disposed) { await r.disconnect(); return; }
      this.emit({ phase: 'connected', connectedChannelId: channelId });
      await this.acquire(this.state.settings, false);
      this.rebuild();
    } catch (err) {
      if (epoch === this.epoch) {
        await this.failure(err);
        if (epoch !== this.epoch) return;
        this.emit({ phase: 'failed', error: err instanceof ApiError ? err.message : 'Не удалось подключить голос. Проверь интернет и повтори. Если чат работает, проблема может быть в голосовом сервере или передаче медиа; точная причина пока неизвестна.', room: null, connectedChannelId: null });
        this.clearAudio(); this.closeCapture(this.capture); this.capture = null;
      }
      await r?.disconnect().catch(() => {});
      if (epoch === this.epoch) { this.rtcMonitor?.stop(); this.rtcMonitor = null; }
    } finally { if (epoch === this.epoch) this.emit({ connecting: false }); }
  };
  leave = async () => {
    clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
    ++this.epoch; ++this.captureEpoch;
    const r = this.state.room;
    const monitor = this.rtcMonitor; this.rtcMonitor = null; monitor?.stop();
    this.closeCapture(this.pendingCapture); this.pendingCapture = null;
    this.ptt = false; this.testing = false; this.silenceSince = 0;
    this.closeCapture(this.capture); this.capture = null; this.clearAudio();
    this.emit({ room: null, connectedChannelId: null, targetChannelId: null, participants: [], connecting: false,
      phase: 'idle', deviceBusy: false, noSignal: false, deviceLost: false, listenOnly: false, transmitting: false,
      testing: false, processingPaused: false, audioBlocked: false, levelDb: -120, error: null });
    this.emit({ voiceStep: 'idle', publicationFailed: false });
    await r?.disconnect().catch(() => {});
  };
  private wire(r: Room, epoch: number) {
    const current = () => epoch === this.epoch && r === this.state.room;
    const event = (name: string) => {
      this.diagnosticEvents.push(`${Math.round(performance.now() - this.diagnosticStart)}ms ${name}`);
      this.diagnosticEvents = this.diagnosticEvents.slice(-24);
    };
    r.on(RoomEvent.SignalConnected, () => { if (current()) event('signal-connected'); });
    const refresh = () => { if (current()) this.rebuild(); };
    [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
      RoomEvent.ActiveSpeakersChanged, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ConnectionQualityChanged].forEach(ev => r.on(ev, refresh));
    r.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (!current() || track.kind !== Track.Kind.Audio) return;
      const t = track as RemoteAudioTrack, el = t.attach();
      el.muted = this.state.outputMuted; el.volume = this.state.participantVolumes[participant?.identity] ?? 1;
      el.style.display = 'none'; document.body.appendChild(el);
      this.audio.set(t, el);
      void el.play().catch(() => { if (current()) this.emit({ audioBlocked: true }); }); refresh();
    });
    r.on(RoomEvent.TrackUnsubscribed, track => {
      const t = track as RemoteAudioTrack, el = this.audio.get(t);
      if (el) { t.detach(el); el.remove(); this.audio.delete(t); } refresh();
    });
    r.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (current()) this.emit({ audioBlocked: !r.canPlaybackAudio }); });
    r.on(RoomEvent.Reconnecting, () => {
      if (!current()) return;
      event('reconnecting');
      this.emit({ phase: 'reconnecting', noSignal: false, transmitting: false }); this.releasePtt();
      // Do not reset the deadline for repeated SDK reconnect notifications.
      if (!this.reconnectTimer) this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        if (current()) void this.endFailed(new Error('Reconnect deadline exceeded (20s)'),
          'Не удалось восстановить голос за 20 секунд. Микрофон закрыт. Можно повторить подключение или продолжить в текстовом чате.');
      }, 20_000);
    });
    r.on(RoomEvent.Reconnected, () => {
      if (!current()) return;
      event('reconnected');
      clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
      this.silenceSince = 0; this.emit({ phase: 'connected' }); this.applyGate(); refresh();
    });
    r.on(RoomEvent.Disconnected, () => {
      if (!current()) return;
      event('disconnected');
      void this.endFailed(new Error('Voice room disconnected'), 'Голосовое соединение завершено. Микрофон закрыт. Нажми «Повторить подключение», чтобы вернуться.');
    });
  }
  private rebuild() {
    const r = this.state.room; if (!r) return;
    const people = [r.localParticipant, ...r.remoteParticipants.values()];
    this.emit({ participants: people.map((p: Participant) => {
      const pub = p.getTrackPublication(Track.Source.Microphone), local = p === r.localParticipant;
      return { identity: p.identity, name: p.name || p.identity, isLocal: local,
        connectionQuality: p.connectionQuality, listenOnly: local ? this.state.listenOnly : !pub,
        isSpeaking: local ? this.state.transmitting && this.state.levelDb > -60 : p.isSpeaking,
        isMicMuted: local ? this.state.micMuted || this.state.outputMuted || this.state.listenOnly || this.state.deviceLost : !pub || pub.isMuted,
        audioLevel: p.audioLevel, audioTrack: pub?.track as LocalAudioTrack | RemoteAudioTrack || null };
    }) });
  }
  private syncing = false;
  private syncMute = async () => {
    if (this.syncing) return;
    this.syncing = true;
    try {
      for (;;) {
        const c = this.capture;
        if (!c || !this.state.room) break;
        const mute = this.state.micMuted || this.state.outputMuted || this.state.deviceLost;
        if (c.published.isMuted === mute) break;
        await (mute ? c.published.mute() : c.published.unmute());
      }
      this.rebuild();
    } catch { this.emit({ error: 'Не удалось обновить статус микрофона. Локальная передача закрыта; переподключись.', micMuted: true }); this.applyGate(); }
    finally { this.syncing = false; }
  };
  toggleMic = () => {
    if (!this.state.room || this.state.deviceBusy) return;
    if (this.state.listenOnly || this.state.deviceLost) { void this.requestMicrophone(); return; }
    if (this.state.outputMuted) return; // Deafen must never accidentally open the mic.
    this.ptt = false; this.emit({ micMuted: !this.state.micMuted });
    this.applyGate(); void this.syncMute();
  };
  toggleOutput = () => {
    this.ptt = false; this.emit({ outputMuted: !this.state.outputMuted });
    this.audio.forEach(el => { el.muted = this.state.outputMuted; });
    this.applyGate(); void this.syncMute();
  };
  setParticipantVolume = (identity: string, volume: number) => {
    const value = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
    this.emit({ participantVolumes: { ...this.state.participantVolumes, [identity]: value } });
    const participant = this.state.room?.remoteParticipants.get(identity);
    const track = participant?.getTrackPublication(Track.Source.Microphone)?.track as RemoteAudioTrack | undefined;
    const el = track && this.audio.get(track);
    if (el) el.volume = value;
  };
  private clearAudio() {
    this.audio.forEach((el, track) => { track.detach(el); el.pause(); el.remove(); }); this.audio.clear();
  }
  resumeAudio = async () => {
    try {
      await this.capture?.ctx.resume();
      await this.state.room?.startAudio();
      await Promise.all([...this.audio.values()].map(el => el.play()));
      this.emit({ audioBlocked: false, processingPaused: false }); this.applyGate();
    } catch { this.emit({ error: 'Звук всё ещё заблокирован. Проверь разрешения браузера и нажми ещё раз.' }); }
  };
  dismissNoSignal = () => { this.suppressUntil = performance.now() + 300_000; this.silenceSince = 0; this.emit({ noSignal: false }); };
  clearError = () => this.emit({ error: null });
}
const VoiceContext = createContext<VoiceEngine | null>(null);
export function VoiceProvider({ children }: { children: ReactNode }) {
  const ref = useRef<VoiceEngine>();
  if (!ref.current) ref.current = new VoiceEngine();
  useEffect(() => { const engine = ref.current!; engine.start(); return () => engine.dispose(); }, []);
  return createElement(VoiceContext.Provider, { value: ref.current }, children);
}
export function useVoice() {
  const engine = useContext(VoiceContext);
  if (!engine) throw new Error('VoiceProvider missing');
  const state = useSyncExternalStore(engine.subscribe, engine.snapshot);
  return { ...state, engine, joinChannel: engine.joinChannel, leave: engine.leave,
    toggleMic: engine.toggleMic, toggleOutput: engine.toggleOutput, clearError: engine.clearError };
}
