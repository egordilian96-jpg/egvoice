// The gate runs on the audio rendering thread, not on a background-tab timer.
// No audio is recorded or sent via postMessage: only a scalar input level.
class VoiceGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.config = { mode: 'vad', threshold: -42, releaseMs: 200, enabled: false };
    this.hold = 0;
    this.gain = 0;
    this.frames = 0;
    this.sum = 0;
    this.count = 0;
    this.port.onmessage = ({ data }) => {
      this.config = data;
      if (!data.enabled) { this.hold = 0; this.gain = 0; }
    };
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    let sum = 0;
    if (input) for (const sample of input) sum += sample * sample;
    const rms = Math.sqrt(sum / (input?.length || 128));
    const db = 20 * Math.log10(Math.max(rms, 0.000001));
    const c = this.config;
    if (db >= c.threshold) this.hold = sampleRate * c.releaseMs / 1000;
    else this.hold = Math.max(0, this.hold - output.length);
    const open = c.enabled && (c.mode !== 'vad' || this.hold > 0 || db >= c.threshold);
    const target = open ? 1 : 0;
    // Short ramp prevents clicks when the VAD gate opens/closes.
    for (let i = 0; i < output.length; i++) {
      this.gain += Math.max(-1 / (sampleRate * .005), Math.min(1 / (sampleRate * .005), target - this.gain));
      output[i] = (input?.[i] || 0) * this.gain;
    }
    this.frames += output.length; this.sum += sum; this.count += input?.length || output.length;
    if (this.frames >= sampleRate / 10) {
      this.port.postMessage({ db: 20 * Math.log10(Math.max(Math.sqrt(this.sum / this.count), .000001)), open });
      this.frames = this.sum = this.count = 0;
    }
    return true;
  }
}
registerProcessor('eg-voice-gate', VoiceGate);
