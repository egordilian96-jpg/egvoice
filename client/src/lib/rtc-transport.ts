export type NetworkMode = 'auto' | 'relay' | 'relay-tcp';

/** Retain only advertised TURN/TCP or TURN/TLS endpoints, with their original
 * short-lived credentials. Never invent endpoints or persist credentials. */
export function routeRtcConfiguration(config: RTCConfiguration = {}, mode: NetworkMode): RTCConfiguration {
  if (mode === 'auto') return config;
  const result = { ...config, iceTransportPolicy: 'relay' as RTCIceTransportPolicy };
  if (mode !== 'relay-tcp' || !config.iceServers?.length) return result;
  result.iceServers = config.iceServers.flatMap(server => {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => {
      const value = url.toLowerCase();
      return value.startsWith('turns:') ? !/[?&]transport=udp(?:&|$)/.test(value)
        : value.startsWith('turn:') && /[?&]transport=tcp(?:&|$)/.test(value);
    });
    return urls.length ? [{ ...server, urls }] : [];
  });
  if (!result.iceServers.length) throw new Error('TURN_TCP_UNAVAILABLE: server did not advertise TURN/TCP or TURN/TLS');
  return result;
}

/** The browser RTC API is wrapped only for the active voice session. This also
 * covers server ICE settings applied after construction and SDK reconnects,
 * without accessing private LiveKit configuration methods. */
export function monitorRtcTransport(mode: NetworkMode) {
  const Original = window.RTCPeerConnection;
  const peers: RTCPeerConnection[] = [];
  if (!Original) return { stop() {}, summary: async () => ['rtc=unavailable'] };
  class RoutedConnection extends Original {
    constructor(config?: RTCConfiguration) {
      super(routeRtcConfiguration(config, mode));
      peers.push(this);
      if (peers.length > 8) peers.shift();
    }
    setConfiguration(config: RTCConfiguration) {
      super.setConfiguration(routeRtcConfiguration(config, mode));
    }
  }
  window.RTCPeerConnection = RoutedConnection;
  return {
    stop() {
      if (window.RTCPeerConnection === RoutedConnection) window.RTCPeerConnection = Original;
    },
    async summary(): Promise<string[]> {
      return Promise.all(peers.map(async (pc, i) => {
        const parts = [`pc${i}: connection=${pc.connectionState} ice=${pc.iceConnectionState} signaling=${pc.signalingState}`];
        try {
          const stats = await pc.getStats();
          for (const s of stats.values()) {
            if (s.type === 'transport' && s.selectedCandidatePairId) {
              const pair = stats.get(s.selectedCandidatePairId);
              const local = stats.get(pair?.localCandidateId);
              const remote = stats.get(pair?.remoteCandidateId);
              const allowed = (v: unknown) => ['host', 'srflx', 'prflx', 'relay', 'udp', 'tcp', 'tls'].includes(String(v)) ? v : 'unknown';
              parts.push(`selected=${allowed(local?.candidateType)}/${allowed(remote?.candidateType)} protocol=${allowed(local?.protocol)} relayProtocol=${allowed(local?.relayProtocol)}`);
            }
            if (s.type === 'outbound-rtp' && s.kind === 'audio') parts.push(`audioPacketsSent=${Number(s.packetsSent) || 0}`);
          }
        } catch { parts.push('stats=unavailable'); }
        return parts.join(' ');
      }));
    },
  };
}
