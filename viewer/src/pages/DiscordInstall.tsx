import { onMount } from 'solid-js';
import { A } from '@solidjs/router';
import Topbar from '../components/Topbar';

const DISCORD_CLIENT_ID = '1540065649181724722';
const DISCORD_INSTALL_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=applications.commands+identify+email`;

export default function DiscordInstall() {
  onMount(() => {
    // Automatically redirect to Discord Install URL after 1.5 seconds if user stays on page
    const timer = setTimeout(() => {
      window.location.href = DISCORD_INSTALL_URL;
    }, 1500);
    return () => clearTimeout(timer);
  });

  return (
    <div class="legal-page">
      <Topbar
        participantsCount={() => 0}
        roomName={() => ''}
        user={() => null}
        onOpenProfile={() => {}}
      />

      <main class="legal-container" style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'min-height': 'calc(100vh - 120px)' }}>
        <article class="legal-card" style={{ 'max-width': '500px', 'width': '100%', 'text-align': 'center', 'padding': '36px 32px' }}>
          <A href="/" class="back-link" style={{ 'justify-content': 'center', 'margin-bottom': '20px' }}>
            <svg viewBox="0 0 24 24" class="icon-sm" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to StreamRoom
          </A>

          <div style={{ display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', width: '56px', height: '56px', 'border-radius': '50%', background: 'rgba(88, 101, 242, 0.15)', border: '1px solid rgba(88, 101, 242, 0.3)', 'margin-bottom': '16px' }}>
            <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px', color: '#5865f2' }} fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
            </svg>
          </div>

          <h1 class="legal-title" style={{ 'font-size': '24px', 'margin-bottom': '8px' }}>Add StreamRoom to Discord</h1>
          <p class="legal-updated" style={{ 'margin-bottom': '20px' }}>
            Enable zero-latency 60 FPS screen and audio sharing directly inside your Discord voice channels.
          </p>

          <div style={{ 'text-align': 'left', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', 'border-radius': '12px', padding: '16px 20px', 'margin-bottom': '24px', 'font-size': '13.5px', color: '#dbdee1' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'margin-bottom': '10px' }}>
              <span>⚡</span> <span><strong>Voice Channel Activity:</strong> Stream 60 FPS screen & audio directly in voice calls.</span>
            </div>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'margin-bottom': '10px' }}>
              <span>🔒</span> <span><strong>Privacy Focused:</strong> Zero recording, zero persistent media storage.</span>
            </div>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
              <span>🚀</span> <span><strong>Zero Setup:</strong> Launch instantly on Web, Desktop, or Mobile.</span>
            </div>
          </div>

          <a
            href={DISCORD_INSTALL_URL}
            class="btn discord-login-btn full-btn"
            style={{ 'justify-content': 'center', 'padding': '14px', 'font-size': '14.5px', 'font-weight': '700', 'border-radius': '10px' }}
          >
            <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
            </svg>
            Authorize & Add to Discord
          </a>
        </article>
      </main>
    </div>
  );
}
