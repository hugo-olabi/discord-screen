import { createSignal, onMount, onCleanup, createEffect, Show } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import Topbar from '../components/Topbar.jsx';
import TokenLanding from '../components/TokenLanding.jsx';
import StreamStage from '../components/StreamStage.jsx';
import Bottombar from '../components/Bottombar.jsx';
import Toast from '../components/Toast.jsx';

import CreateRoomModal from '../components/modals/CreateRoomModal.jsx';
import JoinRoomModal from '../components/modals/JoinRoomModal.jsx';
import RoomSettingsModal from '../components/modals/RoomSettingsModal.jsx';
import NativeStreamerModal from '../components/modals/NativeStreamerModal.jsx';
import ProfileModal from '../components/modals/ProfileModal.jsx';

import { supabase, fetchRoomByToken, createRoomRecord, cleanupInactiveRooms } from '../services/supabase.js';
import { createBroadcaster } from '../services/broadcaster.js';
import { getCurrentUser, loginWithDiscord, logoutDiscord, generateShortToken } from '../services/auth.js';

import { createAudio } from '../audio.js';

export default function Home() {
  const params = useParams();
  const navigate = useNavigate();

  const [user, setUser] = createSignal({ id: crypto.randomUUID(), name: 'Guest User' });
  const [activeRoom, setActiveRoom] = createSignal(null);
  const [streams, setStreams] = createSignal([]);
  const [participantsCount, setParticipantsCount] = createSignal(0);

  const [toastMessage, setToastMessage] = createSignal('');
  const [toastIsError, setToastIsError] = createSignal(false);

  const [isSharing, setIsSharing] = createSignal(false);
  const [isCamera, setIsCamera] = createSignal(false);
  const [volume, setVolume] = createSignal(1.0);

  // Modals
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [showJoinModal, setShowJoinModal] = createSignal(false);
  const [showSettingsModal, setShowSettingsModal] = createSignal(false);
  const [showNativeModal, setShowNativeModal] = createSignal(false);
  const [showProfileModal, setShowProfileModal] = createSignal(false);

  const [pendingRoom, setPendingRoom] = createSignal(null);
  const [joinError, setJoinError] = createSignal('');

  let broadcaster = null;
  let activeRealtimeChannel = null;
  let cleanupInterval = null;

  let activeWs = null;
  let activeVideoPlayer = null;
  let activeAudioPlayer = null;

  function showToast(msg, isErr = false) {
    setToastMessage(msg);
    setToastIsError(isErr);
    setTimeout(() => {
      setToastMessage('');
    }, 4000);
  }

  function connectToStream(targetRoom) {
    if (activeWs) {
      activeWs.close();
      activeWs = null;
    }
    if (activeAudioPlayer) {
      activeAudioPlayer.stop();
      activeAudioPlayer = null;
    }
    activeVideoPlayer = null;
    setStreams([]);

    if (!targetRoom) return;

    const urlParams = new URLSearchParams(window.location.search);
    const hasLocalParam = urlParams.has('local');

    let wsUrl = targetRoom.tunnelUrl || null;
    const isLocalUrl = Boolean(wsUrl && (wsUrl.includes('127.0.0.1') || wsUrl.includes('localhost')));

    if (isLocalUrl || !wsUrl) {
      if (!hasLocalParam) {
        if (wsUrl || targetRoom.status === 'live') {
          showToast('Local fallback disabled. Add ?local to URL parameter to connect.', true);
        }
        return;
      }
      wsUrl = wsUrl || 'ws://127.0.0.1:3001/ws';
    }

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      activeWs = ws;

      ws.onopen = () => {
        showToast('Connected to live stream!');
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'config') {
              const streamItem = {
                id: targetRoom.id,
                ownerName: targetRoom.owner || 'Streamer',
                config: msg.config,
                onPlayerReady: (playerEngine) => {
                  activeVideoPlayer = playerEngine;
                },
              };
              setStreams([streamItem]);
            } else if (msg.type === 'audio-config') {
              if (!activeAudioPlayer) {
                activeAudioPlayer = createAudio({
                  onError: (err) => console.warn('[Audio Error]', err),
                  volume: volume(),
                });
                activeAudioPlayer.start(msg.config);
              }
            }
          } catch {
            /* ignore json parse error */
          }
        } else if (event.data instanceof ArrayBuffer) {
          const view = new DataView(event.data);
          if (event.data.byteLength >= 2) {
            const tipo = view.getUint8(1);
            if (tipo === 1 || tipo === 0) {
              activeVideoPlayer?.feedPacket?.(event.data);
              activeVideoPlayer?.push?.(event.data);
            } else if (tipo === 3) {
              activeAudioPlayer?.push?.(event.data);
            }
          }
        }
      };

      ws.onerror = (err) => {
        console.warn('[Stream WebSocket error]', err);
      };

      ws.onclose = () => {
        if (activeWs === ws) {
          activeWs = null;
        }
      };
    } catch (err) {
      showToast(`Stream connection failed: ${err.message}`, true);
    }
  }

  createEffect(() => {
    if (activeAudioPlayer) {
      activeAudioPlayer.setVolume(volume());
    }
  });

  onMount(async () => {
    // Authenticate / fetch user details
    const currentUser = await getCurrentUser();
    if (currentUser) setUser(currentUser as any);

    // Listen for OAuth session changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const refreshedUser = await getCurrentUser();
        if (refreshedUser) setUser(refreshedUser as any);
      }
    });

    broadcaster = await createBroadcaster({
      onStatus: ({ active, type, error, reason }: any) => {
        if (type === 'screen') setIsSharing(active);
        if (type === 'camera') setIsCamera(active);
        if (error) showToast(error, true);
        if (reason) showToast(reason);
      },
    } as any);

    // Check URL parameters for ?token=XYZ123 fallback
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = params.token || urlParams.get('token') || urlParams.get('t') || urlParams.get('room');
    if (tokenParam) {
      handleJoinToken(tokenParam);
    }

    // Run background cleanup for empty rooms every 2 minutes
    cleanupInactiveRooms();
    cleanupInterval = setInterval(cleanupInactiveRooms, 120000);
  });

  createEffect(() => {
    if (params.token && (!activeRoom() || activeRoom().id !== params.token)) {
      handleJoinToken(params.token);
    }
  });

  onCleanup(() => {
    connectToStream(null);
    if (broadcaster) broadcaster.stop();
    if (activeRealtimeChannel) supabase.removeChannel(activeRealtimeChannel);
    if (cleanupInterval) clearInterval(cleanupInterval);
  });

  async function handleJoinToken(tokenInput) {
    if (!tokenInput) return;
    const cleanToken = tokenInput.trim();

    const room = await fetchRoomByToken(cleanToken);
    if (!room) {
      showToast(`Stream token "${cleanToken}" not found or inactive.`, true);
      if (params.token) navigate('/', { replace: true });
      return;
    }

    if (room.locked) {
      setPendingRoom(room);
      setJoinError('');
      setShowJoinModal(true);
    } else {
      enterRoom(room);
    }
  }

  async function handleCreateRoom({ name, password }) {
    const shortToken = generateShortToken(6);
    const streamName = name || `Stream ${shortToken}`;

    try {
      await createRoomRecord({
        token: shortToken,
        name: streamName,
        password: password || null,
        streamerName: user().name,
        streamerId: user().id,
      });

      setShowCreateModal(false);
      enterRoom({
        id: shortToken,
        token: shortToken,
        name: streamName,
        locked: Boolean(password),
      });

      showToast(`Stream created! Token: ${shortToken}`);
    } catch (err) {
      showToast(`Failed to create stream: ${err.message}`, true);
    }
  }

  function enterRoom(room) {
    setActiveRoom(room);
    setParticipantsCount(1);

    const roomToken = room.token || room.id;
    if (window.location.pathname !== `/room/${roomToken}`) {
      navigate(`/room/${roomToken}`, { replace: true });
    }

    connectToStream(room);

    // Subscribe to realtime changes for this room
    if (activeRealtimeChannel) supabase.removeChannel(activeRealtimeChannel);
    activeRealtimeChannel = supabase
      .channel(`public:rooms:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          handleLeaveRoom();
          showToast('Stream closed by host');
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const updatedRoom = {
            ...activeRoom(),
            tunnelUrl: payload.new.tunnel_url || null,
            status: payload.new.status || 'live',
          };
          setActiveRoom(updatedRoom);
          if (payload.new.tunnel_url && (!activeWs || activeWs.url !== payload.new.tunnel_url)) {
            connectToStream(updatedRoom);
          }
        }
      })
      .subscribe();
  }

  function handleLeaveRoom() {
    connectToStream(null);
    if (broadcaster) broadcaster.stop();
    setIsSharing(false);
    setIsCamera(false);
    setActiveRoom(null);
    setStreams([]);
    setParticipantsCount(0);

    navigate('/', { replace: true });
    showToast('Left stream');
  }

  async function handleDiscordLogin() {
    try {
      await loginWithDiscord();
    } catch (err) {
      showToast(`Discord login failed: ${err.message}`, true);
    }
  }

  async function handleDiscordLogout() {
    await logoutDiscord();
    setUser({ id: crypto.randomUUID(), name: 'Guest User', avatar: null, isDiscord: false });
    showToast('Signed out');
  }

  async function toggleScreenShare() {
    if (!activeRoom()) {
      showToast('Join or create a stream first to broadcast', true);
      return;
    }
    if (isSharing()) {
      broadcaster?.stop();
      setIsSharing(false);
    } else {
      const ok = await broadcaster?.startScreenShare();
      if (ok) {
        setIsSharing(true);
        setIsCamera(false);
      }
    }
  }

  async function toggleCamera() {
    if (!activeRoom()) {
      showToast('Join or create a stream first to broadcast', true);
      return;
    }
    if (isCamera()) {
      broadcaster?.stop();
      setIsCamera(false);
    } else {
      const ok = await broadcaster?.startCamera();
      if (ok) {
        setIsCamera(true);
        setIsSharing(false);
      }
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function toggleTileFullscreen(tileElement) {
    if (tileElement) {
      if (!document.fullscreenElement) {
        tileElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  }



  return (
    <div id="app-content" class="app-layout">
      <Topbar
        participantsCount={participantsCount}
        roomName={() => activeRoom()?.name}
        user={user}
        onOpenProfile={() => setShowProfileModal(true)}
        onDiscordLogin={handleDiscordLogin}
      />

      <Show
        when={activeRoom()}
        fallback={
          <TokenLanding
            user={user}
            onJoinToken={handleJoinToken}
            onOpenCreate={() => setShowCreateModal(true)}
            onDiscordLogin={handleDiscordLogin}
            onDiscordLogout={handleDiscordLogout}
          />
        }
      >
        <StreamStage
          streams={streams}
          onRequestKeyframe={() => {}}
          onToggleTileFullscreen={toggleTileFullscreen}
        />
      </Show>

      <Show when={activeRoom()}>
        <Bottombar
          activeRoom={activeRoom}
          isSharing={isSharing}
          isCamera={isCamera}
          volume={volume}
          onToggleShare={toggleScreenShare}
          onToggleCamera={toggleCamera}
          onOpenNativeModal={() => setShowNativeModal(true)}
          onVolumeChange={setVolume}
          onToggleFullscreen={toggleFullscreen}
          onOpenSettings={() => setShowSettingsModal(true)}
          onLeaveRoom={handleLeaveRoom}
        />
      </Show>

      <Toast message={toastMessage} isError={toastIsError} />

      {/* Modals */}
      <CreateRoomModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateRoom}
      />

      <JoinRoomModal
        isOpen={showJoinModal}
        error={joinError}
        onClose={() => setShowJoinModal(false)}
        onJoin={(pass) => {
          if (pendingRoom()?.password && pendingRoom().password !== pass) {
            setJoinError('Incorrect password');
            return;
          }
          enterRoom(pendingRoom());
          setShowJoinModal(false);
        }}
      />

      <RoomSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={() => {
          setShowSettingsModal(false);
          showToast('Stream settings updated');
        }}
      />

      <NativeStreamerModal
        isOpen={showNativeModal}
        token={() => activeRoom()?.token || activeRoom()?.id || 'token-sample'}
        onClose={() => setShowNativeModal(false)}
        onToast={(msg) => showToast(msg)}
      />

      <ProfileModal
        isOpen={showProfileModal}
        user={user}
        onClose={() => setShowProfileModal(false)}
        onLogout={async () => {
          await handleDiscordLogout();
          setShowProfileModal(false);
        }}
      />
    </div>
  );
}
