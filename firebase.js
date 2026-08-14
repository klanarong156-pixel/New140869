// SmartFarm V6.0 - Firebase Auth + Realtime Database
// Firebase = persistent storage. MQTT = real-time transport.

const FIREBASE_CONFIG = Object.freeze({
  databaseURL: "https://smart-farm-platfor-default-rtdb.asia-southeast1.firebasedatabase.app",
  apiKey: "AIzaSyBFklOdg4RXeXlHfG826DwaKTjf5hV4eHo",
  authDomain: "smart-farm-platfor.firebaseapp.com",
  paths: Object.freeze({ farms: "farms", farm: "farm" }),
  timeoutMs: 10000
});
window.FIREBASE_CONFIG = FIREBASE_CONFIG;

const FirebaseAuth = {
  tokenKey: 'smartfarm.firebase.idToken', refreshKey: 'smartfarm.firebase.refreshToken', userKey: 'smartfarm.firebase.user',
  get token(){ return localStorage.getItem(this.tokenKey) || ''; },
  get refreshToken(){ return localStorage.getItem(this.refreshKey) || ''; },
  get user(){ try{return JSON.parse(localStorage.getItem(this.userKey)||'null')}catch(_){return null;} },
  setSession(data){localStorage.setItem(this.tokenKey,data.idToken||'');localStorage.setItem(this.refreshKey,data.refreshToken||'');localStorage.setItem(this.userKey,JSON.stringify({localId:data.localId,email:data.email||''}));},
  clear(){[this.tokenKey,this.refreshKey,this.userKey].forEach(k=>localStorage.removeItem(k));},
  configured(){return !!(FIREBASE_CONFIG.apiKey&&!FIREBASE_CONFIG.apiKey.includes('PUT_YOUR_'));},
  async authRequest(endpoint,body){
    if(!this.configured())throw new Error('ยังไม่ได้ใส่ Firebase Web API Key ใน dashboard/firebase.js');
    const res=await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(this.authError(data?.error?.message));this.setSession(data);return data;
  },
  authError(code){const map={EMAIL_EXISTS:'อีเมลนี้ถูกใช้แล้ว',EMAIL_NOT_FOUND:'ไม่พบอีเมลนี้',INVALID_PASSWORD:'รหัสผ่านไม่ถูกต้อง',INVALID_LOGIN_CREDENTIALS:'อีเมลหรือรหัสผ่านไม่ถูกต้อง',WEAK_PASSWORD:'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',USER_DISABLED:'บัญชีถูกปิดใช้งาน'};return map[code]||code||'Firebase Authentication ผิดพลาด';},
  signIn(email,password){return this.authRequest('accounts:signInWithPassword',{email,password,returnSecureToken:true});},
  signUp(email,password){return this.authRequest('accounts:signUp',{email,password,returnSecureToken:true});},
  async refresh(){if(!this.refreshToken)return false;const res=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:this.refreshToken})});const data=await res.json().catch(()=>({}));if(!res.ok){this.clear();return false;}localStorage.setItem(this.tokenKey,data.id_token||'');localStorage.setItem(this.refreshKey,data.refresh_token||this.refreshToken);if(data.user_id)localStorage.setItem(this.userKey,JSON.stringify({localId:data.user_id,email:this.user?.email||''}));return true;}
};

window.FirebaseAuth = FirebaseAuth;

const FirebaseDB = {
  basePath(path=''){const uid=FirebaseAuth.user?.localId;if(!uid)throw new Error('กรุณาเข้าสู่ระบบ Firebase');const clean=String(path).replace(/^\/+|\/+$/g,'');return `users/${encodeURIComponent(uid)}/${clean}`.replace(/\/$/,'');},
  url(path=''){const clean=this.basePath(path);const auth=FirebaseAuth.token?`?auth=${encodeURIComponent(FirebaseAuth.token)}`:'';return FIREBASE_CONFIG.databaseURL.replace(/\/+$/,'')+'/'+clean+'.json'+auth;},
  async request(path,options={},retry=true){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),FIREBASE_CONFIG.timeoutMs);try{const res=await fetch(this.url(path),{cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',...(options.headers||{})},...options});if(res.status===401&&retry&&await FirebaseAuth.refresh())return this.request(path,options,false);if(!res.ok){let detail='';try{detail=await res.text()}catch(_){}throw new Error('HTTP '+res.status+(detail?' • '+detail.slice(0,160):''));}return res.status===204?null:res.json();}catch(err){if(err?.name==='AbortError')throw new Error('Firebase connection timeout');throw err;}finally{clearTimeout(timer);}},
  get(path){return this.request(path);},put(path,data){return this.request(path,{method:'PUT',body:JSON.stringify(data)});},patch(path,data){return this.request(path,{method:'PATCH',body:JSON.stringify(data)});},post(path,data){return this.request(path,{method:'POST',body:JSON.stringify(data)});},delete(path){return this.request(path,{method:'DELETE'});},serverTimestamp(){return {'.sv':'timestamp'};}
};

window.FirebaseDB = FirebaseDB;

// Root-level Firebase access is intentionally separate from FirebaseDB.
// It is required for /roles, whose security rules live at the database root.
const FirebaseRoot = {
  url(path=''){const clean=String(path).replace(/^\/+|\/+$/g,'');const auth=FirebaseAuth.token?`?auth=${encodeURIComponent(FirebaseAuth.token)}`:'';return FIREBASE_CONFIG.databaseURL.replace(/\/+$/,'')+'/'+clean+'.json'+auth;},
  async request(path,options={},retry=true){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),FIREBASE_CONFIG.timeoutMs);try{const res=await fetch(this.url(path),{cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',...(options.headers||{})},...options});if(res.status===401&&retry&&await FirebaseAuth.refresh())return this.request(path,options,false);if(!res.ok){let detail='';try{detail=await res.text()}catch(_){}throw new Error('Firebase root HTTP '+res.status+(detail?' • '+detail.slice(0,160):''));}return res.status===204?null:res.json();}catch(err){if(err?.name==='AbortError')throw new Error('Firebase connection timeout');throw err;}finally{clearTimeout(timer);}},
  get(path){return this.request(path);},put(path,data){return this.request(path,{method:'PUT',body:JSON.stringify(data)});},patch(path,data){return this.request(path,{method:'PATCH',body:JSON.stringify(data)});},delete(path){return this.request(path,{method:'DELETE'});}
};
window.FirebaseRoot = FirebaseRoot;
