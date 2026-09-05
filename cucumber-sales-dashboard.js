(function () {
  'use strict';
  const grades = ['good', 'sorted', 'large'];
  const round = value => Math.round((Number(value) || 0) * 100 + Number.EPSILON) / 100;
  const money = value => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 }).format(Number(value) || 0);
  const recomputeSaleTotals = sale => {
    const totals = grades.reduce((result, grade) => {
      const weight = Number(sale.grades?.[grade]?.weight);
      const price = Number(sale.grades?.[grade]?.price);
      const safeWeight = Number.isFinite(weight) && weight >= 0 ? weight : 0;
      const safePrice = Number.isFinite(price) && price >= 0 ? price : 0;
      result.totalWeight += safeWeight;
      result.totalAmount += safeWeight * safePrice;
      return result;
    }, { totalWeight: 0, totalAmount: 0 });
    return { totalWeight: round(totals.totalWeight), totalAmount: round(totals.totalAmount) };
  };
  const kg = value => `${(Number(value) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const text = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  function boot() {
    if (!window.CucumberSales || !window.FirebaseDB) return;
    window.addEventListener('access:ready', async () => {
      try {
        const data = await window.CucumberSales.loadCucumberData();
        const sales = data.sales
          .filter(sale => sale.status !== 'cancelled')
          .map(sale => ({ ...sale, ...recomputeSaleTotals(sale) }));
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
