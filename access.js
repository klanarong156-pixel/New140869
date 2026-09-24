(function () {
  'use strict';

  const state = { user: null, role: 'user', ready: false, denied: false };
  let accessPromise = null;

  async function getRole() {
    const uid = FirebaseAuth.user?.localId;
    if (!uid) return 'user';
    try {
      const role = await FirebaseRoot.get(`roles/${uid}`);
      return role?.role === 'admin' ? 'admin' : 'user';
    } catch (error) {
      // Fail closed: role lookup failure never grants admin access.
      console.warn('Role lookup failed; using user role.', error);
      return 'user';
    }
  }

  function loginUrl() {
    const current = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    const authPath = location.pathname.includes('/dashboard/') ? '../auth.html' : 'auth.html';
    return `${authPath}?next=${encodeURIComponent(current)}`;
  }

  async function ensureFreshSession() {
    if (!FirebaseAuth.user || !FirebaseAuth.token) return false;
    if (!FirebaseAuth.refreshToken) return true;
    return FirebaseAuth.refresh();
  }

  async function resolveAccess() {
    if (!window.FirebaseAuth || !window.FirebaseRoot) {
      state.ready = true;
      state.denied = true;
      window.SMARTFARM_ACCESS = state;
      window.dispatchEvent(new CustomEvent('access:ready', { detail: state }));
      return state;
    }
    if (!(await ensureFreshSession())) {
      location.replace(loginUrl());
      return null;
    }
    state.user = FirebaseAuth.user;
    state.role = await getRole();
    state.ready = true;
    state.denied = state.role !== 'admin';
    window.SMARTFARM_ACCESS = state;
    window.dispatchEvent(new CustomEvent('access:ready', { detail: state }));
    return state;
  }

  function init() {
    if (!accessPromise) accessPromise = resolveAccess();
    return accessPromise;
  }

  window.addEventListener('firebase:auth-expired', () => {
    location.replace(loginUrl());
  });

  window.requireAuth = async function requireAuth() {
    return Boolean(await init());
  };

  window.requireAdmin = async function requireAdmin() {
    const access = await init();
    if (!access) return false;
    if (access.role !== 'admin') {
      window.showToast?.('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น', 'warning');
      window.setTimeout(() => location.replace('index.html'), 700);
      return false;
    }
    return true;
  };

  window.isAdmin = () => state.ready && state.role === 'admin';
  window.logoutAccount = function logoutAccount() {
    FirebaseAuth.clear();
    location.replace('auth.html');
  };

  function boot() {
    if (document.body?.dataset.adminRequired === 'true') {
      window.requireAdmin();
      return;
    }
    if (document.body?.dataset.authRequired === 'true') init();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
