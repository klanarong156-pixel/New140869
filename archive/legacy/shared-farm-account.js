
// SmartFarm Shared Farm Account + PDF Summary V4
// Shared farm model: farms/{farmId}

window.FarmUserManager = {
  farmId: "Farm001",
  role: "viewer",

  async load(){
    if(!FirebaseDB || !FirebaseAuth?.user) return;
    // หมายเหตุ: FirebaseDB.basePath จะเติม users/UID/ ข้างหน้าเสมอ 
    // ดังนั้นข้อมูลจะยังคงแยกตามผู้ใช้ตามที่ระบุใน firebase-setup.md
    const path = `farms/${this.farmId}`;
    let data = await FirebaseDB.get(path);
    
    const user = FirebaseAuth.user;
    const uid = user.localId; // เปลี่ยนจาก .uid เป็น .localId เพื่อให้ตรงกับ firebase.js

    if(!data){
      data={
        profile:{name:"Smart Farm",createdAt:new Date().toISOString(),owner:user.email},
        members:{}
      };
      data.members[uid]={email:user.email,role:"admin"};
      await FirebaseDB.patch(path,data);
    }
    
    this.role=(data.members?.[uid]?.role)||"viewer";
    return data;
  },

  async exportFarmSummaryPDF(){
    const data = await FirebaseDB.get(`farms/${this.farmId}`) || {};
    const p = data.profile || {};
    const members = data.members || {};
    let text = `SMART FARM ACCOUNT SUMMARY\n\nFarm: ${p.name || "-"}\nFarm ID: ${this.farmId}\nOwner: ${p.owner || "-"}\nCreated: ${p.createdAt || "-"}\n\nMembers\n`;
    Object.values(members).forEach(m => text += `${m.email || "-"} : ${m.role || "-"}\n`);
    
    const blob = new Blob([text], {type: "text/plain"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "smartfarm_farm_summary.txt";
    a.click();
  }
};

// Backward compatibility
window.SharedFarm = window.FarmUserManager;
