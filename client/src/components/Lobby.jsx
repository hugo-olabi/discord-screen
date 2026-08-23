import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';

export default function Lobby(props) {
  return (
    <div class="lobby">
      <header class="lobby-head">
        <div>
          <h1>Active Rooms</h1>
          <p class="muted">Select a room to watch or broadcast</p>
        </div>
        <div class="lobby-actions">
          <button class="btn go" onClick={() => props.onOpenCreate?.()}>
            <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Create Room
          </button>
        </div>
      </header>

      <div class="room-list">
        <Show when={props.rooms().length > 0} fallback={
          <div class="lobby-empty">
            <div class="empty-icon">📺</div>
            <h3>No Active Rooms</h3>
            <p class="muted">Create a new room to start sharing screen and audio with your room members.</p>
            <button class="btn go" onClick={() => props.onOpenCreate?.()} style="margin-top: 16px;">
              Create Room Now
            </button>
          </div>
        }>
          <For each={props.rooms()}>
            {(room) => (
              <div class="room-card" onClick={() => props.onJoinRoom?.(room)}>
                <div class="room-card-body">
                  <div class="room-card-head">
                    <h3 class="room-card-title">{room.name || 'Untitled Room'}</h3>
                    <Show when={room.locked}>
                      <span class="badge lock" title="Password Protected">
                        🔒 Protected
                      </span>
                    </Show>
                  </div>
                  <p class="room-card-owner muted">Host: {room.owner || 'Anonymous'}</p>
                </div>
                <div class="room-card-footer">
                  <span class="badge live">● Active</span>
                  <button class="btn sm go">Join Room</button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

      <footer class="lobby-footer">
        <A href="/privacy-policy" class="footer-link">Privacy Policy</A>
        <span class="dot-sep">•</span>
        <A href="/terms-of-service" class="footer-link">Terms of Service</A>
      </footer>
    </div>
  );
}
