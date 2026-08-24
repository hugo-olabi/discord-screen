import { Show } from 'solid-js';
import { A } from '@solidjs/router';

export default function Topbar(props) {
  return (
    <header class="topbar">
      <div class="topbar-left">
        <A href="/" class="brand-badge" title="StreamRoom Home">
          <span class="brand-dot"></span>
          <span class="brand-name">StreamRoom</span>
        </A>

        <Show when={props.participantsCount() > 0}>
          <div class="pill" title="Participants in room">
            <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <span>{props.participantsCount()}</span>
          </div>
        </Show>

        <Show when={props.roomName()}>
          <div class="pill room-pill">
            <span class="room-pill-dot"></span>
            <span>{props.roomName()}</span>
          </div>
        </Show>
      </div>

      <div class="topbar-right">
        <nav class="nav-links">
          <A href="/privacy-policy" class="topbar-link">
            Privacy Policy
          </A>
          <A href="/terms-of-service" class="topbar-link">
            Terms of Service
          </A>
        </nav>

        <Show when={props.user()}>
          <button class="user-chip" onClick={() => props.onOpenProfile?.()} title="Edit Profile">
            <div class="avatar-sm">
              <Show when={props.user()?.avatar} fallback={<div class="avatar-fallback">{props.user()?.name?.[0] || 'U'}</div>}>
                <img src={props.user()?.avatar} alt="Avatar" />
              </Show>
            </div>
            <span class="user-chip-name">{props.user()?.name || 'Guest'}</span>
          </button>
        </Show>
      </div>
    </header>
  );
}
