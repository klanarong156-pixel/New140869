// SmartFarm V6.0 access control. Firebase is the authority for role data.
(function(){
  'use strict';
  const state={user:null,role:'user',ready:false};
  const rootUrl=path=>`${FIREBASE_CONFIG.databaseURL.replace(/\/+$/,'')}/${String(path).replace(/^\/+|\/+$/g,'')}.json?auth=${encodeURIComponent(FirebaseAuth.token)}`;
  async function rootGet(path){const res=await fetch(rootUrl(path),{cache:'no-store'});if(!res.ok)throw new Error('Firebase root read HTTP '+res.status);return res.json();}
  async function ensureUserRole(){
    const uid=FirebaseAuth.user?.localId;if(!uid)return'user';
    try{const roleData=await rootGet('roles/'+uid);return roleData?.role==='admin'?'admin':'user';}
    catch(e){console.warn('Role lookup failed; fail closed as user',e);return'user';}
  }
  async function refreshSession(){if(!FirebaseAuth.user)return false;if(FirebaseAuth.refreshToken)await FirebaseAuth.refresh();return!!FirebaseAuth.user;}
  async function init(){if(!window.FirebaseAuth||!window.FirebaseDB)return false;if(!(await refreshSession())){location.replace('auth.html');return false;}state.user=FirebaseAuth.user;state.role=await ensureUserRole();state.ready=true;window.SMARTFARM_ACCESS=state;window.dispatchEvent(new CustomEvent('access:ready',{detail:state}));return true;}
  window.requireAuth=async()=>init();
  window.requireAdmin=async()=>{const ok=await init();if(ok&&state.role!=='admin'){alert('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');location.replace('index.html');return false;}return ok;};
  window.isAdmin=()=>state.role==='admin';
  window.logoutAccount=()=>{FirebaseAuth.clear();location.replace('auth.html');};
  window.addEventListener('load',()=>{if(document.body.dataset.authRequired==='true')init();});
})();
