import { useEffect, useRef } from 'react';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';

/**
 * Живой эквалайзер — если передан LiveKit audioTrack, читаем реальный FFT из его
 * MediaStreamTrack через WebAudio AnalyserNode. Без трека — красивая псевдо-анимация
 * для превью (карточка «слушает» — плоская линия, «говорит» — волна).
 */

type Props = {
  bars?: number;
  height?: number;
  width?: number;
  active?: boolean;
  className?: string;
  seed?: number;
  gradient?: boolean;
  /** Если передан — используем настоящий FFT. */
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | null;
};

export function Waveform({
  bars = 28,
  height = 44,
  width = 132,
  active = true,
  className = '',
  seed = 0,
  gradient = true,
  audioTrack = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  // Инициализация WebAudio для реального FFT
  useEffect(() => {
    if (!audioTrack) {
      cleanupAudio();
      return;
    }
    const mst = audioTrack.mediaStreamTrack;
    if (!mst) return;

    try {
      // Один AudioContext на компонент — переиспользуем
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });

      const stream = new MediaStream([mst]);
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;             // 64 бина — хватает для 28 полос
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (err) {
      // Некоторые треки нельзя переиспользовать (уже consumed) — fallback на псевдо
      console.warn('[waveform] fallback to fake FFT', err);
      cleanupAudio();
    }

    return cleanupAudio;

    function cleanupAudio() {
      try { sourceRef.current?.disconnect(); } catch { /* noop */ }
      sourceRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
    }
  }, [audioTrack]);

  // Отрисовка
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const gap = Math.max(2, Math.floor(width / bars / 3));
    const barWidth = (width - gap * (bars - 1)) / bars;

    // Плавно затухающие пики — «хвост» после звука
    const peaks = new Float32Array(bars);
    const targets = new Float32Array(bars);

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      let fill: string | CanvasGradient = 'hsl(189 95% 55%)';
      if (gradient) {
        const g = ctx.createLinearGradient(0, 0, 0, height);
        g.addColorStop(0, 'hsl(189 95% 70% / 1)');
        g.addColorStop(0.5, 'hsl(189 95% 55% / 0.95)');
        g.addColorStop(1, 'hsl(189 95% 40% / 0.55)');
        fill = g;
      }
      ctx.fillStyle = fill;

      // Заполняем targets реальными данными или синтезом
      if (analyserRef.current && dataRef.current && active) {
        analyserRef.current.getByteFrequencyData(dataRef.current);
        const bin = dataRef.current;
        // Раскладываем 64 бина в bars полос симметрично от центра (низы посередине)
        const usable = Math.min(bin.length, 48); // отбрасываем самые высокие частоты — они шумят
        const half = Math.floor(bars / 2);
        for (let i = 0; i < bars; i++) {
          const dist = Math.abs(i - half);
          const binIdx = Math.floor((dist / half) * (usable - 1));
          const v = bin[binIdx] / 255;
          // Бустим тихие частоты, но не даём улететь в 1.0
          targets[i] = Math.min(1, Math.pow(v, 0.7) * 1.4);
        }
      } else if (active) {
        // Псевдо-EQ для превью
        const phase = t * 0.006 + seed;
        for (let i = 0; i < bars; i++) {
          const centerBias = 1 - Math.abs(i - bars / 2) / (bars / 2);
          const wobble =
            Math.sin(phase + i * 0.5) * 0.35 +
            Math.sin(phase * 1.7 + i * 0.31) * 0.35 +
            Math.sin(phase * 0.4 + i * 0.9) * 0.3;
          targets[i] = (0.5 + wobble * 0.5) * (0.35 + centerBias * 0.65);
        }
      } else {
        for (let i = 0; i < bars; i++) targets[i] = 0;
      }

      for (let i = 0; i < bars; i++) {
        // Attack — быстро, decay — плавно
        if (targets[i] > peaks[i]) peaks[i] = targets[i];
        else peaks[i] += (targets[i] - peaks[i]) * 0.15;

        const barH = Math.max(2, peaks[i] * height);
        const x = i * (barWidth + gap);
        const y = (height - barH) / 2;
        const r = Math.min(barWidth / 2, 3);
        drawRoundedRect(ctx, x, y, barWidth, barH, r);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    if (active || analyserRef.current) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      // Плоская mute-линия
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'hsl(0 0% 30%)';
      for (let i = 0; i < bars; i++) {
        const x = i * (barWidth + gap);
        const y = (height - 2) / 2;
        drawRoundedRect(ctx, x, y, barWidth, 2, 1);
      }
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [bars, height, width, active, seed, gradient, audioTrack]);

  return <canvas ref={canvasRef} className={className} style={{ width, height }} />;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

/** Мини-волна из 3 баров — для сайдбара / компактных мест. */
export function MiniBars({ active = true, className = '' }: { active?: boolean; className?: string }) {
  if (!active) {
    return (
      <div className={`flex items-end gap-[2px] h-3 ${className}`}>
        <span className="w-[2px] h-[2px] rounded-full bg-muted-foreground" />
        <span className="w-[2px] h-[2px] rounded-full bg-muted-foreground" />
        <span className="w-[2px] h-[2px] rounded-full bg-muted-foreground" />
      </div>
    );
  }
  return (
    <div className={`flex items-end gap-[2px] h-3 ${className}`}>
      <span className="w-[2px] rounded-full bg-primary mini-bar-a" />
      <span className="w-[2px] rounded-full bg-primary mini-bar-b" />
      <span className="w-[2px] rounded-full bg-primary mini-bar-c" />
    </div>
  );
}
