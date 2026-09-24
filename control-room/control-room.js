(() => {
  'use strict';
  const toast = document.querySelector('.toast');
  let timer = 0;
  const showToast = message => { if (!toast) return; toast.textContent = message; toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(() => toast.classList.remove('show'), 2600); };
  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.toast)));
  document.querySelectorAll('[data-relay]').forEach(button => button.addEventListener('click', () => showToast(`ตัวอย่าง UI: ${button.dataset.relay} · ${button.dataset.value} · ยังไม่ส่งคำสั่งจริง`)));
})();
