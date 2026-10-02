(() => {
  'use strict';

  const form = document.querySelector('[data-unified-auth-form]');
  const emailInput = document.querySelector('[data-unified-auth-email]');
  const passwordInput = document.querySelector('[data-unified-auth-password]');
  const loginPanel = document.querySelector('[data-unified-auth-login]');
  const accountPanel = document.querySelector('[data-unified-auth-account]');
  const accountEmail = document.querySelector('[data-unified-auth-email-label]');
  const authStatus = document.querySelector('[data-unified-auth-status]');
  const financeContent = document.querySelector('[data-finance-content]');
  let accessReadySent = false;

  const setText = (node, value) => { if (node) node.textContent = value; };
  const showToast = (message, kind = 'info') => {
    const toast = document.querySelector('[data-toast]');
    if (toast) { toast.textContent = message; toast.dataset.kind = kind; toast.hidden = false; window.setTimeout(() => { toast.hidden = true; }, 3500); }
  };
  window.showToast = window.showToast || showToast;

  function publishAuthState() {
    const user = window.FirebaseAuth?.user || null;
    const authenticated = Boolean(user?.localId && window.FirebaseAuth?.token);
    if (loginPanel) loginPanel.hidden = authenticated;
    if (accountPanel) accountPanel.hidden = !authenticated;
    if (financeContent) financeContent.classList.toggle('finance-auth-hidden', !authenticated);
    setText(accountEmail, user?.email || 'บัญชีที่เข้าสู่ระบบ');
    setText(authStatus, authenticated ? 'เชื่อมต่อ Firebase แล้ว · ข้อมูลแยกตามบัญชี' : 'ต้องเข้าสู่ระบบ Firebase เพื่อดูหรือบันทึกข้อมูลส่วนตัว');
    if (authenticated) {
      const detail = { user, role: 'user', ready: true, denied: false };
      window.SMARTFARM_ACCESS = detail;
      window.dispatchEvent(new CustomEvent('firebase:auth-state-changed', { detail }));
      if (!accessReadySent) {
        accessReadySent = true;
        window.dispatchEvent(new CustomEvent('access:ready', { detail }));
      }
    } else {
      window.SMARTFARM_ACCESS = { user: null, role: 'user', ready: true, denied: false };
      window.dispatchEvent(new CustomEvent('firebase:auth-state-changed', { detail: { user: null, role: 'user', ready: true, denied: false } }));
    }
  }

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    setText(authStatus, 'กำลังตรวจสอบบัญชี Firebase…');
    try {
      await window.FirebaseAuth.signIn(emailInput.value.trim(), passwordInput.value);
      passwordInput.value = '';
      publishAuthState();
      showToast('เข้าสู่ระบบแล้ว · กำลังโหลดข้อมูลของบัญชีนี้', 'success');
    } catch (error) {
      setText(authStatus, error.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.querySelector('[data-unified-auth-logout]')?.addEventListener('click', () => {
    window.FirebaseAuth?.clear();
    publishAuthState();
    window.location.reload();
  });

  window.addEventListener('firebase:auth-expired', () => {
    if (financeContent) financeContent.classList.add('finance-auth-hidden');
    publishAuthState();
    setText(authStatus, 'เซสชันหมดอายุ · กรุณาเข้าสู่ระบบใหม่');
  });

  async function init() {
    if (!window.FirebaseAuth) { setText(authStatus, 'Firebase Auth ยังไม่พร้อมใช้งาน'); return; }
    if (window.FirebaseAuth.user && window.FirebaseAuth.token && window.FirebaseAuth.refreshToken) {
      await window.FirebaseAuth.refresh();
    }
    publishAuthState();
  }
  init();
})();
