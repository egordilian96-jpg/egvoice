import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Mic, Volume2, Keyboard, User, Palette, Sliders } from 'lucide-react';

const SECTIONS = [
  { id: 'audio', label: 'Голос и звук', icon: Mic },
  { id: 'keys', label: 'Клавиши', icon: Keyboard },
  { id: 'profile', label: 'Профиль', icon: User },
  { id: 'appearance', label: 'Внешний вид', icon: Palette },
  { id: 'advanced', label: 'Продвинутое', icon: Sliders },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function Settings() {
  const [section, setSection] = useState<SectionId>('audio');

  return (
    <div className="h-screen w-screen flex bg-background text-foreground">
      {/* Сайдбар настроек */}
      <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <Link href="/">
          <button className="h-14 px-4 flex items-center gap-2 text-sm text-muted-foreground hover-elevate" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            Назад
          </button>
        </Link>
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-4 pb-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Настройки</div>
          <nav className="px-2 space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full text-left rounded px-3 py-2 flex items-center gap-2 text-sm hover-elevate ${section === s.id ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground'}`}
                data-testid={`button-section-${s.id}`}
              >
                <s.icon className="w-4 h-4" />
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Контент */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8">
          {section === 'audio' && <AudioSettings />}
          {section === 'keys' && <KeysSettings />}
          {section === 'profile' && <ProfileSettings />}
          {section === 'appearance' && <AppearanceSettings />}
          {section === 'advanced' && <AdvancedSettings />}
        </div>
      </main>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </header>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-border/50 last:border-0">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

function Select({ value, onChange, options, testId }: { value: string; onChange: (v: string) => void; options: string[]; testId: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-secondary rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
      data-testid={testId}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function Switch({ checked, onChange, testId }: { checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full relative transition-colors ${checked ? 'bg-primary' : 'bg-secondary'}`}
      data-testid={testId}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Slider({ value, onChange, min = 0, max = 100, testId }: { value: number; onChange: (v: number) => void; min?: number; max?: number; testId: string }) {
  return (
    <div className="flex items-center gap-2 w-56">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
        data-testid={testId}
      />
      <span className="text-xs text-muted-foreground font-mono w-9 text-right">{value}</span>
    </div>
  );
}

function AudioSettings() {
  const [input, setInput] = useState('По умолчанию — Blue Yeti');
  const [output, setOutput] = useState('По умолчанию — HyperX Cloud II');
  const [mode, setMode] = useState<'ptt' | 'vad'>('vad');
  const [threshold, setThreshold] = useState(35);
  const [nrMode, setNrMode] = useState<'off' | 'esports' | 'quality'>('esports');

  return (
    <>
      <SectionHeader title="Голос и звук" description="Микрофон, наушники, шумоподавление. Настрой один раз — играй всегда." />

      <Row label="Устройство ввода" hint="Микрофон, который слышат другие">
        <Select value={input} onChange={setInput} options={['По умолчанию — Blue Yeti', 'HyperX QuadCast', 'Realtek HD Audio']} testId="select-input" />
      </Row>

      <Row label="Устройство вывода" hint="Наушники или колонки, в которые ты слышишь других">
        <Select value={output} onChange={setOutput} options={['По умолчанию — HyperX Cloud II', 'SteelSeries Arctis 7', 'Realtek Speakers']} testId="select-output" />
      </Row>

      <Row label="Режим передачи" hint={mode === 'ptt' ? 'Голос идёт только при удержании клавиши' : 'Голос идёт автоматически при разговоре'}>
        <div className="flex bg-secondary rounded-lg p-1">
          <button
            onClick={() => setMode('vad')}
            className={`px-3 py-1 text-xs font-semibold rounded ${mode === 'vad' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            data-testid="button-mode-vad"
          >
            Активация
          </button>
          <button
            onClick={() => setMode('ptt')}
            className={`px-3 py-1 text-xs font-semibold rounded ${mode === 'ptt' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            data-testid="button-mode-ptt"
          >
            Push-to-Talk
          </button>
        </div>
      </Row>

      {mode === 'vad' && (
        <Row label="Порог активации" hint="Ниже — микрофон срабатывает от шёпота, выше — только от крика">
          <Slider value={threshold} onChange={setThreshold} testId="slider-threshold" />
        </Row>
      )}

      <div className="pt-4">
        <div className="text-sm font-medium mb-3">Шумоподавление</div>
        <div className="grid grid-cols-3 gap-2">
          <NrCard
            active={nrMode === 'off'}
            title="Выкл"
            hint="Без обработки — чистый звук микрофона"
            latency="0мс"
            onClick={() => setNrMode('off')}
            testId="button-nr-off"
          />
          <NrCard
            active={nrMode === 'esports'}
            title="Киберспорт"
            hint="Быстрое подавление на CPU, для соревновательных катoк"
            latency="~5мс"
            onClick={() => setNrMode('esports')}
            testId="button-nr-esports"
          />
          <NrCard
            active={nrMode === 'quality'}
            title="Качество"
            hint="Нейросетевое подавление, убирает клавиатуру, вентиляторы, детей"
            latency="~40мс"
            onClick={() => setNrMode('quality')}
            testId="button-nr-quality"
          />
        </div>
      </div>
    </>
  );
}

function NrCard({ active, title, hint, latency, onClick, testId }: {
  active: boolean; title: string; hint: string; latency: string; onClick: () => void; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all hover-elevate ${active ? 'border-primary bg-primary/10' : 'border-card-border bg-card'}`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold">{title}</div>
        <span className={`text-[10px] font-mono ${active ? 'text-primary' : 'text-muted-foreground'}`}>{latency}</span>
      </div>
      <div className="text-[11px] text-muted-foreground leading-snug">{hint}</div>
    </button>
  );
}

function KeysSettings() {
  const [ptt, setPtt] = useState('V');
  const [mute, setMute] = useState('Ctrl+Shift+M');
  const [deafen, setDeafen] = useState('Ctrl+Shift+D');
  const [disconnect, setDisconnect] = useState('Ctrl+Shift+X');
  return (
    <>
      <SectionHeader title="Клавиши" description="Хоткеи работают и в игре — не нужно alt-tab" />
      <Row label="Push-to-Talk"><KeyInput value={ptt} onChange={setPtt} testId="input-key-ptt" /></Row>
      <Row label="Заглушить микрофон"><KeyInput value={mute} onChange={setMute} testId="input-key-mute" /></Row>
      <Row label="Заглушить звук"><KeyInput value={deafen} onChange={setDeafen} testId="input-key-deafen" /></Row>
      <Row label="Отключиться от голоса"><KeyInput value={disconnect} onChange={setDisconnect} testId="input-key-disconnect" /></Row>
    </>
  );
}

function KeyInput({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-secondary rounded px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary w-40 text-center"
      data-testid={testId}
    />
  );
}

function ProfileSettings() {
  const [nick, setNick] = useState('egor');
  return (
    <>
      <SectionHeader title="Профиль" />
      <Row label="Ник" hint="Что видят другие в чате и в списке голоса">
        <input
          type="text"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          className="bg-secondary rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary min-w-[240px]"
          data-testid="input-nickname"
        />
      </Row>
      <Row label="Смена аватара" hint="Пока плейсхолдер — цвет генерируется автоматически">
        <button className="bg-secondary hover-elevate rounded px-3 py-1.5 text-sm" data-testid="button-upload-avatar">Загрузить</button>
      </Row>
      <Row label="Сменить пароль">
        <button className="bg-secondary hover-elevate rounded px-3 py-1.5 text-sm" data-testid="button-change-password">Открыть</button>
      </Row>
      <Row label="Выйти">
        <Link href="/login">
          <button className="text-destructive hover:underline text-sm font-semibold" data-testid="button-logout">Выйти из аккаунта</button>
        </Link>
      </Row>
    </>
  );
}

function AppearanceSettings() {
  return (
    <>
      <SectionHeader title="Внешний вид" description="В MVP только тёмная тема. Светлую подключим позже." />
      <Row label="Тема" hint="Тёмная по умолчанию — глаза не устают вечером">
        <div className="text-sm text-muted-foreground">Тёмная</div>
      </Row>
    </>
  );
}

function AdvancedSettings() {
  const [agc, setAgc] = useState(true);
  const [echo, setEcho] = useState(true);
  const [priority, setPriority] = useState<'normal' | 'high'>('high');

  return (
    <>
      <SectionHeader title="Продвинутое" description="Для тех, кто знает, что делает" />
      <Row label="Автоматическая регулировка громкости" hint="Выравнивает громкость микрофона автоматически"><Switch checked={agc} onChange={setAgc} testId="switch-agc" /></Row>
      <Row label="Эхоподавление" hint="Убирает эхо, если играешь на колонках"><Switch checked={echo} onChange={setEcho} testId="switch-echo" /></Row>
      <Row label="Приоритет процесса" hint="Высокий — голос не пропадает во время игры">
        <div className="flex bg-secondary rounded-lg p-1">
          <button
            onClick={() => setPriority('normal')}
            className={`px-3 py-1 text-xs font-semibold rounded ${priority === 'normal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            data-testid="button-priority-normal"
          >
            Обычный
          </button>
          <button
            onClick={() => setPriority('high')}
            className={`px-3 py-1 text-xs font-semibold rounded ${priority === 'high' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            data-testid="button-priority-high"
          >
            Высокий
          </button>
        </div>
      </Row>
    </>
  );
}
