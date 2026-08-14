// SmartFarm V5.7 Crop Cycle Cloud Sync
// ข้อมูลการปลูกผูกกับบัญชี Firebase เพื่อเปิดเครื่องอื่นแล้วเห็นข้อมูลเดิม

const cropCycle = {
  cacheKey: "smartfarm.cropCycle.cache",

  async save(startDate, cropName){
    const data = {
      crop: cropName,
      startDate: startDate,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(this.cacheKey, JSON.stringify(data));

    if (typeof FirebaseDB !== "undefined" && FirebaseAuth?.user) {
      await FirebaseDB.put("farm/cropCycle", data);
    }
    return data;
  },

  async load(){
    if (typeof FirebaseDB !== "undefined" && FirebaseAuth?.user) {
      try {
        const cloud = await FirebaseDB.get("farm/cropCycle");
        if(cloud){
          localStorage.setItem(this.cacheKey, JSON.stringify(cloud));
          return cloud;
        }
      } catch(e){}
    }

    return JSON.parse(localStorage.getItem(this.cacheKey) || "{}");
  },

  get(){
    return JSON.parse(localStorage.getItem(this.cacheKey) || "{}");
  },

  age(){
    const d=this.get();
    if(!d.startDate) return 0;
    return Math.floor((Date.now()-new Date(d.startDate))/86400000);
  }
};
