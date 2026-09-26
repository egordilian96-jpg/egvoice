import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash, Volume2, Send, Bell, Users, Search, PhoneOff, Mic, MicOff, Signal, Phone, Loader2, Headphones, AlertTriangle, X, ArrowDown } from 'lucide-react';
import { UserAvatar } from './Avatar';
import { Waveform, MiniBars } from './Waveform';
import { api, ApiError, type Channel, type Message } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { VoiceParticipant } from '@/lib/voice';
import { formatTime } from '@/lib/format';
import { VoiceNotice, VoiceToolbar } from './VoiceControls';
import { sessionStore } from '@/lib/storage';
import { VoiceStage } from './VoiceStage';

type Props = {
  channel: Channel | null;
  connectedChannelId: string | null;
  voiceParticipants: VoiceParticipant[];
  connecting: boolean;
  voiceError: string | null;
  onDismissVoiceError: () => void;
  onJoinVoice: (channelId: string) => void;
  onLeaveVoice: () => void;
  micMuted: boolean;
  onToggleMic: () => void;
  onOpenInvite?: () => void;
};

export function ChatArea({
  channel, connectedChannelId, voiceParticipants, connecting, voiceError, onDismissVoiceError,
  onJoinVoice, onLeaveVoice, micMuted, onToggleMic, onOpenInvite,
}: Props) {
  if (!channel) {
    return (
      <main className="flex-1 flex items-center justify-center text-muted-foreground text-sm bg-background">
        Выбери канал слева
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="h-12 shrink-0 flex items-center px-4 gap-3 border-b border-border/60 bg-background">
        {channel.type === 'voice'
          ? <Volume2 className="w-5 h-5 text-muted-foreground" />
          : <Hash className="w-5 h-5 text-muted-foreground" />}
        <div className="font-semibold text-sm" data-testid="text-channel-name">{channel.name}</div>
        <div className="w-px h-5 bg-border" />
        <div className="text-xs text-muted-foreground truncate hidden md:block">
          {channel.type === 'voice' ? 'голосовой канал' : 'обсуждение'}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button disabled aria-label="Уведомления пока недоступны" className="rounded p-1.5 text-muted-foreground opacity-40 cursor-not-allowed" data-testid="button-notifications" title="Уведомления пока недоступны">
            <Bell className="w-4 h-4" />
          </button>
          <button disabled aria-label="Управление участниками пока недоступно" className="rounded p-1.5 text-muted-foreground opacity-40 cursor-not-allowed" data-testid="button-members" title="Управление участниками пока недоступно">
            <Users className="w-4 h-4" />
          </button>
          <button disabled aria-label="Поиск сообщений пока недоступен" className="rounded p-1.5 text-muted-foreground opacity-40 cursor-not-allowed" data-testid="button-search" title="Поиск сообщений пока недоступен">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      <VoiceNotice />
      {channel.type === 'text'
        ? <TextChannel key={channel.id} channel={channel} />
        : (
          <VoiceStage channel={channel} onInvite={onOpenInvite} />
        )
      }

      <VoiceToolbar />
    </main>
  );
}

function TextChannel({ channel }: { channel: Channel }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const draftKey = `egv.draft.${user?.id}.${channel.id}`;
  const [draft, setDraft] = useState(() => sessionStore.getItem(draftKey) || '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousCount = useRef(0);
  const [unseen, setUnseen] = useState(0);

  const { data, isLoading, isError, refetch } = useQuery<{ messages: Message[] }>({
    queryKey: [`/api/channels/${channel.id}/messages`],
    // The temporary hosting proxy can reject WebSocket upgrades. Keep the active
    // text channel live through HTTP too; background tabs do not poll.
    refetchInterval: 3000,
  });
  const messages = data?.messages ?? [];
  useEffect(() => { if (draft) sessionStore.setItem(draftKey, draft); else sessionStore.removeItem(draftKey); }, [draft, draftKey]);

  const send = useMutation({
    mutationFn: async (text: string) => api.post<{ message: Message }>(`/api/channels/${channel.id}/messages`, { text }),
    // Оптимистично: сервер сам разошлёт через WS, но добавим локально сразу,
    // чтобы не ждать. Дедуп сделает WS-обработчик (по id).
    onSuccess: async (r) => {
      await qc.cancelQueries({ queryKey: [`/api/channels/${channel.id}/messages`] });
      qc.setQueryData<{ messages: Message[] }>([`/api/channels/${channel.id}/messages`], (prev) => {
        const list = prev?.messages ?? [];
        if (list.some((m) => m.id === r.message.id)) return prev!;
        return { messages: [...list, r.message] };
      });
      setDraft('');
    },
  });

  useEffect(() => {
    const added = Math.max(0, messages.length - previousCount.current);
    const ownLatest = messages.at(-1)?.authorId === user?.id;
    if (nearBottom.current || (added > 0 && ownLatest)) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      setUnseen(0);
    } else if (added) setUnseen(n => n + added);
    previousCount.current = messages.length;
  }, [messages, user?.id]);

  const submit = () => {
    const t = draft.trim();
    if (!t || t.length > 2000 || send.isPending) return;
    send.mutate(t);
  };

  return (
    <>
      <div ref={scrollRef} data-testid="message-history" onScroll={() => {
        const el = scrollRef.current!;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (nearBottom.current) setUnseen(0);
      }} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Загружаю…
          </div>
        ) : isError ? <div role="status" className="p-5 text-sm">Не удалось загрузить сообщения. <button className="text-primary" onClick={() => void refetch()}>Повторить</button></div> : messages.length === 0 ? (
          <EmptyChat name={channel.name} />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const grouped = prev && prev.authorId === m.authorId
              && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000)
              && new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
            const author = { id: m.authorId, nickname: m.authorNickname, avatarColor: m.authorColor };
            return grouped ? (
              <div key={m.id} className="pl-12 -mt-3 group hover-elevate rounded py-0.5">
                <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid={`text-message-${m.id}`}>{m.text}</div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3 group hover-elevate rounded py-1">
                <UserAvatar user={author} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm">{m.authorNickname}{m.authorId === user?.id ? ' (ты)' : ''}</span>
                    <span className="text-[11px] text-muted-foreground">{formatTime(m.createdAt)}</span>
                  </div>
                  <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid={`text-message-${m.id}`}>{m.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {unseen > 0 && <button className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary" data-testid="jump-new-messages" onClick={() => {
        nearBottom.current = true; setUnseen(0); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }}><ArrowDown size={14} />Новые сообщения · {unseen}</button>}
      <div className="p-4 shrink-0">
        {send.isError && (
          <div role="alert" className="mb-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
            {send.error instanceof ApiError ? send.error.message : 'Не удалось отправить'}
            <span className="block text-xs mt-1">Текст сохранён в поле. Проверь историю перед повторной отправкой.</span>
          </div>
        )}
        <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
          <textarea
            rows={2}
            aria-label={`Сообщение в ${channel.name}`}
            maxLength={2000}
            disabled={send.isPending}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), submit())}
            placeholder={`Написать в #${channel.name}`}
            className="flex-1 min-w-0 resize-y max-h-36 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            data-testid="input-message"
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || send.isPending}
            className="text-primary disabled:text-muted-foreground disabled:cursor-not-allowed hover-elevate rounded p-1"
            data-testid="button-send-message"
            aria-label={send.isPending ? 'Отправляем сообщение' : 'Отправить сообщение'}
          >
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <div className="text-xs text-muted-foreground mt-1 text-right">{draft.length} / 2000 · {send.isPending ? 'Отправляем…' : 'Enter: отправить · Shift+Enter: новая строка'}</div>
      </div>
    </>
  );
}

