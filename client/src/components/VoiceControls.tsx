import { useEffect } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, Mic, MicOff, PhoneOff, Headphones, Settings } from 'lucide-react';
import { useVoice } from '@/lib/voice';
import type { MicMode } from '@/lib/voice-policy';
import { STEP_LABELS } from '@/lib/voice-diagnostics';
import { copyInviteText as copyText } from '@/lib/invites';
import { useToast } from '@/hooks/use-toast';

const MODES: { id: MicMode; label: string; hint: string }[] = [
  { id: 'vad', label: 'Голосовая активация', hint: 'Говори без кнопок. Передача открывается по уровню сигнала.' },
  { id: 'open', label: 'Всегда включён', hint: 'Передаёт всё, что слышит микрофон. Выключить вручную: M.' },
  { id: 'ptt', label: 'По кнопке', hint: 'Удерживай V или выбери переключение одним нажатием.' },
];
const button = 'rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-40';
export function MicModeControl({ compact = false }: { compact?: boolean }) {
  const v = useVoice();
  return <div className="space-y-3">
    {compact ? <label className="flex items-center gap-2 text-xs">
      Режим
      <select aria-label="Режим микрофона" data-testid="voice-mode-quick" value={v.settings.mode}
        onChange={e => v.engine.updateSettings({ mode: e.target.value as MicMode })}
        className="bg-secondary rounded-lg p-2 max-w-[200px]">
        {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </label> : <fieldset>
      <legend className="font-semibold mb-3">Режим микрофона</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map(m => <button key={m.id} aria-pressed={v.settings.mode === m.id} data-testid={`mode-${m.id}`}
          onClick={() => v.engine.updateSettings({ mode: m.id })}
          className={`text-left rounded-xl border p-3 ${v.settings.mode === m.id ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
          <div className="font-semibold text-sm">{m.label}</div><p className="text-xs text-muted-foreground mt-2">{m.hint}</p>
        </button>)}
      </div>
    </fieldset>}
    {v.settings.mode === 'ptt' && <div className="space-y-2">
      <label className="text-sm flex flex-wrap items-center gap-3">Клавиша V
        <select aria-label="Способ нажатия" value={v.settings.pttKind} onChange={e => v.engine.updateSettings({ pttKind: e.target.value as 'hold' | 'toggle' })} className="bg-secondary rounded-lg p-2 text-xs">
          <option value="hold">Удерживать</option><option value="toggle">Нажать: вкл / выкл</option>
        </select>
      </label>
      {!compact && <p className="text-xs text-amber-300">Сейчас клавиша работает только в активном окне приложения. При потере фокуса передача закрывается. Глобальная клавиша поверх игры ещё не реализована.</p>}
    </div>}
    {v.storageWarning && <p role="status" className="text-xs text-amber-300">Хранилище недоступно. Настройки действуют, но после закрытия могут сброситься.</p>}
  </div>;
}
export function VoiceNotice() {
  const v = useVoice();
  const { toast } = useToast();
  const title = v.serverAuthFailed ? 'Ошибка настройки голосового сервера'
    : v.phase === 'failed' ? 'Голосовое соединение прервано'
    : v.publicationFailed ? 'Не удалось отправить звук'
    : v.deviceLost ? 'Микрофон отключён'
    : v.processingPaused ? 'Обработка звука приостановлена'
    : v.audioBlocked ? 'Нажми, чтобы услышать друзей'
    : v.noSignal ? 'Тебя не слышно? Проверь микрофон'
    : v.phase === 'reconnecting' ? 'Восстанавливаем голосовое соединение'
    : v.listenOnly ? 'Ты только слушаешь'
    : v.error ? 'Проблема с голосом' : '';
  if (!title) return null;
  return <section role="status" aria-live="polite" data-testid="voice-notice" className="mx-3 my-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm shrink-0">
    <div className="flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" /><div className="min-w-0">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1">
        {v.phase === 'failed' || v.publicationFailed ? v.error
          : v.deviceLost ? 'Не переключаем вход молча. Подключи гарнитуру или выбери другой микрофон.'
          : v.noSignal ? `От «${v.inputLabel}» почти нет сигнала 30 секунд. Возможно, ты просто молчишь. Скажи пару слов и проверь индикатор; это не подтверждение, что друзья тебя не слышат.`
          : v.phase === 'reconnecting' ? 'Микрофон временно закрыт. Пробуем восстановить связь не дольше 20 секунд; ты можешь выйти из голоса.'
          : v.audioBlocked || v.processingPaused ? 'Браузер приостановил звук. Возобнови его явным нажатием.'
          : v.error || 'Микрофон пока не опубликован. Проверь разрешения и устройство.'}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        {v.phase === 'failed' && <button className={button} onClick={() => void v.engine.retry()}>Повторить подключение</button>}
        {v.error && !v.serverAuthFailed && ['publish', 'connect'].includes(v.voiceStep) && (v.settings.networkMode !== 'relay-tcp' || v.settings.connectionMode !== 'compatible') &&
          <button className={button} disabled={v.connecting || v.deviceBusy} onClick={() => void v.engine.retryCompatibleTcp()}>Совместимое + TCP/TLS</button>}
        {v.publicationFailed && v.settings.networkMode !== 'relay' && <button className={button} disabled={v.connecting || v.deviceBusy} onClick={() => void v.engine.retryWithRelay()}>Переподключиться через TURN</button>}
        {(v.deviceLost || v.listenOnly) && !v.publicationFailed && <button className={button} disabled={v.deviceBusy || v.phase === 'reconnecting'} onClick={() => void v.engine.requestMicrophone()}>Повторить с этим микрофоном</button>}
        {v.publicationFailed && <button className={button} disabled={v.deviceBusy || v.connecting} onClick={() => void v.engine.retry()}>Повторить подключение</button>}
        {(v.audioBlocked || v.processingPaused) && <button className={button} onClick={() => void v.engine.resumeAudio()}>Включить звук</button>}
        {v.noSignal && <button className={button} onClick={v.engine.dismissNoSignal}>Я просто молчу</button>}
        {!v.serverAuthFailed && <Link href="/settings"><button className={button}>Проверить устройства</button></Link>}
        {v.error && !v.listenOnly && !v.deviceLost && <button className={button} onClick={v.clearError}>Скрыть</button>}
      </div>
      {v.diagnostic && <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-foreground">Технические подробности</summary>
        <pre className="mt-2 whitespace-pre-wrap break-all text-muted-foreground" data-testid="voice-diagnostic">{v.diagnostic}</pre>
        <button className={`${button} mt-2`} onClick={async () => {
          const copied = await copyText(v.diagnostic);
          toast({ title: copied ? 'Диагностика скопирована' : 'Выдели текст подробностей и нажми Ctrl+C' });
        }}>Скопировать диагностику</button>
      </details>}
    </div></div>
  </section>;
}
export function VoiceToolbar() {
  const v = useVoice();
  if (!v.room && !v.connecting) return null;
  return <div className="lab-voice-toolbar" data-testid="voice-toolbar">
    <div className="lab-call-status">
      <div className="text-xs font-semibold text-primary">{v.phase === 'reconnecting' ? 'Переподключаемся…' : v.connecting || v.deviceBusy ? STEP_LABELS[v.voiceStep] || 'Подключаемся…' : v.publicationFailed ? 'Передача недоступна' : v.listenOnly ? 'Режим слушателя' : 'Голос подключён'}</div>
      <div className="text-xs text-muted-foreground">{v.outputMuted ? 'Звук и микрофон выключены' : v.micMuted ? 'Микрофон выключен' : v.transmitting ? 'Передача открыта' : 'Передача закрыта'}</div>
    </div>
    <MicModeControl compact />
    {v.settings.mode === 'ptt' && <button className={button} aria-label="Передача по кнопке"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); v.engine.pressPtt(); }}
      onPointerUp={() => { if (v.settings.pttKind === 'hold') v.engine.releasePtt(); }}
      onPointerCancel={v.engine.releasePtt} onLostPointerCapture={() => { if (v.settings.pttKind === 'hold') v.engine.releasePtt(); }}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); v.engine.pressPtt(); } }}
      onKeyUp={() => { if (v.settings.pttKind === 'hold') v.engine.releasePtt(); }}>
      {v.settings.pttKind === 'hold' ? 'Держи V / эту кнопку' : 'V: вкл / выкл'}</button>}
    <button className="lab-call-button" onClick={v.toggleMic} disabled={v.outputMuted || v.deviceBusy || v.phase !== 'connected' || v.publicationFailed} aria-label="Микрофон" aria-pressed={v.micMuted}>{v.micMuted ? <MicOff size={16} /> : <Mic size={16} />}<span>{v.micMuted ? 'Микрофон выкл' : 'Микрофон'}</span><kbd>M</kbd></button>
    <button className="lab-call-button" onClick={v.toggleOutput} aria-label="Выключить звук и микрофон" aria-pressed={v.outputMuted}><Headphones size={16} /><span>{v.outputMuted ? 'Звук выкл' : 'Звук'}</span></button>
    <Link href="/settings" className="lab-call-button" aria-label="Настройки голоса"><Settings size={16} /><span>Настройки</span></Link>
    <button className="lab-call-button hang" onClick={() => void v.leave()} aria-label={v.connecting ? 'Отменить подключение' : 'Выйти из голоса'}><PhoneOff size={16} /><span>Выйти</span></button>
  </div>;
}
export function LiveAudioSettings() {
  const v = useVoice();
  useEffect(() => () => v.engine.stopTest(), [v.engine]);
  return <div className="space-y-6">
    <header><h1 className="font-display text-2xl font-semibold">Голос и звук</h1><p className="text-sm text-muted-foreground mt-2">Одна настройка для звонка и приложения. Изменения применяются сразу.</p></header>
    <VoiceNotice />
    <section className="rounded-xl border border-border p-4 space-y-3">
      <h2 className="font-semibold">Твой микрофон</h2>
      {!v.permission ? <>
        <p className="text-sm text-muted-foreground">Разреши доступ, чтобы увидеть настоящие названия устройств. Проверка не отправляет звук другим людям.</p>
        <button className={button} disabled={v.deviceBusy} onClick={() => void v.engine.requestMicrophone()}>{v.deviceBusy ? 'Ждём разрешение…' : 'Разрешить и проверить'}</button>
      </> : <>
        <label className="block text-xs text-muted-foreground">Устройство ввода
          <select aria-label="Устройство ввода" data-testid="real-input" value={v.settings.inputId} disabled={v.deviceBusy}
            onChange={e => void v.engine.changeInput(e.target.value)} className="block mt-2 w-full rounded-lg bg-secondary p-3 text-sm text-foreground">
            <option value="default">Системный микрофон по умолчанию</option>
            {v.settings.inputId !== 'default' && !v.devices.some(d => d.deviceId === v.settings.inputId) && <option value={v.settings.inputId}>Выбранный микрофон недоступен</option>}
            {v.devices.filter(d => d.deviceId !== 'default' && d.label).map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
          </select>
        </label>
        <div role="meter" aria-label="Уровень микрофона" aria-valuemin={-80} aria-valuemax={0} aria-valuenow={Math.round(Math.max(-80, v.levelDb))}
          className="h-2 rounded-full overflow-hidden bg-secondary"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(0, Math.min(100, (v.levelDb + 80) / 80 * 100))}%` }} /></div>
        <p className="text-xs text-muted-foreground">{v.deviceBusy ? STEP_LABELS[v.voiceStep] : v.inputLabel || 'Проверка не запущена'} · {v.levelDb < -100 ? 'нет сигнала' : `${Math.round(v.levelDb)} дБFS`}</p>
        {!v.room && <button className={button} disabled={v.deviceBusy} onClick={() => v.testing ? v.engine.stopTest() : void v.engine.requestMicrophone()}>{v.testing ? 'Остановить проверку' : 'Проверить микрофон'}</button>}
      </>}
      <p className="text-xs text-muted-foreground">Вывод звука: системные наушники / колонки. Для смены выбери устройство в ОС.</p>
    </section>
    <MicModeControl />
    <section className="rounded-xl border border-border p-4 space-y-3">
      <label className="block text-sm font-semibold">Маршрут голосового соединения
        <select aria-label="Маршрут голоса" disabled={!!v.room || v.connecting} value={v.settings.networkMode}
          onChange={e => v.engine.updateSettings({ networkMode: e.target.value as 'auto' | 'relay' | 'relay-tcp' })}
          className="block mt-2 w-full bg-secondary p-3 rounded-lg text-sm">
          <option value="auto">Автоматически</option><option value="relay">Через TURN (запасной маршрут)</option>
          <option value="relay-tcp">TURN только TCP/TLS (без UDP)</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Если микрофон работает в проверке, но не отправляется в канал, можно попробовать TURN. Он тоже требует доступного сервера и не гарантирует обход сетевых ограничений. Для ручной смены выйди из голоса.</p>
      <label className="block text-sm font-semibold">Согласование соединения
        <select aria-label="Согласование соединения" disabled={!!v.room || v.connecting} value={v.settings.connectionMode}
          onChange={e => v.engine.updateSettings({ connectionMode: e.target.value as 'compatible' | 'standard' })}
          className="block mt-2 w-full bg-secondary p-3 rounded-lg text-sm">
          <option value="compatible">Совместимое (рекомендуется)</option><option value="standard">Стандартное</option>
        </select>
      </label>
    </section>
    {v.settings.mode === 'vad' && <label className="block text-sm">Порог активации: {v.settings.threshold} дБFS
      <input aria-label="Порог активации" type="range" min={-80} max={-10} value={v.settings.threshold}
        onChange={e => v.engine.updateSettings({ threshold: Number(e.target.value) })} className="block w-full accent-primary mt-3" />
      <span className="block text-xs text-muted-foreground mt-2">Ближе к −80: чувствительнее. Сигнал должен пересекать выбранный порог.</span>
    </label>}
    {v.settings.mode === 'vad' && <label className="block text-sm">Не обрезать конец фразы: {v.settings.releaseMs} мс
      <input aria-label="Задержка закрытия" type="range" min={0} max={1000} step={10} value={v.settings.releaseMs}
        onChange={e => v.engine.updateSettings({ releaseMs: Number(e.target.value) })} className="block w-full accent-primary mt-3" />
    </label>}
    <section className="rounded-xl border border-border p-4 space-y-4">
      <h2 className="font-semibold">Обработка звука</h2>
      {([['echoCancellation', 'Эхоподавление'], ['noiseSuppression', 'Базовое шумоподавление браузера'], ['autoGainControl', 'Автоматическая громкость']] as const).map(([key, label]) =>
        <label key={key} className="flex items-center justify-between gap-3 text-sm">{label}<input type="checkbox" checked={v.settings[key]} disabled={v.deviceBusy} onChange={e => void v.engine.changeProcessing({ [key]: e.target.checked })} className="accent-primary" /></label>)}
      <p className="text-xs text-muted-foreground">Это обработка WebRTC, не RNNoise. Перенастройка кратко закрывает передачу; соединение с каналом остаётся.</p>
    </section>
    <VoiceToolbar />
  </div>;
}
