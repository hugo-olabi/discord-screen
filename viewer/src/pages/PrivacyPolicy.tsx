import { createSignal, onMount } from 'solid-js';
import { A } from '@solidjs/router';
import Topbar from '../components/Topbar';
import { getCurrentUser, loginWithDiscord } from '../services/auth';

export default function PrivacyPolicy() {
  const [user, setUser] = createSignal<any>(null);

  onMount(async () => {
    const currentUser = await getCurrentUser();
    if (currentUser) setUser(currentUser);
  });

  return (
    <div class="legal-page">
      <Topbar
        participantsCount={() => 0}
        roomName={() => ''}
        user={user}
        onOpenProfile={() => {}}
        onDiscordLogin={loginWithDiscord}
      />

      <main class="legal-container">
        <article class="legal-card">
          <A href="/" class="back-link">
            <svg viewBox="0 0 24 24" class="icon-sm" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to StreamRoom
          </A>
          <h1 class="legal-title">Privacy Policy</h1>
          <p class="legal-updated">Last Updated: August 23, 2026</p>

          <section class="legal-section">
            <h2>1. Overview & Commitment to Privacy</h2>
            <p>
              StreamRoom ("we", "our", or "us") is dedicated to protecting your privacy while providing ultra-low
              latency screen and audio sharing capabilities. This Privacy Policy explains how information is handled
              when you use our web application, Discord Activity integration, or Native Streamer tools.
            </p>
          </section>

          <section class="legal-section">
            <h2>2. Zero Video & Audio Recording</h2>
            <p>
              <strong>We do not record, store, or monitor any video or audio streams passing through StreamRoom.</strong>
              All media packets transmitted via WebCodecs, WebRTC, or WebSocket are encoded and delivered in real-time
              directly between participants or relayed ephemerally without persistent server disk storage.
            </p>
          </section>

          <section class="legal-section">
            <h2>3. Information We Collect</h2>
            <p>StreamRoom processes only minimal data required to establish real-time streaming sessions:</p>
            <ul>
              <li>
                <strong>Ephemeral Session Data:</strong> Temporary room IDs, randomly generated stream tokens, and
                anonymous participant identifiers needed for WebRTC/WebSocket signaling.
              </li>
              <li>
                <strong>Local Browser Storage:</strong> We use local storage (<code>localStorage</code> and{' '}
                <code>sessionStorage</code>) exclusively to store your preferred display name, local volume preferences,
                and session credentials on your own device.
              </li>
              <li>
                <strong>Discord Integration (Optional):</strong> When opened within Discord, basic user information
                (such as user ID, display name, and avatar URL) provided by the Discord Embedded App SDK is used solely
                to display your identity to other members in the same voice channel room.
              </li>
            </ul>
          </section>

          <section class="legal-section">
            <h2>4. Real-Time Signaling & Third-Party Services</h2>
            <p>
              StreamRoom utilizes Supabase Realtime DB for ephemeral signaling messages (session initiation, SDP offers/answers,
              and candidate exchange). Signaling payload data is destroyed automatically when room sessions conclude.
            </p>
          </section>

          <section class="legal-section">
            <h2>5. Data Security</h2>
            <p>
              All traffic between your browser and StreamRoom infrastructure is encrypted using standard Transport Layer
              Security (TLS/HTTPS and WSS). Native Streamer connections use secure Cloudflare Tunnels with modern end-to-end
              transport encryption.
            </p>
          </section>

          <section class="legal-section">
            <h2>6. Children's Privacy</h2>
            <p>
              StreamRoom is intended for general audiences and does not knowingly collect personal information from children
              under the age of 13.
            </p>
          </section>

          <section class="legal-section">
            <h2>7. Contact Us</h2>
            <p>
              If you have any questions or concerns regarding this Privacy Policy, please reach out via our open-source
              repository issue tracker or project support channels.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
