import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Person = { id: string; nickname: string; avatarColor: string; relationship?: 'none' | 'friend' | 'incoming' | 'outgoing' };
type Lists = { friends: Person[]; incoming: Person[]; outgoing: Person[] };
const button = 'rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-40';
export default function Friends() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState(''), [query, setQuery] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const list = useQuery<Lists>({
    queryKey: ['/api/friends'], retry: false, refetchInterval: 10000,
    queryFn: async () => {
      const r = await api.get<Lists>('/api/friends');
      if (!Array.isArray(r?.friends) || !Array.isArray(r?.incoming) || !Array.isArray(r?.outgoing)) {
        throw new Error('Поиск и заявки ещё не активированы на этом сервере. Пока используй приглашение по ссылке или коду.');
      }
      return r;
    },
  });
  const search = useQuery<{ users: Person[] }>({
    queryKey: ['friend-search', query], enabled: query.length >= 2 && !!list.data, retry: false,
    queryFn: () => api.get(`/api/users/search?q=${encodeURIComponent(query)}`),
  });
  async function act(person: Person, action: 'send' | 'accept' | 'decline' | 'cancel') {
    if (busy) return;
    setBusy(person.id); setError('');
    try {
      if (action === 'send') await api.post('/api/friends/requests', { userId: person.id });
      else await api.post(`/api/friends/requests/${encodeURIComponent(person.id)}/${action}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['/api/friends'] }), qc.invalidateQueries({ queryKey: ['friend-search'] })]);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось выполнить действие. Повтори.'); }
    finally { setBusy(''); }
  }
  function row(p: Person, relationship: string) {
    return <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center" style={{ backgroundColor: p.avatarColor }}>{p.nickname.slice(0, 1)}</div>
      <div className="flex-1 min-w-0"><div className="font-medium truncate">{p.nickname}</div><div className="text-xs text-muted-foreground break-all">ID: {p.id}</div></div>
      {relationship === 'none' && <button disabled={!!busy} className={button} onClick={() => void act(p, 'send')}>Добавить в друзья</button>}
      {relationship === 'incoming' && <><button disabled={!!busy} className={`${button} text-primary`} onClick={() => void act(p, 'accept')}>Принять</button><button disabled={!!busy} className={button} onClick={() => void act(p, 'decline')}>Отклонить</button></>}
      {relationship === 'outgoing' && <><span className="text-xs text-muted-foreground">Заявка отправлена</span><button disabled={!!busy} className={button} onClick={() => void act(p, 'cancel')}>Отменить</button></>}
      {relationship === 'friend' && <span className="text-sm text-primary">В друзьях</span>}
    </li>;
  }
  return <main className="min-h-screen bg-background p-4 sm:p-8 !pb-32">
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/" className="text-sm text-primary">← К каналам</Link>
      <header><h1 className="font-display text-2xl font-semibold">Друзья</h1><p className="text-sm text-muted-foreground mt-2">Найди друга по нику или точному ID и отправь заявку. Он должен её принять.</p>
        <p className="text-xs text-muted-foreground mt-2 break-all">Твой ID: <span className="select-all">{user?.id}</span></p></header>
      {list.isLoading ? <p role="status">Загружаем друзей…</p> : list.error ? <section role="alert" className="border border-amber-400/30 bg-amber-400/10 rounded-xl p-4 text-sm">
        <p>{list.error.message}</p><button className={`${button} mt-3`} onClick={() => void list.refetch()}>Повторить</button>
        <Link href="/join" className="block mt-3 text-primary">Войти по ссылке или коду</Link>
      </section> : <>
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setQuery(q.trim()); }}>
          <input aria-label="Ник или ID друга" data-testid="friend-search" value={q} maxLength={40} onChange={e => setQ(e.target.value)}
            className="flex-1 min-w-0 rounded-lg bg-secondary px-3 py-3 text-sm" placeholder="Ник или ID друга, минимум 2 символа" />
          <button disabled={q.trim().length < 2} className={`${button} text-primary`}>Найти</button>
        </form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {query && <section className="space-y-3"><h2 className="font-semibold">Результаты поиска</h2>
          {search.isFetching ? <p>Ищем…</p> : search.error ? <p role="alert">{search.error.message}</p> : search.data?.users.length ? <ul className="space-y-2">{search.data.users.map(p => row(p, p.relationship || 'none'))}</ul> : <p className="text-sm text-muted-foreground">Никого не нашли. Уточни ник или попроси точный ID.</p>}
        </section>}
        {(['incoming', 'outgoing', 'friends'] as const).map(key => <section key={key} className="space-y-3" data-testid={`friends-${key}`}>
          <h2 className="font-semibold">{{ incoming: 'Входящие заявки', outgoing: 'Исходящие заявки', friends: 'Твои друзья' }[key]} · {list.data?.[key].length || 0}</h2>
          {list.data?.[key].length ? <ul className="space-y-2">{list.data[key].map(p => row(p, key === 'friends' ? 'friend' : key))}</ul> : <p className="text-sm text-muted-foreground">Пока пусто</p>}
        </section>)}
        <p className="text-xs text-muted-foreground">Для совместного звонка нужно также войти на один сервер по приглашению. Добавление в друзья не включает микрофон и не даёт автоматический доступ к серверам.</p>
      </>}
    </div>
  </main>;
}