function EmptyChat({ name }: { name: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-16">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
        <Hash className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="font-semibold">#{name}</div>
      <div className="text-sm text-muted-foreground max-w-xs">Пока тут тихо. Напиши первым.</div>
    </div>
  );
}

function VoiceRoom({
  channel, isConnectedHere, connecting, participants, voiceError, onDismissVoiceError,
  onJoin, onLeave, micMuted, onToggleMic,
}: {
  channel: Channel;
  isConnectedHere: boolean;
  connecting: boolean;
  participants: VoiceParticipant[];
  voiceError: string | null;
  onDismissVoiceError: () => void;
  onJoin: () => void;
  onLeave: () => void;
  micMuted: boolean;
  onToggleMic: () => void;
}) {
  const activeCount = participants.filter((p) => p.isSpeaking).length;

  return (
    <div className="flex-1 overflow-y-auto voice-ambient">
      {/* Ambient-баннер с ошибкой голоса */}
      {voiceError && (
        <div className="mx-6 mt-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-destructive">Не получилось подключиться</div>
            <div className="text-muted-foreground mt-0.5">{voiceError}</div>
          </div>
          <button
            onClick={onDismissVoiceError}
            className="text-muted-foreground hover:text-foreground hover-elevate rounded p-1 shrink-0"
            aria-label="Закрыть ошибку"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="px-6 pt-8 pb-6">
        {/* Герой-шапка: крупный тайтл + контекст справа */}
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
          <div>
            <div className="flex items-center gap-2 text-primary/80 mb-2">
              <Volume2 className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">Голосовой канал</span>
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight" data-testid="voice-room-title">
              {channel.name}
            </h1>
            <div className="mt-2 text-sm text-muted-foreground flex items-center gap-3 tabular-nums">
              <span>
                {participants.length === 0 ? (isConnectedHere ? 'Обновляем участников…' : 'Подключись, чтобы увидеть участников') :
                  participants.length === 1 ? '1 участник' :
                  `${participants.length} ${pluralize(participants.length, ['участник', 'участника', 'участников'])}`}
              </span>
              {activeCount > 0 && (
                <>
                  <span className="text-border">•</span>
                  <span className="text-primary flex items-center gap-1.5">
                    <MiniBars active />
                    {activeCount === 1 ? '1 говорит' : `${activeCount} говорят`}
                  </span>
                </>
              )}
            </div>
          </div>

          {!isConnectedHere && (
            <button
              onClick={onJoin}
              disabled={connecting}
              className="group inline-flex items-center gap-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-3 text-sm font-semibold glow-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="button-voice-join-main"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Подключение…</span>
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4" />
                  <span>Подключиться</span>
                </>
              )}
            </button>
          )}
        </div>

        {participants.length === 0 ? (
          <EmptyVoiceStage isConnectedHere={isConnectedHere} connecting={connecting} onJoin={onJoin} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,240px))] justify-center content-center min-h-[340px] gap-3 max-w-5xl mx-auto">
            {participants.map((p, idx) => (
              <ParticipantCard
                key={p.identity}
                participant={p}
                seed={idx * 1.7}
                micMuted={p.isMicMuted}
                onToggleMic={p.isLocal ? onToggleMic : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function EmptyVoiceStage({
  isConnectedHere, connecting, onJoin,
}: { isConnectedHere: boolean; connecting: boolean; onJoin: () => void }) {
  if (isConnectedHere) {
    return (
      <div className="min-h-[320px] flex flex-col items-center justify-center text-center gap-4 py-16">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-primary/10 border border-primary/30" />
          <div className="absolute inset-0 rounded-full glow-primary animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Headphones className="w-8 h-8 text-primary" />
          </div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold">Ты в канале один</div>
          <div className="text-sm text-muted-foreground mt-1 max-w-sm">
            Проверь состояние микрофона в панели звонка. Позови друзей через «Пригласить друга».
          </div>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground/70 flex items-center gap-3">
          <Kbd>M</Kbd> микрофон
          <span className="text-border">·</span>
          <Kbd>Ctrl+Shift+X</Kbd> отключиться
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-[320px] flex flex-col items-center justify-center text-center gap-4 py-16">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full bg-primary/5 border border-primary/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Volume2 className="w-8 h-8 text-primary/60" />
        </div>
      </div>
      <div>
        <div className="font-display text-lg font-semibold">Зайди в голосовой канал</div>
        <div className="text-sm text-muted-foreground mt-1 max-w-sm">
          Выберите с другом один канал. После подключения увидишь его участников и состояние своего микрофона.
        </div>
      </div>
      <button
        onClick={onJoin}
        disabled={connecting}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 text-sm font-semibold glow-primary transition-all disabled:opacity-60"
      >
        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
        {connecting ? 'Подключение…' : 'Подключиться'}
      </button>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-mono font-medium text-foreground/80">
      {children}
    </kbd>
  );
}

function ParticipantCard({
  participant, seed, micMuted, onToggleMic,
}: {
  participant: VoiceParticipant;
  seed: number;
  micMuted: boolean;
  onToggleMic?: () => void;
}) {
  const isMuted = micMuted;
  const isSpeaking = participant.isSpeaking && !isMuted;

  // Цвет аватара: для локального не знаем цвет из identity — выведём из хэша ника.
  const color = pickColorFromIdentity(participant.identity, participant.name);

  return (
    <div
      className={`relative bg-card border rounded-2xl px-5 pt-10 pb-5 min-h-[235px] flex flex-col items-center gap-3 transition-colors duration-150 ${
        isSpeaking ? 'border-emerald-400/60 bg-emerald-400/5' : 'border-card-border'
      }`}
      data-testid={`voice-card-${participant.identity}`}
      data-speaking={isSpeaking ? 'true' : 'false'}
    >
      {participant.connectionQuality && participant.connectionQuality !== 'unknown' && <span className={`absolute top-3 left-3 flex items-center gap-1 text-[10px] ${participant.connectionQuality === 'poor' || participant.connectionQuality === 'lost' ? 'text-amber-300' : 'text-muted-foreground'}`}>
        <Signal size={12} />{({ excellent: 'Связь отличная', good: 'Связь хорошая', poor: 'Связь слабая', lost: 'Связь потеряна' } as Record<string, string>)[participant.connectionQuality] || 'Связь'}
      </span>}
      {onToggleMic && (
        <button
          onClick={onToggleMic}
          className={`absolute top-3 right-3 hover-elevate rounded-md p-1.5 transition-colors ${
            micMuted ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="button-self-mic"
          title={micMuted ? 'Включить микрофон (M)' : 'Выключить микрофон (M)'}
        >
          {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>
      )}

      <UserAvatar
        user={{ id: participant.identity, nickname: participant.name, avatarColor: color }}
        size={76}
        speaking={isSpeaking}
        level={participant.audioLevel}
        muted={isMuted}
      />

      <div className="flex items-center justify-center gap-2 mt-1 w-full min-w-0">
        <span title={participant.name} className="text-[14px] font-semibold tracking-tight truncate" data-testid={`text-name-${participant.identity}`}>
          {participant.name}
        </span>
        {participant.isLocal && (
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em] px-1.5 py-0.5 rounded bg-muted">
            ты
          </span>
        )}
      </div>

      <div className="h-[30px] w-full flex items-center justify-center">
        <Waveform
          active={isSpeaking}
          seed={seed}
          width={148}
          height={26}
          audioTrack={participant.audioTrack}
        />
      </div>

      {participant.listenOnly ? <span className="text-xs text-amber-300">Только слушает</span> : <StatusPill isSpeaking={isSpeaking} isMuted={isMuted} />}
    </div>
  );
}

function StatusPill({ isSpeaking, isMuted }: { isSpeaking: boolean; isMuted: boolean }) {
  if (isSpeaking) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-[0.18em]">
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
        говорит
      </div>
    );
  }
  if (isMuted) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-destructive/80 uppercase tracking-[0.15em]">
        <MicOff className="w-2.5 h-2.5" />
        микрофон выкл
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">
      <Headphones className="w-2.5 h-2.5" />
      слушает
    </div>
  );
}

// Перенесён из auth.ts — детерминированный цвет по строке, чтобы аватары выглядели как настоящие.
function pickColorFromIdentity(id: string, fallbackName: string): string {
  const palette = [
    '#1FD5F9', '#38BDF8', '#818CF8', '#A78BFA', '#F472B6', '#FB923C',
    '#FBBF24', '#4ADE80', '#2DD4BF', '#F87171', '#EC4899', '#60A5FA',
  ];
  const seed = (id || fallbackName || 'user');
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function VoiceStatusBar({ channelId, micMuted, onToggleMic, onLeave }: {
  channelId: string; micMuted: boolean; onToggleMic: () => void; onLeave: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-border/60 bg-card/95 backdrop-blur px-4 py-2.5 flex items-center gap-4">
      <div className="flex items-center gap-2 text-primary">
        <div className="relative flex items-center justify-center w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
          <span className="relative w-2 h-2 rounded-full bg-primary" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em]">Голос подключён</span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-2">
        <MiniBars active={!micMuted} />
        <span className="text-xs text-muted-foreground">
          {micMuted ? 'микрофон выкл' : 'микрофон открыт'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onToggleMic}
          className={`hover-elevate rounded-md p-2 transition-colors ${
            micMuted ? 'text-destructive bg-destructive/10' : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="button-voice-mic"
          title={micMuted ? 'Включить микрофон (M)' : 'Выключить микрофон (M)'}
        >
          {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button
          onClick={onLeave}
          className="hover-elevate rounded-md p-2 text-destructive hover:bg-destructive/10 transition-colors"
          data-testid="button-leave-voice"
          title="Отключиться (Ctrl+Shift+D)"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
