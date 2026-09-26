import { Link } from 'wouter';
import { Check, Circle, Headphones, Loader2, MicOff, Phone, Signal, UserPlus, Volume2 } from 'lucide-react';
import { useVoice } from '@/lib/voice';
import { useAuth } from '@/lib/auth';
import { type Channel } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { initialsOf } from '@/lib/format';

const modeLabels = { vad: 'Голосовая активация', open: 'Всегда включён', ptt: 'По кнопке' };
const qualities: Record<string, string> = { excellent: 'Отличная связь', good: 'Хорошая связь', poor: 'Слабая связь', lost: 'Связь потеряна' };

export function VoiceStage({ channel, onInvite }: { channel: Channel; onInvite?: () => void }) {
  const v = useVoice(), { user } = useAuth();
  const here = v.connectedChannelId === channel.id;
  const pending = v.targetChannelId === channel.id && v.connecting;
  const reconnecting = here && v.phase === 'reconnecting';
  const people = here ? v.participants : [];
  const progress = ['token', 'connect'].includes(v.voiceStep) ? 0 : ['capture', 'worklet', 'resume'].includes(v.voiceStep) ? 1 : v.voiceStep === 'publish' ? 2 : 3;
  return <section className="lab-voice-stage" aria-label={`Голосовой канал ${channel.name}`}>
    <header className="lab-voice-heading">
      <div><div className="lab-eyebrow"><Volume2 size={14} />Голосовой канал</div>
        <h1 data-testid="voice-room-title">{channel.name}</h1>
        <p>{reconnecting ? 'Связь прервалась. Микрофон закрыт.'
          : pending ? 'Подключаемся…'
          : here ? `${people.length} в канале · ${modeLabels[v.settings.mode]}`
          : v.phase === 'failed' && v.targetChannelId === channel.id ? 'Не подключено'
          : 'Подключись, чтобы увидеть участников'}</p></div>
      {onInvite && <button className="lab-secondary" onClick={onInvite}><UserPlus size={16} />Пригласить</button>}
    </header>
    {pending ? <div className="lab-stepper" aria-live="polite">
      {['Сервер голоса', 'Микрофон', 'Отправка звука'].map((title, i) => <div key={title} className={`lab-step ${progress > i ? 'done' : progress === i ? 'running' : ''}`}>
        <span>{progress > i ? <Check size={16} /> : progress === i ? <Loader2 size={16} className="animate-spin" /> : <Circle size={16} />}</span>
        <div><b>{title}</b><small>{i === 0 ? 'Соединение с голосовым сервером' : i === 1 ? 'Доступ и обработка сигнала' : 'Ждём подтверждения сервера'}</small></div>
      </div>)}
      <button className="lab-secondary self-center mt-4" onClick={() => void v.leave()}>Отмена</button>
    </div> : people.length ? <div className="lab-voice-grid">
      {people.map(p => {
        const speaking = p.isSpeaking && !p.isMicMuted && !reconnecting && !p.listenOnly;
        const status = reconnecting ? 'Связь восстанавливается' : p.isLocal && v.publicationFailed ? 'Передача недоступна' : p.listenOnly ? 'Режим слушателя' : p.isMicMuted ? 'Микрофон выключен' : speaking ? 'Говорит' : 'В канале';
        const hue = [...p.identity].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
        const face = <div className="lab-person-face" style={{ background: p.isLocal ? user?.avatarColor : `hsl(${hue} 48% 38%)` }}>{initialsOf(p.name)}</div>;
        return <Popover key={p.identity}>
          <PopoverTrigger asChild><button className={`lab-voice-tile ${speaking ? 'speaking' : ''} ${reconnecting ? 'dim' : ''}`}
            data-testid={`voice-card-${p.identity}`} data-speaking={speaking ? 'true' : 'false'}
            aria-label={`${p.name}${p.isLocal ? ', ты' : ''}: ${status}`}>
            {qualities[p.connectionQuality || ''] && <span className="lab-tile-quality"><Signal size={13} />{qualities[p.connectionQuality!]}</span>}
            {face}
            <span className="lab-tile-name"><span title={p.name} data-testid={`text-name-${p.identity}`}>{p.name}</span>{p.isLocal && <small>ты</small>}</span>
            <span className="sr-only">{status}</span>
            {(p.isMicMuted || p.listenOnly) && <span className="lab-tile-icons">{p.listenOnly ? <Headphones size={15} /> : <MicOff size={15} />}</span>}
          </button></PopoverTrigger>
          <PopoverContent className="w-64" side="top">
            <h2 className="font-semibold break-words">{p.name}</h2><p className="text-xs text-muted-foreground mt-1 mb-4">{status}</p>
            {p.isLocal ? <Link href="/settings" className="text-sm text-primary">Настройки своего микрофона</Link> : <label className="text-sm">Громкость для тебя: {Math.round((v.participantVolumes[p.identity] ?? 1) * 100)} %
              <input aria-label={`Громкость ${p.name}`} className="block w-full mt-3 accent-primary" type="range" min={0} max={100} step={1} value={Math.round((v.participantVolumes[p.identity] ?? 1) * 100)}
                onChange={e => v.engine.setParticipantVolume(p.identity, Number(e.target.value) / 100)} />
              <span className="block text-xs text-muted-foreground mt-2">Меняется только у тебя, не у остальных участников.</span>
            </label>}
          </PopoverContent>
        </Popover>;
      })}
      {people.length === 1 && onInvite && <button className="lab-voice-tile invite" onClick={onInvite} data-testid="voice-invite-tile">
        <span className="lab-invite-circle"><UserPlus size={24} /></span><b>Позвать друзей</b><span className="text-xs">Пока тут только ты</span>
      </button>}
    </div> : <div className="lab-voice-empty">
      <span className="lab-empty-icon"><Volume2 size={26} /></span>
      <h2>{v.phase === 'failed' ? 'Голос пока недоступен' : 'Зайди в голосовой канал'}</h2>
      <p>Выберите с другом один канал. Микрофон включается только после подключения; режим можно изменить в любой момент.</p>
      <button className="lab-primary" data-testid="button-voice-join-main" disabled={v.connecting} onClick={() => void v.joinChannel(channel.id)}>
        <Phone size={16} />{v.connectedChannelId ? 'Перейти сюда' : 'Подключиться'}
      </button>
      <Link href="/settings" className="text-xs text-muted-foreground mt-4 hover:text-primary">{modeLabels[v.settings.mode]} · изменить настройки</Link>
    </div>}
  </section>;
}
