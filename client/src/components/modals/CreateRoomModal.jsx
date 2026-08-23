import { createSignal, Show } from 'solid-js';

export default function CreateRoomModal(props) {
  const [name, setName] = createSignal('');
  const [password, setPassword] = createSignal('');

  const handleSubmit = (e) => {
    e.preventDefault();
    props.onCreate?.({ name: name().trim(), password: password().trim() });
    setName('');
    setPassword('');
  };

  return (
    <Show when={props.isOpen()}>
      <div class="modal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="createTitle">
          <h2 id="createTitle">Create Room</h2>
          <p class="modal-sub">Rooms automatically close when empty for several minutes.</p>

          <form onSubmit={handleSubmit}>
            <label class="field-col">
              <span>Room Name <em class="opt">(optional)</em></span>
              <input
                type="text"
                maxlength="40"
                value={name()}
                onInput={(e) => setName(e.target.value)}
                placeholder="e.g. Cinema Room"
                autocomplete="off"
              />
            </label>

            <label class="field-col field-gap">
              <span>Password <em class="opt">(optional)</em></span>
              <input
                type="password"
                maxlength="64"
                value={password()}
                onInput={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for public room"
                autocomplete="new-password"
              />
            </label>

            <div class="modal-actions">
              <button type="button" class="btn" onClick={() => props.onClose?.()}>
                Cancel
              </button>
              <button type="submit" class="btn go">
                Create Room
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}
