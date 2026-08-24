import { createSignal, Show } from 'solid-js';

export default function Bottombar(props) {
  const [showVolume, setShowVolume] = createSignal(false);
  const [lastVol, setLastVol] = createSignal(1.0);

  function handleVolumeButtonClick() {
    setShowVolume(!showVolume());
    if (props.volume() > 0) {
      setLastVol(props.volume());
      props.onVolumeChange?.(0);
    } else {
      props.onVolumeChange?.(lastVol() || 1.0);
    }
  }

  return (
    <div class="bottombar">
      <div class="dock">
        <div class="group">
          <button
            class={`btn ${props.isSharing() ? 'active' : ''}`}
            onClick={() => props.onToggleShare?.()}
            data-tip="Share Screen"
            aria-label="Share Screen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 5h18v11H3z" />
              <path d="M8 20h8" />
            </svg>
          </button>
          <button
            class={`btn ${props.isCamera() ? 'active' : ''}`}
            onClick={() => props.onToggleCamera?.()}
            data-tip="Toggle Camera"
            aria-label="Toggle Camera"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          </button>
          <button
            class="btn"
            onClick={() => props.onOpenNativeModal?.()}
            data-tip="Native Streamer Token"
            aria-label="Native Streamer Token"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </button>
        </div>

        <div class="group">
          <div class="volume">
            <button
              class="btn"
              onClick={handleVolumeButtonClick}
              data-tip="Volume Control"
              aria-label="Volume Control"
            >
              <Show
                when={props.volume() > 0}
                fallback={
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11 5 6 9H2v6h4l5 4V5z" />
                    <path d="M22 9l-6 6M16 9l6 6" />
                  </svg>
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
                </svg>
              </Show>
            </button>

            <div class={`volume-pop ${showVolume() ? 'open' : ''}`}>
              <span class="volume-val">{Math.round(props.volume() * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={props.volume()}
                onInput={(e) => props.onVolumeChange?.(parseFloat(e.currentTarget.value))}
                aria-label="Volume Slider"
              />
            </div>
          </div>

          <button
            class="btn"
            onClick={() => props.onToggleFullscreen?.()}
            data-tip="Full Screen"
            aria-label="Full Screen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>

        <Show when={props.activeRoom()}>
          <div class="group">
            <button
              class="btn"
              onClick={() => props.onOpenSettings?.()}
              data-tip="Room Settings"
              aria-label="Room Settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </button>
            <button
              class="btn leave"
              onClick={() => props.onLeaveRoom?.()}
              data-tip="Leave Room"
              aria-label="Leave Room"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
