import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Server as ServerIcon, Hash, Users } from 'lucide-react';
import { ServerList } from '@/components/ServerList';
import { ChannelList } from '@/components/ChannelList';
import { ChatArea } from '@/components/ChatArea';
import { MembersSidebar } from '@/components/MembersSidebar';
import { InviteDialog } from '@/components/InviteDialog';
import { api, type Channel, type Server, type Message } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useVoice, useRemoteAudioPlayback } from '@/lib/voice';
import { useWebSocket } from '@/lib/ws';

export default function Home() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Мобильная навигация (<md: 768px — показываем одну панель)
  type MobilePane = 'servers' | 'chat' | 'members';
  const [mobilePane, setMobilePane] = useState<MobilePane>('servers');

  // При выборе канала в мобильной панели — переключаемся на чат
  const handleMobileSelectChannel = (c: Channel) => {
    setActiveChannel(c);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobilePane('chat');
    }
  };

  const voice = useVoice();
  useRemoteAudioPlayback(voice.room);

  // При заходе — если есть pending invite, ведём принимать
  useEffect(() => {
    const code = sessionStorage.getItem('egv.pendingInvite');
    if (code && user) {
      sessionStorage.removeItem('egv.pendingInvite');
      setLocation(`/invite/${code}`);
    }
  }, [user, setLocation]);

  // Серверы
  const { data: srvData } = useQuery<{ servers: Server[] }>({ queryKey: ['/api/servers'] });
  const servers = srvData?.servers ?? [];

  useEffect(() => {
    if (!activeServerId && servers.length > 0) {
      setActiveServerId(servers[0].id);
    }
  }, [servers, activeServerId]);

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;

  // Каналы активного сервера
  const { data: chData } = useQuery<{ channels: Channel[] }>({
    queryKey: [`/api/servers/${activeServerId}/channels`],
    enabled: !!activeServerId,
  });
  const channels = chData?.channels ?? [];

  // Первый канал по умолчанию
  useEffect(() => {
    if (!activeServerId) return;
    if (!activeChannel || activeChannel.serverId !== activeServerId) {
      const first = channels.find((c) => c.type === 'text') ?? channels[0];
      setActiveChannel(first ?? null);
    }
  }, [activeServerId, channels, activeChannel]);

  // Глобальные шорткаты голоса
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Не ловим в input/textarea/contenteditable — только глобально
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      // M — микрофон (только если в канале)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь')) {
        if (voice.connectedChannelId) {
          e.preventDefault();
          voice.toggleMic();
        }
      }
      // Ctrl+Shift+D — отключиться
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd' || e.key === 'в' || e.key === 'В')) {
        if (voice.connectedChannelId) {
          e.preventDefault();
          voice.leave();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voice.connectedChannelId, voice.toggleMic, voice.leave]);

  // WebSocket — обновляем кэш при новых сообщениях
  useWebSocket(!!user, (ev) => {
    if (ev.type === 'message') {
      const msg = ev.data as Message;
      qc.setQueryData<{ messages: Message[] }>([`/api/channels/${msg.channelId}/messages`], (prev) => {
        const list = prev?.messages ?? [];
        if (list.some((m) => m.id === msg.id)) return prev!;
        return { messages: [...list, msg] };
      });
    } else if (ev.type === 'member-joined') {
      // Инвалидируем список членов у всех серверов пользователя (простая стратегия)
      qc.invalidateQueries({ queryKey: ['/api/servers'] });
      if (activeServerId) {
        qc.invalidateQueries({ queryKey: [`/api/servers/${activeServerId}/members`] });
      }
    }
  });

  // Первый заход, серверов нет → предложим создать
  const noServers = servers.length === 0;

  return (
    <div className="h-[100dvh] w-screen flex flex-col md:flex-row overflow-hidden bg-background text-foreground">
      {/* Колонка 1: серверы + каналы (на мобильном — показываем когда pane=servers) */}
      <div className={`${mobilePane === 'servers' ? 'flex' : 'hidden'} md:flex flex-1 md:flex-none min-h-0`}>
        <ServerList servers={servers} activeServerId={activeServerId} onSelect={(id) => {
          setActiveServerId(id);
          setActiveChannel(null);
        }} />
        {!noServers && (
          <ChannelList
            server={activeServer}
            channels={channels}
            activeChannelId={activeChannel?.id ?? null}
            connectedChannelId={voice.connectedChannelId}
            voiceParticipants={voice.participants}
            onSelectChannel={handleMobileSelectChannel}
            onJoinVoice={(id) => voice.joinChannel(id)}
            onOpenInvite={() => setInviteOpen(true)}
            micMuted={voice.micMuted}
            outputMuted={voice.outputMuted}
            onToggleMic={voice.toggleMic}
            onToggleOutput={voice.toggleOutput}
          />
        )}
        {noServers && (
          <div className="flex-1 md:flex-none md:hidden">
            <EmptyState />
          </div>
        )}
      </div>

      {/* Колонка 2: чат (на мобильном — pane=chat) */}
      {!noServers ? (
        <div className={`${mobilePane === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 min-h-0`}>
          <ChatArea
            channel={activeChannel}
            connectedChannelId={voice.connectedChannelId}
            voiceParticipants={voice.participants}
            connecting={voice.connecting}
            voiceError={voice.error}
            onDismissVoiceError={voice.clearError}
            onJoinVoice={(id) => voice.joinChannel(id)}
            onLeaveVoice={voice.leave}
            micMuted={voice.micMuted}
            onToggleMic={voice.toggleMic}
          />
        </div>
      ) : (
        <div className="hidden md:flex flex-1">
          <EmptyState />
        </div>
      )}

      {/* Колонка 3: участники (на мобильном — pane=members) */}
      {!noServers && (
        <div className={`${mobilePane === 'members' ? 'flex' : 'hidden'} md:flex flex-1 md:flex-none min-h-0`}>
          <MembersSidebar serverId={activeServerId} />
        </div>
      )}

      {/* Мобильный tab-bar (только <md) */}
      {!noServers && (
        <nav className="md:hidden shrink-0 flex border-t border-sidebar-border/60 bg-sidebar">
          <MobileTab active={mobilePane === 'servers'} onClick={() => setMobilePane('servers')} icon={Hash} label="Каналы" />
          <MobileTab active={mobilePane === 'chat'} onClick={() => setMobilePane('chat')} icon={ServerIcon} label="Чат" disabled={!activeChannel} />
          <MobileTab active={mobilePane === 'members'} onClick={() => setMobilePane('members')} icon={Users} label="Люди" />
        </nav>
      )}

      {activeServer && (
        <InviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          serverId={activeServer.id}
          serverName={activeServer.name}
        />
      )}

    </div>
  );
}

function MobileTab({
  active, onClick, icon: Icon, label, disabled,
}: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium transition-colors ${
        active ? 'text-primary' : 'text-muted-foreground'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover-elevate'}`}
      data-testid={`mobile-tab-${label}`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}

function EmptyState() {
  const qc = useQueryClient();
  const [name, setName] = useState('Моя тусовка');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post<{ server: Server }>('/api/servers', { name: name.trim() });
      qc.invalidateQueries({ queryKey: ['/api/servers'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card border border-card-border rounded-2xl p-8 text-center">
        <h2 className="font-display text-xl font-semibold mb-2">Создай первый сервер</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Сервер — это твоя тусовка друзей. Внутри будут текстовые и голосовые каналы.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary mb-3"
          placeholder="Имя сервера"
        />
        {err && <div className="text-sm text-destructive mb-3">{err}</div>}
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold hover-elevate disabled:opacity-60"
        >
          {busy ? 'Создаю…' : 'Создать сервер'}
        </button>
      </div>
    </main>
  );
}
