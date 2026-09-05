(() => {
  'use strict';
  const otaLink = document.querySelector('[data-admin-ota-link]');
  if (!otaLink) return;
  const revealForAdmin = event => {
    if (event.detail?.role === 'admin') otaLink.hidden = false;
  };
  window.addEventListener('access:ready', revealForAdmin, { once: true });
  if (window.SMARTFARM_ACCESS?.ready) revealForAdmin({ detail: window.SMARTFARM_ACCESS });
})();
