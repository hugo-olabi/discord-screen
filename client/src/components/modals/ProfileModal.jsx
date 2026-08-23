import { createSignal, Show, onMount } from 'solid-js';

export default function ProfileModal(props) {
  const [name, setName] = createSignal('');

  onMount(() => {
    if (props.user()?.name) {
      setName(props.user().name);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    props.onSave?.(name().trim());
  };

  return (
    <Show when={props.isOpen()}>
      <div class="modal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
          <h2 id="profileTitle">User Profile</h2>

          <div class="profile-head">
            <div class="profile-avatar">
              <Show when={props.user()?.avatar} fallback={<div class="avatar-fallback lg">{props.user()?.name?.[0] || 'U'}</div>}>
                <img src={props.user()?.avatar} alt="Avatar" />
              </Show>
            </div>
            <div class="profile-meta">
              <strong>{props.user()?.name || 'Guest User'}</strong>
              <span class="muted">ID: {props.user()?.id || 'Local'}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <label class="field-col">
              <span>Display Name</span>
              <input
                type="text"
                maxlength="32"
                value={name()}
                onInput={(e) => setName(e.target.value)}
                placeholder="Your display name"
                autocomplete="off"
                required
              />
            </label>

            <div class="modal-actions">
              <button type="button" class="btn" onClick={() => props.onClose?.()}>
                Cancel
              </button>
              <button type="submit" class="btn go">
                Save Profile
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}
