import { createSignal } from 'solid-js';

export default function TokenLanding(props) {
  const [tokenInput, setTokenInput] = createSignal('');

  const parseToken = (input) => {
    if (!input) return '';
    const trimmed = input.trim();
    if (trimmed.includes('/room/')) {
      const parts = trimmed.split('/room/');
      const endPart = parts[parts.length - 1];
      return endPart.split('?')[0].split('#')[0].trim();
    }
    if (trimmed.includes('token=')) {
      try {
        const urlParams = new URLSearchParams(trimmed.split('?')[1]);
        return urlParams.get('token') || trimmed;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  };

  const handleJoin = (e) => {
    e.preventDefault();
    const cleanToken = parseToken(tokenInput());
    if (cleanToken) {
      props.onJoinToken?.(cleanToken);
    }
  };

  return (
    <div class="token-landing">
      <div class="token-card">
        <header class="token-card-header">
          <div class="brand-badge-lg">
            <span class="brand-dot-lg"></span>
            <h1 class="brand-title">StreamRoom</h1>
          </div>
          <p class="token-card-sub">
            Ultra-low latency screen & audio sharing. Enter a token to join or create a stream.
          </p>
        </header>

        <form onSubmit={handleJoin} class="token-form">
          <div class="token-input-row">
            <input
              type="text"
              value={tokenInput()}
              onInput={(e) => setTokenInput(e.target.value)}
              placeholder="Enter Stream Token or URL..."
              class="token-input"
              autocomplete="off"
              required
            />
            <button type="submit" class="btn go lg-btn">
              Join Stream
            </button>
          </div>
        </form>

        <div class="token-card-divider">
          <span>OR</span>
        </div>

        <div class="token-create-sec">
          <button class="btn outline-btn full-btn" onClick={() => props.onOpenCreate?.()}>
            <svg viewBox="0 0 24 24" class="icon-sm" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Create New Stream
          </button>
        </div>
      </div>
    </div>
  );
}
