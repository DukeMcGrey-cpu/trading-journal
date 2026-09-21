// A native <dialog> form. On phones it slides up as a bottom sheet, on desktop it is centred.
import { esc } from '../util.js';

const CLOSE_ICON = '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function renderField(f, value) {
  const id = `f-${f.name}`;
  const v = value ?? '';
  const hint = f.hint ? `<p class="hint" id="${id}-hint">${esc(f.hint)}</p>` : '';
  const described = f.hint ? ` aria-describedby="${id}-hint"` : '';
  const req = f.required ? ' required' : '';
  const ro = f.readonly ? ' readonly' : '';

  if (f.type === 'checkbox') {
    const checked = v === true || v === 'true' ? ' checked' : '';
    return `<div class="field field-check"><label class="check"><input type="checkbox" id="${id}" name="${f.name}"${checked}><span>${esc(f.label)}</span></label>${hint}</div>`;
  }

  let control;
  if (f.type === 'select') {
    const opts = f.options.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
    control = `<select class="input" id="${id}" name="${f.name}"${req}${described}>${opts}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea class="input" id="${id}" name="${f.name}" rows="${f.rows || 3}"${req}${described}>${esc(v)}</textarea>`;
  } else if (f.type === 'number') {
    const min = f.min !== undefined ? ` min="${f.min}"` : '';
    control = `<input class="input" id="${id}" name="${f.name}" type="number" inputmode="decimal" step="${f.step || 'any'}"${min} value="${esc(v)}"${req}${ro}${described}>`;
  } else {
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    const cap = f.autocapitalize ? ` autocapitalize="${f.autocapitalize}"` : '';
    control = `<input class="input" id="${id}" name="${f.name}" type="text" value="${esc(v)}"${ph}${cap} autocomplete="off"${req}${ro}${described}>`;
  }
  const optional = f.required || f.readonly ? '' : ' <span class="opt">(optional)</span>';
  return `<div class="field"><label for="${id}">${esc(f.label)}${optional}</label>${control}${hint}</div>`;
}

function collect(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value.trim();
  }
  return out;
}

/**
 * Resolves to { action: 'save' | 'secondary', values } or null when dismissed.
 * options: title, description, fields[], values{}, submitLabel, secondary{label, danger}, validate(values) => error text
 */
export function openForm({ title, description = '', fields = [], values = {}, submitLabel = 'Save', secondary = null, validate = null }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `
      <form class="sheet-form" novalidate>
        <header class="sheet-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">${CLOSE_ICON}</button>
        </header>
        ${description ? `<p class="sheet-desc">${esc(description)}</p>` : ''}
        <div class="sheet-body">${fields.map(f => renderField(f, values[f.name])).join('')}</div>
        <p class="form-error" role="alert" hidden></p>
        <footer class="sheet-foot">
          ${secondary ? `<button type="button" class="btn btn-quiet${secondary.danger ? ' btn-danger-text' : ''}" data-secondary>${esc(secondary.label)}</button>` : '<span></span>'}
          <div class="sheet-foot-main">
            <button type="button" class="btn btn-quiet" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
          </div>
        </footer>
      </form>`;
    document.body.appendChild(dlg);

    const form = dlg.querySelector('form');
    const errorEl = dlg.querySelector('.form-error');
    let result = null;

    const showError = msg => { errorEl.textContent = msg; errorEl.hidden = !msg; };

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const vals = collect(form, fields);
      const problem = validate ? validate(vals) : '';
      if (problem) { showError(problem); return; }
      result = { action: 'save', values: vals };
      dlg.close();
    });
    dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
    const sec = dlg.querySelector('[data-secondary]');
    if (sec) sec.addEventListener('click', () => { result = { action: 'secondary', values: collect(form, fields) }; dlg.close(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });

    dlg.showModal();
    const first = form.querySelector('input:not([readonly]), select, textarea');
    if (first && fields.length) first.focus();
  });
}

/** A yes/no question. Resolves to true when confirmed. */
export async function confirmDialog({ title, text, confirmLabel = 'Confirm' }) {
  const r = await openForm({ title, description: text, submitLabel: confirmLabel });
  return !!r;
}
