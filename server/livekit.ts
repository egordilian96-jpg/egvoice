import { AccessToken } from 'livekit-server-sdk';

// Credentials are server-side environment values only. No embedded fallbacks.
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
export const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
export const liveKitConfigured = () => !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);

/**
 * Создаёт короткоживущий access-токен для клиента LiveKit.
 * roomName — id голосового канала (строим как "channel-<channelId>").
 */
export async function createLiveKitToken(params: {
  userId: string;
  nickname: string;
  channelId: string;
}): Promise<string> {
  if (!liveKitConfigured()) throw new Error('Voice server is not configured');
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
