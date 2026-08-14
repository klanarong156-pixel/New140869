(() => {
  'use strict';
  const cropCycle = {
    cacheKey: 'smartfarm.cropCycle.cache',
    normalize(value) {
      const crop = String(value?.crop || '').trim().slice(0, 100);
      const startDate = String(value?.startDate || '').slice(0, 10);
      return { crop, startDate, updatedAt: value?.updatedAt || new Date().toISOString() };
    },
    async save(startDate, cropName) {
      const data = this.normalize({ crop: cropName, startDate, updatedAt: new Date().toISOString() });
      if (!data.crop || !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) throw new Error('กรุณาระบุชื่อพืชและวันที่ปลูกให้ถูกต้อง');
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
      if (typeof FirebaseDB !== 'undefined' && FirebaseAuth?.user) await FirebaseDB.put('farm/cropCycle', data);
      return data;
    },
    async load() {
      if (typeof FirebaseDB !== 'undefined' && FirebaseAuth?.user) {
        try {
          const cloud = await FirebaseDB.get('farm/cropCycle');
          if (cloud) {
            const data = this.normalize(cloud);
            localStorage.setItem(this.cacheKey, JSON.stringify(data));
            return data;
          }
        } catch (error) { console.warn('โหลดข้อมูลรอบปลูกจาก Firebase ไม่สำเร็จ', error); }
      }
      return this.get();
    },
    get() {
      try { return this.normalize(JSON.parse(localStorage.getItem(this.cacheKey) || '{}')); } catch (error) { return this.normalize({}); }
    },
    age(value = this.get()) {
      if (!value.startDate) return 0;
      const start = new Date(`${value.startDate}T00:00:00`);
      const today = new Date();
      const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const days = Math.floor((current - start) / 86400000);
      return Math.max(0, days);
    }
  };
  window.cropCycle = cropCycle;
})();
