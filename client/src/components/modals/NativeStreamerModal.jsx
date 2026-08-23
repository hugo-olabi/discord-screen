import { Show } from 'solid-js';

export default function NativeStreamerModal(props) {
  const copyToken = () => {
    if (props.token()) {
      navigator.clipboard.writeText(props.token());
      props.onToast?.('Token copied to clipboard!');
    }
  };

  return (
    <Show when={props.isOpen()}>
      <div class="modal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="nativeTitle">
          <h2 id="nativeTitle">Broadcast with Native Streamer</h2>
          <p class="modal-sub">
            For high-resolution 60 FPS streaming with GPU acceleration, use the standalone Native Streamer application.
          </p>

          <label class="field-col">
            <span>Your Stream Token / Room ID</span>
            <div class="input-copy-row">
              <input
                type="text"
                readOnly
                value={props.token() || 'Generating...'}
                class="mono-input"
              />
              <button type="button" class="btn go" onClick={copyToken}>
                Copy Token
              </button>
            </div>
          </label>

          <div class="instructions-box">
            <p><strong>How to use:</strong></p>
            <ol>
              <li>Open the <code>native-streamer</code> application (or run <code>npm run stream</code> in terminal).</li>
              <li>Paste the token copied above into the Stream Token input.</li>
              <li>Click <strong>Start Stream</strong> — your zero-latency hardware broadcast will connect instantly!</li>
            </ol>
          </div>

          <div class="status-banner">
            Waiting for Native Streamer connection...
          </div>

          <div class="modal-actions" style="margin-top: 16px;">
            <button type="button" class="btn" onClick={() => props.onClose?.()}>
              Close
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
