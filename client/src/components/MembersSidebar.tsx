import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from './Avatar';
import type { Member } from '@/lib/api';
import { isOnline } from '@/lib/format';

export function MembersSidebar({ serverId }: { serverId: string | null }) {
  const { data } = useQuery<{ members: Member[] }>({
    queryKey: [`/api/servers/${serverId}/members`],
    enabled: !!serverId,
  });
  const members = data?.members ?? [];
  const online = members.filter((m) => isOnline(m.lastSeenAt));
  const offline = members.filter((m) => !isOnline(m.lastSeenAt));

  if (!serverId) return null;

  return (
    <aside className="w-60 shrink-0 hidden lg:flex flex-col bg-card border-l border-border/60 overflow-y-auto py-3">
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
      {members.length === 0 && (
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
