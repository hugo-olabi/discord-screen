import { onMount, onCleanup, createSignal, Show } from 'solid-js';
import { createPlayer } from '../services/player.js';

export default function StreamTile(props) {
  let canvasRef;
  let player = null;
  const [stats, setStats] = createSignal({ fps: 0, lag: 0, res: '1080p' });

  onMount(() => {
    if (canvasRef && props.stream) {
      player = createPlayer(canvasRef, {
        onError: (err) => {
          console.warn('[StreamTile player error]', err);
        },
        onSizeChange: ({ width, height }) => {
          setStats((s) => ({ ...s, res: `${width}x${height}` }));
        },
        onRequestKeyframe: () => {
          props.onRequestKeyframe?.(props.stream.id);
        },
      });

      if (props.stream.config) {
        player.start(props.stream.config);
      }
      props.stream.onPlayerReady?.(player);
    }
  });

  onCleanup(() => {
    if (player) {
      player.stop();
      player = null;
    }
  });

  return (
    <div class={`tile ${props.stream?.isSelf ? 'sharing' : ''}`}>
      <canvas ref={canvasRef} class="tile-canvas" />

      <div class="tile-overlay">
        <div class="tile-user">
          <span class="user-name">{props.stream?.ownerName || 'Streamer'}</span>
          <Show when={props.stream?.isSelf}>
            <span class="badge self-badge">You</span>
          </Show>
        </div>

        <div class="tile-actions">
          <button
            class="tile-btn"
            onClick={() => props.onToggleTileFullscreen?.(canvasRef)}
            title="Full Screen"
          >
            <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
