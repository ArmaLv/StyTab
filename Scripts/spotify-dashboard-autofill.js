// Runs on developer.spotify.com/dashboard pages
// Creates a Spotify app for StyTab. On the "create app" page it pre-fills the fields
// (it does NOT accept the Terms or submit. the user does that).
// On the resulting app page it grabs the Client ID and hands it to StyTab.
(function () {
  const REDIRECT_URI = 'https://stytab-callback.vercel.app/callback.html';
  const APP_NAME = 'StyTab';
  const APP_DESC = 'Personal new-tab Spotify now-playing widget.';

  const storage =
    (typeof browser !== 'undefined' && browser.storage) ? browser.storage :
    (typeof chrome  !== 'undefined' && chrome.storage)  ? chrome.storage  : null;

  let captured = false;

  function setReactValue(elem, value) {
    const proto = elem instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(elem, value);
    elem.dispatchEvent(new Event('input', { bubbles: true }));
    elem.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillCreateForm() {
    const name = document.getElementById('name');
    const desc = document.getElementById('description');
    const redirect = document.getElementById('newRedirectUri');
    const webApi = document.getElementById('apis-used-1');
    if (!name || !desc || !redirect || !webApi) return;

    if (!name.value) setReactValue(name, APP_NAME);
    if (!desc.value) setReactValue(desc, APP_DESC);
    if (!webApi.checked) webApi.click();

    const terms = document.getElementById('termsAccepted');
    if (terms && !terms.checked) terms.click();

    const group = redirect.closest('.e-10202-form-group');
    const list = group && group.querySelector('ul');
    const alreadyAdded = list && list.textContent.includes(REDIRECT_URI);
    if (!alreadyAdded && !redirect.value) {
      setReactValue(redirect, REDIRECT_URI);
      const addBtn = document.querySelector('button[aria-label="Add redirect URI"]');
      if (addBtn) addBtn.click();
    }
  }

  function saveClientId(id) {
    captured = true;
    try { storage.local.set({ stytab_pending_client_id: id.toLowerCase() }); } catch (e) {}
  }

  function captureClientId() {
    if (captured || !storage) return;

    const fromUrl = location.pathname.match(/\/dashboard\/([0-9a-f]{32})(?:[/?#]|$)/i);
    if (fromUrl) { saveClientId(fromUrl[1]); return; }

    const label = Array.from(document.querySelectorAll('span, div, p'))
      .find(el => (el.textContent || '').trim() === 'Client ID');
    const scope = (label && label.parentElement) || document;
    const value = Array.from(scope.querySelectorAll('span, div'))
      .map(el => (el.textContent || '').trim())
      .find(t => /^[0-9a-f]{32}$/i.test(t));
    if (value) saveClientId(value);
  }

  const timer = setInterval(() => {
    if (location.pathname.includes('/dashboard/create')) fillCreateForm();
    else if (/\/dashboard\/.+/.test(location.pathname)) captureClientId();
  }, 500);
  setTimeout(() => clearInterval(timer), 60000);
})();
