export type MicMode = 'vad' | 'open' | 'ptt';
export type VoiceSettings = {
  networkMode: 'auto' | 'relay' | 'relay-tcp';
  connectionMode: 'compatible' | 'standard';
  mode: MicMode;
  pttKind: 'hold' | 'toggle';
  threshold: number;
  releaseMs: number;
  inputId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  networkMode: 'auto',
  connectionMode: 'compatible',
  mode: 'vad', pttKind: 'hold', threshold: -42, releaseMs: 200,
  inputId: 'default', echoCancellation: true, noiseSuppression: true, autoGainControl: false,
};
export function normalizeSettings(value: Partial<VoiceSettings>): VoiceSettings {
  const bounded = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(min, Math.min(max, v))) : fallback;
  return {
    networkMode: value.networkMode === 'relay-tcp' ? 'relay-tcp' : value.networkMode === 'relay' ? 'relay' : 'auto',
    connectionMode: value.connectionMode === 'standard' ? 'standard' : 'compatible',
    mode: ['vad', 'open', 'ptt'].includes(value.mode ?? '') ? value.mode! : 'vad',
    pttKind: value.pttKind === 'toggle' ? 'toggle' : 'hold',
    threshold: bounded(value.threshold, -42, -80, -10),
    releaseMs: bounded(value.releaseMs, 200, 0, 1000),
    inputId: typeof value.inputId === 'string' && value.inputId ? value.inputId : 'default',
    echoCancellation: value.echoCancellation !== false,
    noiseSuppression: value.noiseSuppression !== false,
    autoGainControl: value.autoGainControl === true,
  };
}
export function wantsTransmission(s: VoiceSettings, muted: boolean, deaf: boolean, ptt: boolean) {
  return !muted && !deaf && (s.mode !== 'ptt' || ptt);
}
export function noSignalDue(ms: number, db: number, eligible: boolean) {
  return eligible && db < -75 ? ms : 0;
}
export function mediaError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Доступ к микрофону запрещён. Разреши его в браузере и в настройках конфиденциальности Windows.';
  if (name === 'NotFoundError') return 'Микрофон не найден. Подключи гарнитуру и повтори проверку.';
  if (name === 'NotReadableError') return 'Не удалось открыть микрофон. Проверь подключение и не занят ли он другой программой.';
  if (name === 'OverconstrainedError') return 'Выбранный микрофон недоступен. Выбери другое устройство.';
  return 'Не удалось подготовить микрофон. Проверь устройство и попробуй снова.';
}
