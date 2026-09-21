import { html, mount, $ } from '../util.js';
import { API_URL } from '../config.js';
import { callApi, getSession, saveSession } from '../api.js';
import { brandMark } from './icons.js';

export function showLogin(onSuccess) {
  const needUrl = !API_URL;
  const saved = getSession();
  const message = sessionStorage.getItem('tj_msg') || '';
  sessionStorage.removeItem('tj_msg');

  mount($('#app'), html`
    <main class="login">
      <form class="login-card" novalidate>
        <div class="login-brand">${brandMark(44)}<h1>Trading journal</h1></div>
        <p class="login-lead">Sign in to open your journal. You only need to do this once on each device.</p>
        <div class="card">
          ${needUrl ? html`
            <div class="field">
              <label for="apiUrl">Web app URL</label>
              <input class="input" id="apiUrl" name="apiUrl" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" value="${saved.apiUrl}" aria-describedby="apiUrl-hint" required>
              <p class="hint" id="apiUrl-hint">Copy it from your Apps Script deployment. It ends in /exec.</p>
            </div>` : ''}
          <div class="field">
            <label for="token">Passphrase</label>
            <div class="pw-wrap">
              <input class="input" id="token" name="token" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required>
              <button class="pw-toggle" type="button" aria-pressed="false">Show</button>
            </div>
          </div>
          <p class="form-error" role="alert" ${message ? '' : 'hidden'}>${message}</p>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        </div>
      </form>
    </main>`);

  const form = $('.login-card');
  const errorEl = $('.form-error', form);
  const submit = $('button[type="submit"]', form);
  const toggle = $('.pw-toggle', form);
  const tokenInput = $('#token', form);

  const fail = text => { errorEl.textContent = text; errorEl.hidden = !text; };

  toggle.addEventListener('click', () => {
    const show = tokenInput.type === 'password';
    tokenInput.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(show));
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const apiUrl = needUrl ? form.elements.apiUrl.value.trim() : API_URL;
    const token = tokenInput.value;

    if (needUrl && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(apiUrl)) {
      return fail('Enter the full Web app URL. It starts with https://script.google.com and ends in /exec.');
    }
    if (!token) return fail('Enter your passphrase.');

    fail('');
    submit.disabled = true;
    submit.textContent = 'Signing in';
    try {
      await callApi('auth.check', {}, { apiUrl, token });
      saveSession(apiUrl, token);
      onSuccess();
    } catch (err) {
      if (err.code === 'AUTH') fail('That passphrase was not accepted. After 10 wrong attempts the backend pauses for 10 minutes.');
      else if (err.code === 'NETWORK') fail(`${err.message} Check your connection and the Web app URL.`);
      else fail('The URL did not answer like the journal backend. Check that it is the latest deployment and ends in /exec.');
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });

  (needUrl && !saved.apiUrl ? form.elements.apiUrl : tokenInput).focus();
}
