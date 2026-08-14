(function () {
  'use strict';

  let mode = 'signin';
  const $ = id => document.getElementById(id);

  function safeNextUrl() {
    const next = new URLSearchParams(location.search).get('next') || 'index.html';
    try {
      const target = new URL(next, location.href);
      if (target.origin === location.origin && !target.pathname.endsWith('/auth.html')) return `${target.pathname.split('/').pop() || 'index.html'}${target.search}`;
    } catch (_) { /* Fall back to dashboard. */ }
    return 'index.html';
  }

  function setStatus(message = '', type = '') {
    const status = $('authStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `notice ${type}`;
    status.classList.toggle('hidden', !message);
  }

  function renderMode() {
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
    $('authTitle').textContent = mode === 'signin' ? 'ยินดีต้อนรับกลับมา' : 'เริ่มต้นฟาร์มของคุณ';
    $('authDescription').textContent = mode === 'signin' ? 'เข้าสู่ระบบเพื่อจัดการข้อมูลฟาร์มและบันทึกการเงินของคุณ' : 'สร้างบัญชีเพื่อบันทึกข้อมูลฟาร์มของคุณอย่างเป็นส่วนตัว';
    $('authSubmit').textContent = mode === 'signin' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี';
    $('passwordHint').textContent = mode === 'signin' ? 'ใช้รหัสผ่านของบัญชี Smart Farm' : 'อย่างน้อย 6 ตัวอักษร';
    setStatus();
  }

  async function submit(event) {
    event.preventDefault();
    const email = $('email').value.trim();
    const password = $('password').value;
    const submitButton = $('authSubmit');
    if (!email || !password) return setStatus('กรอกอีเมลและรหัสผ่านให้ครบ', 'warning');
    submitButton.disabled = true;
    setStatus(mode === 'signin' ? 'กำลังเข้าสู่ระบบ…' : 'กำลังสร้างบัญชี…');
    try {
      const session = mode === 'signin' ? await FirebaseAuth.signIn(email, password) : await FirebaseAuth.signUp(email, password);
      if (mode === 'signup') {
        try {
          await FirebaseRoot.put(`roles/${session.localId}`, { role: 'user', email: session.email || email, createdAt: new Date().toISOString() });
        } catch (error) {
          console.warn('Could not create role record.', error);
        }
      }
      setStatus('สำเร็จ กำลังพาไปยังหน้าฟาร์มของคุณ…', 'success');
      window.setTimeout(() => location.replace(safeNextUrl()), 350);
    } catch (error) {
      setStatus(error.message || 'ไม่สามารถยืนยันตัวตนได้', 'danger');
    } finally {
      submitButton.disabled = false;
    }
  }

  function boot() {
    if (FirebaseAuth.user) location.replace(safeNextUrl());
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.authMode; renderMode(); }));
    $('authForm').addEventListener('submit', submit);
    renderMode();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
