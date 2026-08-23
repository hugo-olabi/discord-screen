import { For, Show } from 'solid-js';
import StreamTile from './StreamTile.jsx';

export default function StreamStage(props) {
  return (
    <main class="grid">
      <Show
        when={props.streams().length > 0}
        fallback={
          <div class="empty">
            <div class="icon">🖥️</div>
            <h1>Ready to Broadcast</h1>
            <p class="muted">
              Click <strong>Share Screen</strong> below or use the <strong>Native Streamer</strong> for 60 FPS zero-latency streaming.
            </p>
          </div>
        }
      >
        <For each={props.streams()}>
          {(stream) => (
            <StreamTile
              stream={stream}
              onRequestKeyframe={props.onRequestKeyframe}
              onToggleTileFullscreen={props.onToggleTileFullscreen}
            />
          )}
        </For>
      </Show>
    </main>
  );
}
