
// SmartFarm Finance Firebase Module - Fixed to use FirebaseDB REST wrapper
function generateFinanceId(){return 'FIN-'+Date.now()+'-'+Math.floor(Math.random()*1000);}

let financeSaveLock = false;

async function saveFinanceItem(item){
  if (financeSaveLock) throw new Error("กำลังบันทึกข้อมูล...");
  financeSaveLock = true;
  try {
    const financeId = item.id || generateFinanceId();
    const data = {
      ...item,
      id: financeId,
      createdAt: item.createdAt || new Date().toISOString()
    };
    // ใช้ FirebaseDB.put เพื่อบันทึกข้อมูลลงใน users/UID/finance/ID
    await FirebaseDB.put(`finance/${financeId}`, data);
    return data;
  } finally {
    financeSaveLock = false;
  }
}

async function loadFinanceItems(callback){
  try {
    // ดึงข้อมูลจาก users/UID/finance
    const data = await FirebaseDB.get('finance');
    const items = data ? Object.keys(data).map(key => ({id: key, ...data[key]})) : [];
    // เรียงลำดับตามวันที่สร้าง (ใหม่ไปเก่า)
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    callback(items);
  } catch(e) {
    console.error("Load finance failed:", e);
    callback([]);
  }
}

async function deleteFinanceItem(id){
  return FirebaseDB.delete(`finance/${id}`);
}
