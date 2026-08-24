import { A } from '@solidjs/router';
import Topbar from '../components/Topbar';

export default function TermsOfService() {
  return (
    <div class="legal-page">
      <Topbar
        participantsCount={() => 0}
        roomName={() => ''}
        user={() => null}
        onOpenProfile={() => {}}
      />

      <main class="legal-container">
        <article class="legal-card">
          <A href="/" class="back-link">
            <svg viewBox="0 0 24 24" class="icon-sm" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to StreamRoom
          </A>
          <h1 class="legal-title">Terms of Service</h1>
          <p class="legal-updated">Last Updated: August 23, 2026</p>

          <section class="legal-section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using StreamRoom (the "Service"), including our web application, Discord Activity, or
              Native Streamer software, you agree to be bound by these Terms of Service. If you do not agree to these
              terms, please do not use the Service.
            </p>
          </section>

          <section class="legal-section">
            <h2>2. Permissible Use & Streaming Guidelines</h2>
            <p>You agree to use StreamRoom responsibly and legally. You shall NOT stream or broadcast:</p>
            <ul>
              <li>Content that violates copyright laws, trademarks, or intellectual property rights of third parties.</li>
              <li>Illegal, harassing, abusive, defamatory, obscene, or harmful material.</li>
              <li>Content containing malware, viruses, or intentional security vulnerabilities.</li>
            </ul>
            <p>
              StreamRoom acts strictly as a real-time transport mechanism. Users are solely responsible for the content
              they capture and transmit using the Service.
            </p>
          </section>

          <section class="legal-section">
            <h2>3. Intellectual Property Rights</h2>
            <p>
              All software, interface designs, branding, trademarks, and code comprising StreamRoom are owned by or
              licensed to the project maintainers. Using StreamRoom does not grant you ownership of any intellectual
              property in our Service or content.
            </p>
          </section>

          <section class="legal-section">
            <h2>4. Service Availability & Performance</h2>
            <p>
              StreamRoom is provided on an "AS IS" and "AS AVAILABLE" basis. While we strive for zero-latency real-time
              performance, we do not guarantee uninterrupted access, error-free operation, or specific bandwidth availability.
              Streaming quality depends on local network conditions, system hardware, and browser WebCodecs capabilities.
            </p>
          </section>

          <section class="legal-section">
            <h2>5. Disclaimer of Warranties & Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, STREAMROOM AND ITS MAINTAINERS SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, CONSEQUENTIAL, OR SPECIAL DAMAGES ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section class="legal-section">
            <h2>6. Modifications to Terms</h2>
            <p>
              We reserve the right to modify these Terms of Service at any time. Continued use of StreamRoom following
              updates constitutes your acceptance of the revised terms.
            </p>
          </section>

          <footer class="legal-footer">
            <A href="/privacy-policy" class="legal-nav-link">Privacy Policy</A>
            <span class="dot-sep">•</span>
            <A href="/" class="legal-nav-link">StreamRoom Home</A>
          </footer>
        </article>
      </main>
    </div>
  );
}
