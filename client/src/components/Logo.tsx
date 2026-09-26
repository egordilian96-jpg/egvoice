// Логотип EG Voice — минимальный geometric wordmark в духе LiveKit.
// Символ: круг + вертикальная штриха (waveform-первое-биение).

type Props = {
  className?: string;
  showWordmark?: boolean;
};

export function Logo({ className = '', showWordmark = true }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`} aria-label="EG Voice">
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1.5" y="1.5" width="29" height="29" rx="9" stroke="currentColor" strokeWidth="2" />
        <path d="M10 12v8M14 9v14M18 12v8M22 14.5v3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {showWordmark && (
        <span className="font-display font-semibold text-[15px] tracking-tight">EG Voice</span>
      )}
    </div>
  );
}
