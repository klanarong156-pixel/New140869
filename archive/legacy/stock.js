
async function saveStock(item){
  return firebase.database()
    .ref("stock")
    .push(item);
}
