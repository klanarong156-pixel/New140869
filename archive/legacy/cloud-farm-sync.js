
// SmartFarm Cloud Farm Profile Sync
// เปิดจากเครื่องไหนก็เห็นข้อมูลฟาร์มเดิมด้วยบัญชี Firebase เดียวกัน

const FarmCloudSync = {
  async ensureProfile(){
    if(typeof FirebaseDB==="undefined" || !FirebaseAuth?.user) return;
    const existing = await FirebaseDB.get("profile");
    if(!existing){
      await FirebaseDB.put("profile",{
        email: FirebaseAuth.user.email || "",
        farmName: "Smart Farm",
        createdAt: new Date().toISOString()
      });
    }
  },

  async load(){
    if(!FirebaseAuth?.user) return null;
    return await FirebaseDB.get("profile");
  },

  async save(data={}){
    if(!FirebaseAuth?.user) return;
    return await FirebaseDB.patch("profile",{
      ...data,
      updatedAt:new Date().toISOString()
    });
  }
};

window.FarmCloudSync=FarmCloudSync;
