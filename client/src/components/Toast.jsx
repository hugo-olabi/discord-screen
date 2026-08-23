import { Show } from 'solid-js';

export default function Toast(props) {
  return (
    <Show when={props.message()}>
      <div class={`toast ${props.isError() ? 'error' : ''}`} role="status" aria-live="polite">
        {props.message()}
      </div>
    </Show>
  );
}
