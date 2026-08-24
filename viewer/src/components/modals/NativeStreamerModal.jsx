import { Show } from 'solid-js';

export default function NativeStreamerModal(props) {
  const copyToken = () => {
    if (props.token()) {
      navigator.clipboard.writeText(props.token());
      props.onToast?.('Token copied to clipboard!');
    }
  };

  const copyShareLink = () => {
    if (props.token()) {
      const shareUrl = `${window.location.origin}/room/${props.token()}`;
      navigator.clipboard.writeText(shareUrl);
      props.onToast?.('Share link copied to clipboard!');
    }
  };

  return (
    <Show when={props.isOpen()}>
      <div class="modal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="nativeTitle">
          <h2 id="nativeTitle">Broadcast & Share Stream</h2>
          <p class="modal-sub">
            Share this stream link with viewers or use the Native Streamer application for 60 FPS hardware capture.
          </p>

          <label class="field-col">
            <span>Stream Token / Room ID</span>
            <div class="input-copy-row">
              <input
                type="text"
                readOnly
                value={props.token() || 'Generating...'}
                class="mono-input"
              />
              <button type="button" class="btn" onClick={copyToken}>
                Copy Token
              </button>
              <button type="button" class="btn go" onClick={copyShareLink}>
                Copy Link
              </button>
            </div>
          </label>

          <div class="instructions-box">
            <p><strong>Share Link format:</strong></p>
            <code>{window.location.origin}/room/{props.token() || '<token>'}</code>
            <p style="margin-top: 10px;"><strong>Native Streamer instructions:</strong></p>
            <ol>
              <li>Run <code>npm run stream</code> in your terminal.</li>
              <li>Paste the token copied above into the Stream Token input.</li>
              <li>Click <strong>Start Stream</strong> to broadcast directly!</li>
            </ol>
          </div>

          <div class="status-banner">
            Waiting for stream connection...
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
