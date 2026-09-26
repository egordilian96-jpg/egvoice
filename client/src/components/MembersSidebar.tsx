import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from './Avatar';
import type { Member } from '@/lib/api';
import { isOnline } from '@/lib/format';
import { useVoice } from '@/lib/voice';
import { useAuth } from '@/lib/auth';

export function MembersSidebar({ serverId }: { serverId: string | null }) {
  const voice = useVoice();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery<{ members: Member[] }>({
    queryKey: [`/api/servers/${serverId}/members`],
    enabled: !!serverId,
    refetchInterval: 10000,
  });
  const members = data?.members ?? [];
  const isPresent = (m: Member) => m.id === user?.id || voice.participants.some(p => p.identity === m.id) || isOnline(m.lastSeenAt);
  const online = members.filter(isPresent);
  const offline = members.filter(m => !isPresent(m));

  if (!serverId) return null;

  return (
    <aside className="w-full md:w-[232px] shrink-0 flex flex-col bg-card border-l border-border/60 overflow-y-auto py-3">
      {isLoading && <p className="px-4 text-xs text-muted-foreground">Загружаем участников…</p>}
      {isError && <div className="px-4 text-xs">Не удалось обновить участников. <button className="text-primary" onClick={() => void refetch()}>Повторить</button></div>}
      {online.length > 0 && (
        <Group title={`Онлайн — ${online.length}`}>
          {online.map((u) => <MemberRow key={u.id} user={u} online />)}
        </Group>
      )}
      {offline.length > 0 && (
        <Group title={`Оффлайн — ${offline.length}`}>
          {offline.map((u) => <MemberRow key={u.id} user={u} muted />)}
        </Group>
      )}
      {!isLoading && !isError && members.length === 0 && (
        <div className="px-4 text-xs text-muted-foreground">Пока никого — пригласи друзей ссылкой.</div>
      )}
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-4 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</div>
      <div className="space-y-0.5 px-2">{children}</div>
    </div>
  );
}

function MemberRow({ user, muted = false, online = false }: { user: Member; muted?: boolean; online?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded hover-elevate ${muted ? 'opacity-50' : ''}`} data-testid={`member-${user.id}`}>
      <UserAvatar user={user} size={28} showStatus online={online} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.nickname}</div>
      </div>
    </div>
  );
}
