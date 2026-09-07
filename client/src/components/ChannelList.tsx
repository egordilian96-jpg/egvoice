import { useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Volume2, Hash, UserPlus, Mic, MicOff, Headphones, HeadphoneOff, Cog, Plus, LogOut } from 'lucide-react';
import { UserAvatar } from './Avatar';
import { MiniBars } from './Waveform';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError, type Channel, type Server } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { VoiceParticipant } from '@/lib/voice';

type Props = {
  server: Server | null;
  channels: Channel[];
  activeChannelId: string | null;
  connectedChannelId: string | null;
  voiceParticipants: VoiceParticipant[];
  onSelectChannel: (c: Channel) => void;
  onJoinVoice: (id: string) => void;
  onOpenInvite: () => void;
  micMuted: boolean;
  outputMuted: boolean;
  onToggleMic: () => void;
  onToggleOutput: () => void;
};

export function ChannelList({
  server, channels, activeChannelId, connectedChannelId, voiceParticipants,
  onSelectChannel, onJoinVoice, onOpenInvite,
  micMuted, outputMuted, onToggleMic, onToggleOutput,
}: Props) {
  const { user, logout } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const voiceChannels = channels.filter((c) => c.type === 'voice');
  const textChannels = channels.filter((c) => c.type === 'text');

  return (
    <>
      <aside className="w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="h-12 px-4 flex items-center justify-between border-b border-sidebar-border/60">
          <div className="font-display font-semibold text-sm truncate tracking-tight">{server?.name ?? 'Сервер'}</div>
          <button
            onClick={() => server && setCreateOpen(true)}
            className="hover-elevate rounded p-1"
            data-testid="button-server-settings"
            title="Добавить канал"
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {voiceChannels.length > 0 && (
            <ChannelGroup title="Голосовые каналы">
              {voiceChannels.map((c) => (
                <VoiceChannelRow
                  key={c.id}
                  channel={c}
                  isActive={activeChannelId === c.id}
                  isConnected={connectedChannelId === c.id}
                  participants={connectedChannelId === c.id ? voiceParticipants : []}
                  onSelect={() => onSelectChannel(c)}
                  onJoin={() => onJoinVoice(c.id)}
                />
              ))}
            </ChannelGroup>
          )}

          {textChannels.length > 0 && (
            <ChannelGroup title="Текстовые каналы">
              {textChannels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectChannel(c)}
                  className={`w-full text-left rounded px-2 py-1.5 flex items-center gap-2 hover-elevate text-sm ${activeChannelId === c.id ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground'}`}
                  data-testid={`button-channel-${c.id}`}
                >
                  <Hash className="w-4 h-4 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </ChannelGroup>
          )}

          {server && (
            <div className="px-2">
              <button
                onClick={onOpenInvite}
                className="w-full rounded border border-dashed border-sidebar-border py-2 text-xs text-muted-foreground hover-elevate flex items-center justify-center gap-2"
                data-testid="button-invite"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Пригласить друга
              </button>
            </div>
          )}
        </div>

        {user && (
          <div className="h-14 shrink-0 border-t border-sidebar-border/60 bg-sidebar-accent/40 px-2 flex items-center gap-2">
            <UserAvatar user={user} size={32} showStatus online />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" data-testid="text-username">{user.nickname}</div>
              <div className="text-[11px] text-muted-foreground truncate">online</div>
            </div>
            <button
              onClick={onToggleMic}
              className={`hover-elevate rounded p-1.5 ${micMuted ? 'text-destructive' : 'text-muted-foreground'}`}
              data-testid="button-toggle-mic"
              title="Микрофон"
            >
              {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={onToggleOutput}
              className={`hover-elevate rounded p-1.5 ${outputMuted ? 'text-destructive' : 'text-muted-foreground'}`}
              data-testid="button-toggle-output"
              title="Звук"
            >
              {outputMuted ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
            </button>
            <Link href="/settings">
              <button className="hover-elevate rounded p-1.5 text-muted-foreground" data-testid="button-open-settings" title="Настройки">
                <Cog className="w-4 h-4" />
              </button>
            </Link>
            <button
              onClick={logout}
              className="hover-elevate rounded p-1.5 text-muted-foreground"
              title="Выйти"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {server && (
        <CreateChannelDialog
          serverId={server.id}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </>
  );
}

function ChannelGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2 pb-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function VoiceChannelRow({
  channel, isActive, isConnected, participants, onSelect, onJoin,
}: {
  channel: Channel;
  isActive: boolean;
  isConnected: boolean;
  participants: VoiceParticipant[];
  onSelect: () => void;
  onJoin: () => void;
}) {
  return (
    <div>
      <button
        onClick={() => { onSelect(); if (!isConnected) onJoin(); }}
        className={`w-full text-left rounded px-2 py-1.5 flex items-center gap-2 hover-elevate text-sm ${isActive ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground'}`}
        data-testid={`button-voice-${channel.id}`}
      >
        <Volume2 className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">{channel.name}</span>
        {isConnected && <span className="text-[10px] text-primary font-semibold">ВЫ</span>}
      </button>
      {participants.length > 0 && (
        <div className="pl-6 pt-0.5 space-y-0.5">
          {participants.map((p) => (
            <div key={p.identity} className="flex items-center gap-2 py-0.5 rounded hover-elevate px-1" data-testid={`voice-user-${p.identity}`}>
              <UserAvatar user={{ id: p.identity, nickname: p.name, avatarColor: '#1FD5F9' }} size={20} speaking={p.isSpeaking} />
              <span className={`text-xs flex-1 truncate ${p.isSpeaking ? 'text-primary' : 'text-muted-foreground'}`}>
                {p.name}{p.isLocal ? ' (ты)' : ''}
              </span>
              {p.isSpeaking && <MiniBars />}
              {p.isMicMuted && <MicOff className="w-3 h-3 text-muted-foreground" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateChannelDialog({ serverId, open, onClose }: { serverId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => api.post<{ channel: Channel }>(`/api/servers/${serverId}/channels`, { name: name.trim(), type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/servers/${serverId}/channels`] });
      setName('');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Не удалось создать канал'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый канал</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }} className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('text')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium border ${type === 'text' ? 'bg-primary/15 border-primary text-primary' : 'bg-secondary border-transparent text-muted-foreground'}`}
            >
              <Hash className="inline w-3.5 h-3.5 mr-1" />Текстовый
            </button>
            <button
              type="button"
              onClick={() => setType('voice')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium border ${type === 'voice' ? 'bg-primary/15 border-primary text-primary' : 'bg-secondary border-transparent text-muted-foreground'}`}
            >
              <Volume2 className="inline w-3.5 h-3.5 mr-1" />Голосовой
            </button>
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="имя-канала"
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            required
            minLength={1}
            maxLength={30}
          />
          {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</div>}
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover-elevate disabled:opacity-60"
          >
            {create.isPending ? 'Создаю…' : 'Создать канал'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
