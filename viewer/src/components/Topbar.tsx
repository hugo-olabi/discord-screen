import { Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { isDiscordActivity } from '../services/auth.js';

export default function Topbar(props: any) {
  const location = useLocation();

  const isActivity = () => isDiscordActivity() || Boolean(props.user?.()?.isActivity);
  const isLoggedIn = () => Boolean(props.user?.()?.isDiscord);

  return (
    <header class="topbar">
      <div class="topbar-left">
        <A href="/" class="brand-badge" title="StreamRoom Home">
          <span class="brand-dot"></span>
          <span class="brand-name">StreamRoom</span>
        </A>

        <Show when={props.participantsCount?.() > 0}>
          <div class="pill" title="Participants in room">
            <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <span>{props.participantsCount()}</span>
          </div>
        </Show>

        <Show when={props.roomName?.()}>
          <div class="pill room-pill">
            <span class="room-pill-dot"></span>
            <span>{props.roomName()}</span>
          </div>
        </Show>
      </div>

      <div class="topbar-right">
        <nav class="nav-links">
          <Show when={location.pathname !== '/discord' && !isActivity()}>
            <A
              href="/discord"
              class="topbar-link discord-install-link"
              title="Add StreamRoom to Discord"
            >
              <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor" style={{ color: '#5865f2' }}>
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
              </svg>
              <span>Add Discord App</span>
            </A>
          </Show>

          <Show when={location.pathname !== '/privacy-policy'}>
            <A href="/privacy-policy" class="topbar-link">
              Privacy Policy
            </A>
          </Show>

          <Show when={location.pathname !== '/terms-of-service'}>
            <A href="/terms-of-service" class="topbar-link">
              Terms of Service
            </A>
          </Show>
        </nav>

        <Show
          when={isLoggedIn()}
          fallback={
            <button
              class="btn discord-login-btn topbar-login-btn"
              onClick={() => props.onDiscordLogin?.()}
              title="Log in with Discord"
            >
              <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
              </svg>
              <span>Log In</span>
            </button>
          }
        >
          <button class="user-chip" onClick={() => props.onOpenProfile?.()} title="User Profile">
            <div class="avatar-sm">
              <Show when={props.user()?.avatar} fallback={<div class="avatar-fallback">{props.user()?.name?.[0] || 'U'}</div>}>
                <img src={props.user()?.avatar} alt="Avatar" />
              </Show>
            </div>
            <span class="user-chip-name">{props.user()?.name}</span>
          </button>
        </Show>
      </div>
    </header>
  );
}
