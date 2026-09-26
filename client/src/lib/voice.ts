import { createContext, createElement, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Room, RoomEvent, Track, LocalAudioTrack, type RemoteAudioTrack, type Participant } from 'livekit-client';
import { api, ApiError } from './api';
import { DEFAULT_VOICE_SETTINGS, normalizeSettings, wantsTransmission, mediaError, type VoiceSettings } from './voice-policy';
import workletUrl from './voice-worklet.js?url';
import { localStore } from './storage';

export type VoiceParticipant = {
  identity: string; name: string; isLocal: boolean; isSpeaking: boolean; isMicMuted: boolean;
  audioLevel: number; audioTrack: LocalAudioTrack | RemoteAudioTrack | null;
};
type Phase = 'idle' | 'token' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
type Capture = { stream: MediaStream; ctx: AudioContext; source: MediaStreamAudioSourceNode; gate: AudioWorkletNode; dest: MediaStreamAudioDestinationNode; published: LocalAudioTrack };
const SETTINGS_KEY = 'egv.voice.v1';
export class VoiceEngine {
  private listeners = new Set<() => void>();
  private epoch = 0;
  private captureEpoch = 0;
  private capture: Capture | null = null;
  private ptt = false;
  private silenceSince = 0;
  private suppressUntil = 0;
  private testing = false;
  private disposed = false;
  private audio = new Map<RemoteAudioTrack, HTMLAudioElement>();
  state = {
    room: null as Room | null, connectedChannelId: null as string | null, targetChannelId: null as string | null,
    participants: [] as VoiceParticipant[], micMuted: false, outputMuted: false, connecting: false,
    phase: 'idle' as Phase, error: null as string | null,
    settings: { ...DEFAULT_VOICE_SETTINGS }, devices: [] as MediaDeviceInfo[],
    permission: false, deviceBusy: false, inputLabel: '', levelDb: -120, transmitting: false,
    noSignal: false, deviceLost: false, listenOnly: false, audioBlocked: false, processingPaused: false,
    storageWarning: false, testing: false,
  };
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.state;
  private emit(patch: Partial<typeof this.state>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => fn());
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
      await ctx.audioWorklet.addModule(workletUrl);
      await ctx.resume();
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
  private async acquire(settings: VoiceSettings) {
    if (this.state.deviceBusy) return false;
    const operation = ++this.captureEpoch, epoch = this.epoch, room = this.state.room;
    this.emit({ deviceBusy: true, error: null, noSignal: false }); this.applyGate();
    let c: Capture | null = null;
    try {
      c = await this.buildCapture(settings);
      if (operation !== this.captureEpoch || epoch !== this.epoch || this.disposed) { this.closeCapture(c); return false; }
      const previous = this.capture;
      // Do not publish a second microphone. Gate is closed until commit succeeds.
      if (room) {
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
      return true;
    } catch (err) {
      this.closeCapture(c);
      if (epoch !== this.epoch || operation !== this.captureEpoch) return false;
      // A failed replacement never silently returns to an unpublished microphone.
      this.closeCapture(this.capture); this.capture = null;
      this.emit({ error: room ? `${mediaError(err)} Голосовой канал открыт, но ты только слушаешь. Если доступ разрешён, возможна ошибка публикации звука.` : mediaError(err), listenOnly: !!room, transmitting: false });
      return false;
    } finally {
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
  joinChannel = async (channelId: string) => {
    if (this.state.connecting || this.state.connectedChannelId === channelId) return;
    await this.leave();
    const epoch = ++this.epoch;
    this.emit({ phase: 'token', connecting: true, targetChannelId: channelId, error: null });
    let r: Room | null = null;
    try {
      const { token, url } = await api.post<{ token: string; url: string }>('/api/livekit/token', { channelId });
      if (epoch !== this.epoch || this.disposed) return;
      r = new Room({ adaptiveStream: true, dynacast: true });
      this.emit({ room: r, phase: 'connecting' });
      this.wire(r, epoch);
      await r.connect(url, token);
      if (epoch !== this.epoch || this.disposed) { await r.disconnect(); return; }
      this.emit({ phase: 'connected', connectedChannelId: channelId });
      await this.acquire(this.state.settings);
      this.rebuild();
    } catch (err) {
      if (epoch === this.epoch) {
        this.emit({ phase: 'failed', error: err instanceof ApiError ? err.message : 'Не удалось подключить голос. Проверь интернет и повтори. Если чат работает, проблема может быть в голосовом сервере или передаче медиа; точная причина пока неизвестна.', room: null, connectedChannelId: null });
        this.clearAudio(); this.closeCapture(this.capture); this.capture = null;
      }
      await r?.disconnect().catch(() => {});
    } finally { if (epoch === this.epoch) this.emit({ connecting: false }); }
  };
  leave = async () => {
    ++this.epoch; ++this.captureEpoch;
    const r = this.state.room;
    this.ptt = false; this.testing = false; this.silenceSince = 0;
    this.closeCapture(this.capture); this.capture = null; this.clearAudio();
    this.emit({ room: null, connectedChannelId: null, targetChannelId: null, participants: [], connecting: false,
      phase: 'idle', deviceBusy: false, noSignal: false, deviceLost: false, listenOnly: false, transmitting: false,
      testing: false, processingPaused: false, audioBlocked: false, levelDb: -120, error: null });
    await r?.disconnect().catch(() => {});
  };
  private wire(r: Room, epoch: number) {
    const current = () => epoch === this.epoch && r === this.state.room;
    const refresh = () => { if (current()) this.rebuild(); };
    [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
      RoomEvent.ActiveSpeakersChanged, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished].forEach(ev => r.on(ev, refresh));
    r.on(RoomEvent.TrackSubscribed, track => {
      if (!current() || track.kind !== Track.Kind.Audio) return;
      const t = track as RemoteAudioTrack, el = t.attach();
      el.muted = this.state.outputMuted; el.style.display = 'none'; document.body.appendChild(el);
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
      this.emit({ phase: 'reconnecting', noSignal: false, transmitting: false }); this.releasePtt();
    });
    r.on(RoomEvent.Reconnected, () => {
      if (!current()) return;
      this.silenceSince = 0; this.emit({ phase: 'connected' }); this.applyGate(); refresh();
    });
    r.on(RoomEvent.Disconnected, () => {
      if (!current()) return;
      void this.leave();
      this.emit({ phase: 'failed', error: 'Голосовое соединение завершено. Нажми «Подключиться», чтобы повторить.' });
    });
  }
  private rebuild() {
    const r = this.state.room; if (!r) return;
    const people = [r.localParticipant, ...r.remoteParticipants.values()];
    this.emit({ participants: people.map((p: Participant) => {
      const pub = p.getTrackPublication(Track.Source.Microphone), local = p === r.localParticipant;
      return { identity: p.identity, name: p.name || p.identity, isLocal: local,
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
