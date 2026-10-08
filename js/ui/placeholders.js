// Screens whose features arrive in later builds. Each one explains what will appear and when.
import { html, mount } from '../util.js';
import { state, on } from '../store.js';
import { emptyState } from './components.js';
import { icon } from './icons.js';

export function improveView(outlet) {
  const draw = () => {
    const min = Number(state.data.settings.minTrades) || 20;
    const closed = state.data.trades.filter(t => t.status === 'CLOSED').length;
    mount(outlet, emptyState({
      icon: 'bulb',
      title: 'Recommendations start after ' + min + ' closed trades',
      text: `You have ${closed} so far. Patterns like oversized risk, revenge trading and weak sessions only show up with enough history.`
    }));
  };
  draw();
  return on('data', draw);
}

export function moreView(outlet) {
  if (window.matchMedia('(min-width: 900px)').matches) { location.hash = '#/dashboard'; return; }
  const item = (href, ic, label) => html`
    <a class="row" href="${href}"><span class="row-end">${icon(ic, 20)}<span class="row-title">${label}</span></span>${icon('chevron', 18)}</a>`;
  mount(outlet, html`
    <nav class="list link-list" aria-label="More">
      ${item('#/analytics', 'chart', 'Analytics')}
      ${item('#/improve', 'bulb', 'Improve')}
      ${item('#/settings', 'sliders', 'Settings')}
    </nav>`);
}
