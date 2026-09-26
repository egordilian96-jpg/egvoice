import { useEffect, useRef } from 'react';
import { getToken, getWsUrl } from './api';

export type WsEvent =
  | { type: 'hello'; data: { userId: string } }
  | { type: 'message'; data: unknown }
  | { type: 'member-joined'; data: { userId: string; nickname: string } };

/**
 * Держит открытый WebSocket пока смонтирован компонент.
 * Автопереподключение каждые 3 сек при обрыве.
 * onEvent будет вызван и на hello, и на message, и на member-joined.
 */
export function useWebSocket(enabled: boolean, onEvent: (e: WsEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByUnmount = false;

    const connect = () => {
      const token = getToken();
      if (!token) return;
      // Keep backend path prefixes, e.g. /port/5000, for chat/member events.
      const url = `${getWsUrl('/ws')}?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as WsEvent;
          onEventRef.current(parsed);
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (closedByUnmount) return;
        reconnectTimer = window.setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        try { ws?.close(); } catch { /* noop */ }
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* noop */ }
    };
  }, [enabled]);
}
