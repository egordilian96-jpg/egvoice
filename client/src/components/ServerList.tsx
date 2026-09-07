import { useState } from 'react';
import { Plus, Home } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError, type Server } from '@/lib/api';

type Props = {
  servers: Server[];
  activeServerId: string | null;
  onSelect: (id: string) => void;
};

export function ServerList({ servers, activeServerId, onSelect }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <aside className="w-[72px] shrink-0 bg-sidebar/60 border-r border-sidebar-border flex flex-col items-center gap-2 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="w-12 h-12 rounded-2xl bg-secondary hover-elevate flex items-center justify-center text-primary transition-all"
              data-testid="button-home"
            >
              <Home className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Личные сообщения</TooltipContent>
        </Tooltip>

        <div className="w-8 h-px bg-sidebar-border my-1" />

        {servers.map((s) => {
          const active = s.id === activeServerId;
          const initials = s.name.slice(0, 2).toUpperCase();
          return (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelect(s.id)}
                  className={`relative w-12 h-12 rounded-2xl bg-secondary hover-elevate flex items-center justify-center font-semibold text-sm transition-all ${active ? 'rounded-xl bg-primary/20 text-primary' : 'text-foreground'}`}
                  data-testid={`button-server-${s.id}`}
                >
                  {initials}
                  {active && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-primary" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{s.name}</TooltipContent>
            </Tooltip>
          );
        })}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCreateOpen(true)}
              className="w-12 h-12 rounded-2xl bg-secondary/50 hover-elevate flex items-center justify-center text-muted-foreground hover:text-primary transition-all"
              data-testid="button-add-server"
            >
              <Plus className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Создать сервер</TooltipContent>
        </Tooltip>
      </aside>

      <CreateServerDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { onSelect(id); setCreateOpen(false); }} />
    </>
  );
}

function CreateServerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => api.post<{ server: Server }>('/api/servers', { name: name.trim() }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['/api/servers'] });
      setName('');
      onCreated(r.server.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Не удалось создать сервер'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый сервер</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}
          className="space-y-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Катка вечером"
            className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            required
            minLength={2}
            maxLength={40}
          />
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</div>
          )}
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover-elevate disabled:opacity-60"
          >
            {create.isPending ? 'Создаю…' : 'Создать'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
