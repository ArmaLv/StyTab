(function () {
  const params = new URLSearchParams(window.location.search);
  const result = {
    code:  params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
  };

  try { localStorage.setItem('spotify_auth_result', JSON.stringify(result)); } catch (e) {}
  if (window.opener) { try { window.opener.postMessage(result, '*'); } catch (e) {} }

  document.body.textContent = 'Authenticated — you can close this window.';
  window.close();
})();
