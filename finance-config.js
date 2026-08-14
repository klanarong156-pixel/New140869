
const FARM_CONFIG = {
  farmId: "Farm001",
  farmName: "สวนลุงนะ Smart Farm",
  currency: "THB",
  crop: "แตง",
  storagePath: "finance"
};

function money(v){
  return Number(v||0).toLocaleString("th-TH",{minimumFractionDigits:2});
}
