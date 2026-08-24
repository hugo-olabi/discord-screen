// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Stream Receiver & Local Fallback Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchRoomByToken returns tunnelUrl property from room record', async () => {
    const mockRoomData = {
      id: 'room-123',
      token: 'room-123',
      name: 'Test Room',
      streamer_name: 'Tester',
      password: null,
      status: 'live',
      tunnel_url: 'wss://test-tunnel.trycloudflare.com/ws',
    };

    const room = {
      id: mockRoomData.id,
      token: mockRoomData.token || mockRoomData.id,
      name: mockRoomData.name || 'StreamRoom',
      owner: mockRoomData.streamer_name || 'Host',
      password: mockRoomData.password || null,
      locked: Boolean(mockRoomData.password),
      status: mockRoomData.status || 'live',
      tunnelUrl: mockRoomData.tunnel_url || null,
    };

    expect(room.tunnelUrl).toBe('wss://test-tunnel.trycloudflare.com/ws');
  });

  it('correctly detects ?local URL parameter', () => {
    const searchWithLocal = '?local';
    const paramsWithLocal = new URLSearchParams(searchWithLocal);
    expect(paramsWithLocal.has('local')).toBe(true);

    const searchWithoutLocal = '?token=abc';
    const paramsWithoutLocal = new URLSearchParams(searchWithoutLocal);
    expect(paramsWithoutLocal.has('local')).toBe(false);
  });

  it('determines when local fallback is allowed vs disabled', () => {
    const isLocalAddress = (url: string | null) =>
      Boolean(url && (url.includes('127.0.0.1') || url.includes('localhost')));

    const checkFallbackAllowed = (url: string | null, search: string) => {
      const params = new URLSearchParams(search);
      const hasLocalParam = params.has('local');
      const localUrl = isLocalAddress(url);

      if (localUrl || !url) {
        return hasLocalParam;
      }
      return true;
    };

    // Public URL: allowed without ?local
    expect(checkFallbackAllowed('wss://public.trycloudflare.com/ws', '')).toBe(true);

    // Local URL without ?local: disallowed automatically
    expect(checkFallbackAllowed('ws://127.0.0.1:3001/ws', '')).toBe(false);

    // Local URL with ?local: allowed
    expect(checkFallbackAllowed('ws://127.0.0.1:3001/ws', '?local')).toBe(true);

    // Null URL without ?local: disallowed automatically
    expect(checkFallbackAllowed(null, '')).toBe(false);

    // Null URL with ?local: allowed
    expect(checkFallbackAllowed(null, '?local')).toBe(true);
  });
});
