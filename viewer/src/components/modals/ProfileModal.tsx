import { Show } from 'solid-js';

export default function ProfileModal(props: any) {
  return (
    <Show when={props.isOpen()}>
      <div class="modal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
          <h2 id="profileTitle">User Profile</h2>

          <div class="profile-head" style={{ 'margin-bottom': '20px' }}>
            <div class="profile-avatar">
              <Show
                when={props.user()?.avatar}
                fallback={<div class="avatar-fallback lg">{props.user()?.name?.[0] || 'U'}</div>}
              >
                <img src={props.user()?.avatar} alt="Avatar" />
              </Show>
            </div>
            <div class="profile-meta">
              <strong style={{ 'font-size': '16px' }}>{props.user()?.name || 'Guest User'}</strong>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-top': '4px' }}>
                <Show
                  when={props.user()?.isDiscord}
                  fallback={<span class="badge">Guest User</span>}
                >
                  <span class="badge discord-badge" style={{ background: 'rgba(88, 101, 242, 0.2)', color: '#5865f2' }}>
                    Discord Account
                  </span>
                </Show>
              </div>
            </div>
          </div>

          <div class="modal-actions" style={{ 'flex-direction': 'column', gap: '10px' }}>
            <button
              type="button"
              class="btn danger full-btn"
              onClick={() => props.onLogout?.()}
              style={{ 'justify-content': 'center', padding: '10px' }}
            >
              Log Out
            </button>

            <button
              type="button"
              class="btn full-btn"
              onClick={() => props.onClose?.()}
              style={{ 'justify-content': 'center', padding: '10px' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
