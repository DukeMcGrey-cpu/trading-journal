import { html } from '../util.js';
import { icon } from './icons.js';

export function emptyState({ icon: name, title, text, action, actionLabel }) {
  return html`
    <section class="empty">
      <div class="empty-icon">${icon(name, 26)}</div>
      <h2>${title}</h2>
      <p>${text}</p>
      ${action ? html`<button class="btn btn-primary" type="button" data-action="${action}">${actionLabel}</button>` : ''}
    </section>`;
}

const TYPE_LABEL = { LIVE: 'Live', DEMO: 'Demo', PROP: 'Prop firm' };
export const typeLabel = t => TYPE_LABEL[t] || 'Live';

export function typeChip(type) {
  const cls = type === 'LIVE' ? 'chip chip-live' : type === 'PROP' ? 'chip chip-prop' : 'chip';
  return html`<span class="${cls}">${typeLabel(type)}</span>`;
}
