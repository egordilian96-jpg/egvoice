import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecretdevsecretdevsecretdev12345';
export const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';

/**
 * Создаёт короткоживущий access-токен для клиента LiveKit.
 * roomName — id голосового канала (строим как "channel-<channelId>").
 */
export async function createLiveKitToken(params: {
  userId: string;
  nickname: string;
  channelId: string;
}): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: params.userId,
    name: params.nickname,
    ttl: 60 * 60, // 1 час
  });
  at.addGrant({
    room: `channel-${params.channelId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return await at.toJwt();
}
