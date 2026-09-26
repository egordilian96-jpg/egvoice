import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Mic, Keyboard, User, Palette } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useVoice } from '@/lib/voice';
import { LiveAudioSettings, VoiceToolbar } from '@/components/VoiceControls';

const sections = [
  { id: 'audio', label: 'Голос и звук', icon: Mic },
  { id: 'keys', label: 'Клавиши', icon: Keyboard },
  { id: 'profile', label: 'Профиль', icon: User },
  { id: 'appearance', label: 'Внешний вид', icon: Palette },
] as const;
export default function Settings() {
  const [section, setSection] = useState<string>('audio');
  const { user, logout } = useAuth();
  const voice = useVoice();
  const [, navigate] = useLocation();
  return <div className="h-[100dvh] w-screen flex bg-background text-foreground">
    <aside className="w-28 sm:w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
      <Link href="/"><button className="px-3 h-14 flex items-center gap-2 text-sm" data-testid="button-back"><ArrowLeft size={16} />Назад</button></Link>
      <nav className="p-2 space-y-1">
        {sections.map(s => <button key={s.id} data-testid={`button-section-${s.id}`} onClick={() => setSection(s.id)}
          className={`w-full text-left p-2 rounded-lg flex flex-wrap items-center gap-2 text-sm ${section === s.id ? 'bg-sidebar-accent' : 'text-muted-foreground'}`}>
          <s.icon size={16} />{s.label}
        </button>)}
      </nav>
      {voice.connectedChannelId && <p className="mt-auto p-3 text-xs text-primary">Ты остаёшься в голосовом канале</p>}
    </aside>
    <main className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 sm:p-8">
        {section === 'audio' && <LiveAudioSettings />}
        {section === 'keys' && <div className="space-y-5">
          <h1 className="text-2xl font-semibold">Горячие клавиши</h1>
          <p className="text-sm text-amber-300">Работают в активном окне. Глобальные клавиши в игре пока не подключены. Во время ввода текста команды не срабатывают.</p>
          {[['V', 'Передача по кнопке'], ['M', 'Микрофон вкл / выкл'], ['Ctrl + Shift + D', 'Звук и микрофон вкл / выкл'], ['Ctrl + Shift + X', 'Выйти из голоса']].map(([key, hint]) =>
            <div key={key} className="flex flex-wrap justify-between gap-3 border-b border-border pb-3 text-sm"><span>{hint}</span><kbd>{key}</kbd></div>)}
          <VoiceToolbar />
        </div>}
        {section === 'profile' && <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Профиль</h1>
          <p>{user?.nickname}</p><p className="text-muted-foreground">{user?.email}</p>
          <p className="text-xs text-muted-foreground">Редактирование профиля и смена пароля ещё не подключены. Здесь показаны данные твоего аккаунта, а не пример.</p>
          <button className="border border-destructive rounded-lg p-3 text-destructive" onClick={() => {
            if (voice.room && !window.confirm('Выйти из аккаунта? Голосовой звонок завершится.')) return;
            logout(); navigate('/login');
          }}>Выйти из аккаунта</button>
        </div>}
        {section === 'appearance' && <><h1 className="text-2xl font-semibold mb-4">Внешний вид</h1><p className="text-sm text-muted-foreground">В MVP доступна тёмная тема.</p></>}
      </div>
    </main>
  </div>;
}
