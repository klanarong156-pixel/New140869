(function () {
  'use strict';
  const grades = ['good', 'sorted', 'large'];
  const money = value => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 }).format(Number(value) || 0);
  const kg = value => `${(Number(value) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const text = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  function boot() {
    if (!window.CucumberSales || !window.FirebaseDB) return;
    window.addEventListener('access:ready', async () => {
      try {
        const data = await window.CucumberSales.loadCucumberData();
        const sales = data.sales.filter(sale => sale.status !== 'cancelled');
        const todaySales = sales.filter(sale => sale.date === today());
        const monthSales = sales.filter(sale => sale.date.startsWith(today().slice(0, 7)));
        const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
        text('dashboardCucumberToday', money(sum(todaySales, 'totalAmount')));
        text('dashboardCucumberWeight', kg(sum(todaySales, 'totalWeight')));
        text('dashboardCucumberMonth', money(sum(monthSales, 'totalAmount')));
        text('dashboardCucumberCount', `${sales.length} รายการ`);
        text('dashboardCucumberStatus', sales.length ? `อัปเดตจากข้อมูลจริง · ${sales.length} รายการ` : 'ยังไม่มีรายการขายแตงกวา');
      } catch (error) { text('dashboardCucumberStatus', 'ยังโหลดข้อมูลขายแตงกวาไม่ได้'); console.warn('Cucumber dashboard load failed:', error); }
    }, { once: true });
  }
  boot();
})();
