import { createSignal, Show } from 'solid-js';

export default function JoinRoomModal(props) {
  const [password, setPassword] = createSignal('');

  const handleSubmit = (e) => {
    e.preventDefault();
    props.onJoin?.(password().trim());
    setPassword('');
  };

  return (
    <Show when={props.isOpen()}>
      <div class="modal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="joinTitle">
          <h2 id="joinTitle">Protected Room</h2>
          <p class="modal-sub">Enter password to access this room.</p>

          <form onSubmit={handleSubmit}>
            <label class="field-col">
              <span>Password</span>
              <input
                type="password"
                maxlength="64"
                value={password()}
                onInput={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autocomplete="off"
                required
              />
            </label>

            <Show when={props.error()}>
              <p class="modal-error">{props.error()}</p>
            </Show>

            <div class="modal-actions">
              <button type="button" class="btn" onClick={() => props.onClose?.()}>
                Cancel
              </button>
              <button type="submit" class="btn go">
                Join Room
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}
