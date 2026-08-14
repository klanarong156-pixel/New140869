(function () {
  'use strict';

  const state = { user: null, role: 'user', ready: false };

  async function getRole() {
    const uid = FirebaseAuth.user?.localId;
    if (!uid) return 'user';
    try {
      const role = await FirebaseRoot.get(`roles/${uid}`);
      return role?.role === 'admin' ? 'admin' : 'user';
    } catch (error) {
      console.warn('Role lookup failed; using user role.', error);
      return 'user';
    }
  }

  function loginUrl() {
    const current = `${location.pathname.split('/').pop() || 'index.html'}${location.search || ''}`;
    return `auth.html?next=${encodeURIComponent(current)}`;
  }

  async function ensureFreshSession() {
    if (!FirebaseAuth.user) return false;
    if (!FirebaseAuth.refreshToken) return true;
    return FirebaseAuth.refresh();
  }

  async function init() {
    if (!window.FirebaseAuth || !window.FirebaseRoot) return false;
    if (!(await ensureFreshSession())) {
      location.replace(loginUrl());
      return false;
    }
    state.user = FirebaseAuth.user;
    state.role = await getRole();
    state.ready = true;
    window.SMARTFARM_ACCESS = state;
    window.dispatchEvent(new CustomEvent('access:ready', { detail: state }));
    return true;
  }

  window.requireAuth = init;
  window.requireAdmin = async function requireAdmin() {
    const ready = await init();
    if (ready && state.role !== 'admin') {
      window.showToast?.('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น', 'warning');
      window.setTimeout(() => location.replace('index.html'), 700);
      return false;
    }
    return ready;
  };
  window.isAdmin = () => state.role === 'admin';
  window.logoutAccount = function logoutAccount() {
    FirebaseAuth.clear();
    location.replace('auth.html');
  };

  function boot() {
    if (document.body?.dataset.authRequired === 'true') init();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
