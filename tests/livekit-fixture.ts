// Transport fixture, loaded ONLY by tests/vite.config.ts. Real microphone,
// AudioWorklet, React UI and VoiceEngine are not mocked.
export const Track = { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } };
export const RoomEvent = Object.fromEntries([
  'ParticipantConnected', 'ParticipantDisconnected', 'TrackMuted', 'TrackUnmuted', 'ActiveSpeakersChanged',
  'LocalTrackPublished', 'LocalTrackUnpublished', 'TrackSubscribed', 'TrackUnsubscribed',
  'AudioPlaybackStatusChanged', 'Reconnecting', 'Reconnected', 'Disconnected',
].map(k => [k, k]));
export class LocalAudioTrack {
  kind = 'audio'; isMuted = false;
  constructor(public mediaStreamTrack: MediaStreamTrack) {}
  async mute() { this.isMuted = true; this.mediaStreamTrack.enabled = false; }
  async unmute() { this.isMuted = false; this.mediaStreamTrack.enabled = true; }
  stop() { this.mediaStreamTrack.stop(); }
  attach() { const el = document.createElement('audio'); el.srcObject = new MediaStream([this.mediaStreamTrack]); return el; }
  detach(el: HTMLAudioElement) { el.srcObject = null; }
}
export class Room {
  events: Record<string, Function[]> = {}; remoteParticipants = new Map(); canPlaybackAudio = true;
  disconnects = 0; publishes = 0; publication: any = null;
  localParticipant = {
    identity: 'qa', name: 'Тестировщик', audioLevel: 0, isSpeaking: false,
    getTrackPublication: () => this.publication,
    publishTrack: async (track: LocalAudioTrack) => {
      if ((window as any).__failPublish) throw new Error('publication timeout');
      this.publishes++; this.publication = { track, get isMuted() { return track.isMuted; } };
    },
    unpublishTrack: async () => { this.publication = null; },
  };
  constructor() { ((window as any).__rooms ||= []).push(this); }
  on(event: string, fn: Function) { (this.events[event] ||= []).push(fn); return this; }
  emit(event: string, ...args: any[]) { this.events[event]?.forEach(fn => fn(...args)); }
  async connect() {
    const delay = (window as any).__connectDelay || 0;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  }
  async disconnect() { this.disconnects++; this.emit('Disconnected'); }
  async startAudio() { this.canPlaybackAudio = true; }
}
