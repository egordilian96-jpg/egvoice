import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Server as ServerIcon, Hash, Users } from 'lucide-react';
import { ServerList } from '@/components/ServerList';
import { ChannelList } from '@/components/ChannelList';
import { ChatArea } from '@/components/ChatArea';
import { MembersSidebar } from '@/components/MembersSidebar';
import { InviteDialog } from '@/components/InviteDialog';
import { api, type Channel, type Server, type Message } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useVoice } from '@/lib/voice';
import { useWebSocket } from '@/lib/ws';
import { sessionStore } from '@/lib/storage';

export default function Home() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [joinedServerId] = useState(() => sessionStore.getItem('egv.openServer'));
  const [activeServerId, setActiveServerId] = useState<string | null>(() => sessionStore.getItem('egv.openServer'));
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

  // При заходе — если есть pending invite, ведём принимать
  useEffect(() => {
    const code = sessionStore.getItem('egv.pendingInvite');
    if (code && user) {
      sessionStore.removeItem('egv.pendingInvite');
      setLocation(`/invite/${code}`);
    }
  }, [user, setLocation]);

  // Серверы
  const { data: srvData, isLoading: serversLoading, isError: serversError, refetch: retryServers } = useQuery<{ servers: Server[] }>({ queryKey: ['/api/servers'] });
  const servers = srvData?.servers ?? [];

  useEffect(() => {
    if (joinedServerId && servers.some(s => s.id === joinedServerId)) sessionStore.removeItem('egv.openServer');
    if (!activeServerId && servers.length > 0) {
      setActiveServerId(servers[0].id);
    }
  }, [servers, activeServerId, joinedServerId]);

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;

  // Каналы активного сервера
  const { data: chData } = useQuery<{ channels: Channel[] }>({
    queryKey: [`/api/servers/${activeServerId}/channels`],
    enabled: !!activeServerId,
  });
  const channels = chData?.channels ?? [];

  // Первый канал по умолчанию.
  // Если пользователь сейчас в голосовом канале — приоритетно показываем его,
  // чтобы после возврата из Settings не выбрасывать в текстовый.
  useEffect(() => {
    if (!activeServerId) return;
    if (!activeChannel || activeChannel.serverId !== activeServerId) {
      const inVoice = voice.connectedChannelId
        ? channels.find((c) => c.id === voice.connectedChannelId)
        : null;
      const invitedVoice = joinedServerId === activeServerId ? channels.find(c => c.type === 'voice') : null;
      const first = inVoice ?? invitedVoice ?? channels.find((c) => c.type === 'text') ?? channels[0];
      setActiveChannel(first ?? null);
    }
  }, [activeServerId, channels, activeChannel, voice.connectedChannelId, joinedServerId]);

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
  const noServers = !serversLoading && !serversError && servers.length === 0;
  if (serversLoading || serversError) return <main className="h-screen flex flex-col items-center justify-center gap-3 p-6">
    <p>{serversLoading ? 'Загружаем серверы…' : 'Не удалось загрузить серверы. Твоя тусовка не пропала.'}</p>
    {serversError && <button className="rounded-lg bg-primary text-primary-foreground p-3" onClick={() => void retryServers()}>Повторить</button>}
  </main>;

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
        <div className={`${mobilePane === 'chat' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0 min-h-0`}>
          {joinedServerId === activeServerId && activeServer && <div role="status" data-testid="joined-server-notice" className="border-b border-primary/20 bg-primary/10 px-4 py-3 text-sm">
            Ты в «{activeServer.name}». Выберите с другом один голосовой канал и нажми «Подключиться».
          </div>}
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
        <Link href="/join" data-testid="empty-join-server" className="block w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-primary text-sm font-semibold mb-5 hover:bg-primary/20">Войти по приглашению друга</Link>
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
