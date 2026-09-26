export type VoiceStep = 'idle' | 'token' | 'connect' | 'capture' | 'worklet' | 'resume' | 'publish' | 'ready';
export const STEP_LABELS: Record<VoiceStep, string> = {
  idle: '', token: 'Получаем доступ к каналу…', connect: 'Подключаем голосовой сервер…',
  capture: 'Открываем микрофон…', worklet: 'Подготавливаем обработку…',
  resume: 'Запускаем обработку…', publish: 'Подключаем отправку звука…', ready: 'Готово',
};
export function safeVoiceError(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; message?: unknown };
  const clean = (v: unknown) => String(v ?? '')
    .replace(/(?:https?|wss?):\/\/\S+/gi, '[address]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '[ip]')
    .replace(/[\r\n\t]/g, ' ').slice(0, 180);
  return `${clean(e?.name || 'Error')}${typeof e?.code === 'number' ? ` (${e.code})` : ''}: ${clean(e?.message || 'Unknown error')}`;
}
export function publishErrorText(): string {
  return 'Микрофон открылся, но сервер не подтвердил отправку звука. Это не ошибка выбора микрофона. Передача закрыта; точную причину нужно проверить по диагностике соединения.';
}
export function isServerAuthError(error: unknown): boolean {
  return /invalid api key|invalid token|unauthorized|token.*expired/i.test(String((error as Error)?.message || ''));
}
