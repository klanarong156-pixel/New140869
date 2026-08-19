(() => {
  'use strict';

  const formatter = new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2
  });

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  async function loadDashboardFinance() {
    const summaryBox = document.getElementById('financeSummary');
    if (!summaryBox || typeof window.loadFinanceItems !== 'function') return;

    try {
      const items = await window.loadFinanceItems();
      const totals = window.FinanceCore?.summary(items, 0) || {
        income: 0,
        expense: 0,
        pending: 0,
        profit: 0
      };
      setText('dashboardFinanceIncome', formatter.format(totals.income));
      setText('dashboardFinanceExpense', formatter.format(totals.expense));
      setText('dashboardFinanceProfit', formatter.format(totals.profit));
      setText('financeSummaryStatus', items.length
        ? `อัปเดตจาก ${items.length} รายการล่าสุด`
        : 'ยังไม่มีรายการการเงิน');
      summaryBox.dataset.loaded = 'true';
    } catch (error) {
      console.warn('Dashboard finance summary unavailable:', error);
      setText('financeSummaryStatus', 'ยังโหลดข้อมูลไม่ได้ กรุณาเปิดหน้าการเงินเพื่อลองใหม่');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDashboardFinance, { once: true });
  } else {
    loadDashboardFinance();
  }
})();
