import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type LocalParticipant,
  type Participant,
  type LocalAudioTrack,
  type RemoteAudioTrack,
} from 'livekit-client';
import { api } from './api';

export type VoiceParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMicMuted: boolean;
  /** 0..1 — текущая громкость от LiveKit (server-side VAD). */
  audioLevel: number;
  /** Живой audio track для FFT-анализа (null если мьют или не публикуется). */
  audioTrack: LocalAudioTrack | RemoteAudioTrack | null;
};

/**
 * Хук для голосового канала LiveKit.
 * - joinChannel(channelId) — берёт токен, подключается, включает микрофон.
 * - leave() — отключается.
 * Возвращает список участников и speaking-статусы.
 */
export function useVoice() {
  const [room, setRoom] = useState<Room | null>(null);
  const [connectedChannelId, setConnectedChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [micMuted, setMicMuted] = useState(false);
  const [outputMuted, setOutputMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);

  const rebuild = (r: Room) => {
    const list: VoiceParticipant[] = [];
    const push = (p: Participant, isLocal: boolean) => {
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      const track = micPub?.track ?? null;
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        isLocal,
        isSpeaking: p.isSpeaking,
        isMicMuted: micPub ? micPub.isMuted : (isLocal ? false : true),
        audioLevel: p.audioLevel ?? 0,
        audioTrack: (track && track.kind === Track.Kind.Audio ? (track as LocalAudioTrack | RemoteAudioTrack) : null),
      });
    };
    push(r.localParticipant, true);
    r.remoteParticipants.forEach((p) => push(p, false));
    setParticipants(list);
  };

  const wireEvents = (r: Room) => {
    const refresh = () => rebuild(r);
    r
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.TrackPublished, refresh)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.Disconnected, () => {
        setConnectedChannelId(null);
        setParticipants([]);
        setRoom(null);
        roomRef.current = null;
      });
  };

  const joinChannel = async (channelId: string) => {
    if (connecting) return;
    setError(null);
    setConnecting(true);
    try {
      // Если уже в другой комнате — отключимся
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }
      const { token, url } = await api.post<{ token: string; url: string }>('/api/livekit/token', { channelId });
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      wireEvents(r);
      await r.connect(url, token);
      try {
        await r.localParticipant.setMicrophoneEnabled(true);
        setMicMuted(false);
      } catch (micErr) {
        console.warn('[voice] микрофон недоступен', micErr);
        setError('Не удалось получить доступ к микрофону');
      }
      roomRef.current = r;
      setRoom(r);
      setConnectedChannelId(channelId);
      rebuild(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подключиться');
    } finally {
      setConnecting(false);
    }
  };

  const leave = async () => {
    const r = roomRef.current;
    if (!r) return;
    await r.disconnect();
    roomRef.current = null;
    setRoom(null);
    setConnectedChannelId(null);
    setParticipants([]);
  };

  const toggleMic = async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !micMuted;
    await r.localParticipant.setMicrophoneEnabled(!next);
    setMicMuted(next);
    rebuild(r);
  };

  const toggleOutput = () => {
    const next = !outputMuted;
    setOutputMuted(next);
    // Мьютим удалённые аудио-элементы
    document.querySelectorAll<HTMLAudioElement>('audio[data-lk-remote-audio]').forEach((a) => {
      a.muted = next;
    });
  };

  // Обновляем список каждые 500 мс (для isSpeaking, который меняется часто)
  useEffect(() => {
    if (!room) return;
    const iv = window.setInterval(() => rebuild(room), 500);
    return () => window.clearInterval(iv);
  }, [room]);

  // При размонтировании — отключаемся
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect().catch(() => { /* noop */ });
    };
  }, []);

  const clearError = () => setError(null);

  return {
    room,
    connectedChannelId,
    participants,
    micMuted,
    outputMuted,
    connecting,
    error,
    clearError,
    joinChannel,
    leave,
    toggleMic,
    toggleOutput,
  };
}

/**
 * Подписывается на удалённые аудио-дорожки комнаты и рендерит скрытые <audio> тэги —
 * иначе звук от других участников не воспроизводится.
 */
export function useRemoteAudioPlayback(room: Room | null) {
  useEffect(() => {
    if (!room) return;
    const audioEls = new Map<string, HTMLAudioElement>();

    const attach = (participant: RemoteParticipant) => {
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.track && pub.kind === Track.Kind.Audio) {
          const key = `${participant.identity}-${pub.trackSid}`;
          if (audioEls.has(key)) return;
          const el = pub.track.attach() as HTMLAudioElement;
          el.setAttribute('data-lk-remote-audio', 'true');
          el.style.display = 'none';
          document.body.appendChild(el);
          audioEls.set(key, el);
        }
      });
    };

    const detach = (participant: RemoteParticipant) => {
      for (const [key, el] of Array.from(audioEls.entries())) {
        if (key.startsWith(participant.identity + '-')) {
          try { el.pause(); el.remove(); } catch { /* noop */ }
          audioEls.delete(key);
        }
      }
    };

    room.remoteParticipants.forEach(attach);

    room
      .on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => attach(participant))
      .on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => detach(participant))
      .on(RoomEvent.ParticipantDisconnected, (participant) => detach(participant));

    return () => {
      for (const el of Array.from(audioEls.values())) {
        try { el.pause(); el.remove(); } catch { /* noop */ }
      }
      audioEls.clear();
    };
  }, [room]);
}
