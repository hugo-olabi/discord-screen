import { createSignal, Show } from 'solid-js';

export default function RoomSettingsModal(props) {
  const [password, setPassword] = createSignal('');

  const handleSubmit = (e) => {
    e.preventDefault();
    props.onSave?.(password().trim());
    setPassword('');
  };

  return (
    <Show when={props.isOpen()}>
      <div class="modal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="roomSettingsTitle">
          <h2 id="roomSettingsTitle">Room Settings</h2>
          <p class="modal-sub">Update room access and password controls.</p>

          <form onSubmit={handleSubmit}>
            <label class="field-col">
              <span>Password <em class="opt">(leave blank to remove)</em></span>
              <input
                type="password"
                maxlength="64"
                value={password()}
                onInput={(e) => setPassword(e.target.value)}
                placeholder="New password or empty"
                autocomplete="new-password"
              />
            </label>

            <div class="modal-actions">
              <button type="button" class="btn" onClick={() => props.onClose?.()}>
                Cancel
              </button>
              <button type="submit" class="btn go">
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}
