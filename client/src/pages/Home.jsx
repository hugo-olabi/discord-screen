import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import Topbar from '../components/Topbar.jsx';
import Lobby from '../components/Lobby.jsx';
import StreamStage from '../components/StreamStage.jsx';
import Bottombar from '../components/Bottombar.jsx';
import Toast from '../components/Toast.jsx';

import CreateRoomModal from '../components/modals/CreateRoomModal.jsx';
import JoinRoomModal from '../components/modals/JoinRoomModal.jsx';
import RoomSettingsModal from '../components/modals/RoomSettingsModal.jsx';
import NativeStreamerModal from '../components/modals/NativeStreamerModal.jsx';
import ProfileModal from '../components/modals/ProfileModal.jsx';

import { supabase } from '../services/supabase.js';
import { createBroadcaster } from '../services/broadcaster.js';

export default function Home() {
  const [user, setUser] = createSignal({ id: crypto.randomUUID(), name: 'Guest' });
  const [rooms, setRooms] = createSignal([]);
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

  const [selectedRoom, setSelectedRoom] = createSignal(null);
  const [joinError, setJoinError] = createSignal('');

  let broadcaster = null;
  let activeRealtimeChannel = null;

  function showToast(msg, isErr = false) {
    setToastMessage(msg);
    setToastIsError(isErr);
    setTimeout(() => {
      setToastMessage('');
    }, 4000);
  }

  onMount(async () => {
    // Load local profile preference
    const savedName = localStorage.getItem('streamroom_user_name');
    if (savedName) {
      setUser((u) => ({ ...u, name: savedName }));
    }

    // Initialize broadcaster engine
    broadcaster = await createBroadcaster({
      onStateChange: ({ active, type, error, reason }) => {
        if (type === 'screen') setIsSharing(active);
        if (type === 'camera') setIsCamera(active);
        if (error) showToast(error, true);
        if (reason) showToast(reason);
      },
    });

    // Load initial room list from Supabase
    fetchRooms();

    // Subscribe to rooms changes in Supabase Realtime
    activeRealtimeChannel = supabase
      .channel('public:rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchRooms();
      })
      .subscribe();
  });

  onCleanup(() => {
    if (broadcaster) broadcaster.stop();
    if (activeRealtimeChannel) supabase.removeChannel(activeRealtimeChannel);
  });

  async function fetchRooms() {
    try {
      const { data, error } = await supabase.from('rooms').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        setRooms(
          data.map((r) => ({
            id: r.id,
            name: r.name || 'StreamRoom',
            owner: r.streamer_id ? 'Host' : 'Public Host',
            locked: Boolean(r.password),
          }))
        );
      }
    } catch {
      /* ignore fetching errors */
    }
  }

  async function handleCreateRoom({ name, password }) {
    const roomId = crypto.randomUUID();
    const roomName = name || 'StreamRoom';

    try {
      const { error } = await supabase.from('rooms').insert({
        id: roomId,
        name: roomName,
        password: password || null,
        status: 'live',
        updated_at: new Date().toISOString(),
      });

      if (error) {
        showToast('Failed to create room in database', true);
        return;
      }

      setShowCreateModal(false);
      enterRoom({ id: roomId, name: roomName, locked: Boolean(password) });
      showToast(`Room "${roomName}" created!`);
    } catch (err) {
      showToast(`Failed to create room: ${err.message}`, true);
    }
  }

  function handleJoinRoom(room) {
    if (room.locked) {
      setSelectedRoom(room);
      setJoinError('');
      setShowJoinModal(true);
    } else {
      enterRoom(room);
    }
  }

  function enterRoom(room) {
    setActiveRoom(room);
    setParticipantsCount(1);
    fetchRooms();
  }

  function handleLeaveRoom() {
    if (broadcaster) broadcaster.stop();
    setIsSharing(false);
    setIsCamera(false);
    setActiveRoom(null);
    setStreams([]);
    setParticipantsCount(0);
    showToast('Left room');
  }

  async function toggleScreenShare() {
    if (!activeRoom()) {
      showToast('Please join or create a room first to broadcast', true);
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
      showToast('Please join or create a room first to broadcast', true);
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

  function saveProfile(newName) {
    if (newName) {
      setUser((u) => ({ ...u, name: newName }));
      localStorage.setItem('streamroom_user_name', newName);
      setShowProfileModal(false);
      showToast('Profile updated');
    }
  }

  return (
    <div id="app-content" class="app-layout">
      <Topbar
        participantsCount={participantsCount}
        roomName={() => activeRoom()?.name}
        user={user}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <Show
        when={activeRoom()}
        fallback={
          <Lobby
            rooms={rooms}
            onOpenCreate={() => setShowCreateModal(true)}
            onJoinRoom={handleJoinRoom}
          />
        }
      >
        <StreamStage
          streams={streams}
          onRequestKeyframe={() => {}}
          onToggleTileFullscreen={toggleTileFullscreen}
        />
      </Show>

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
          enterRoom(selectedRoom());
          setShowJoinModal(false);
        }}
      />

      <RoomSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={() => {
          setShowSettingsModal(false);
          showToast('Room settings updated');
        }}
      />

      <NativeStreamerModal
        isOpen={showNativeModal}
        token={() => activeRoom()?.id || 'room-token-sample'}
        onClose={() => setShowNativeModal(false)}
        onToast={(msg) => showToast(msg)}
      />

      <ProfileModal
        isOpen={showProfileModal}
        user={user}
        onClose={() => setShowProfileModal(false)}
        onSave={saveProfile}
      />
    </div>
  );
}
