// SmartFarm Finance Core V6.2
window.FinanceCore={
 summary(items=[],kg=0){
  let income=0,expense=0,pending=0;
  items.forEach(x=>{
   if(x.status === "cancelled") return;
   if(x.type==="income") income+=Number(x.amount||0);
   if(x.type==="expense") expense+=Number(x.amount||0);
   if(x.type==="pending") pending+=Number(x.amount||0);
  });
  return {income,expense,pending,profit:income-expense-pending,costPerKg:kg?expense/kg:0};
 }
};
