
function calculateCropSummary(items, kg=0){
  if(window.FinanceCore) return FinanceCore.summary(items,kg);
  let income=0,expense=0,pending=0;
  items.forEach(x=>{
    if(x.type==="income") income += Number(x.amount||0);
    if(x.type==="expense") expense += Number(x.amount||0);
    if(x.type==="pending") pending += Number(x.amount||0);
  });

  return {
    income,
    expense,
    pending,
    profit: income-expense-pending,
    costPerKg: kg>0 ? expense/kg : 0
  };
}
