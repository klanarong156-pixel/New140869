const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

initializeApp();

const auth = getAuth();
const db = getDatabase();

function requireAdmin(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบก่อน');
  return db.ref(`roles/${uid}/role`).once('value').then(snapshot => {
    if (snapshot.val() !== 'admin') throw new HttpsError('permission-denied', 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');
    return uid;
  });
}

function stringArg(data, key) {
  const value = String(data?.[key] || '').trim();
  if (!value || value.length > 160) throw new HttpsError('invalid-argument', `ข้อมูล ${key} ไม่ถูกต้อง`);
  return value;
}

async function writeAudit(actorUid, action, targetUid, detail = {}) {
  await db.ref('userManagementAudit').push({
    actorUid,
    action,
    targetUid,
    detail,
    at: Date.now()
  });
}

async function getRoles() {
  const snapshot = await db.ref('roles').once('value');
  return snapshot.val() || {};
}

async function assertCanRemoveAdmin(targetUid, action) {
  const roles = await getRoles();
  const adminUids = Object.entries(roles)
    .filter(([, record]) => record?.role === 'admin')
    .map(([uid]) => uid);
  if (roles[targetUid]?.role === 'admin' && adminUids.length <= 1) {
    throw new HttpsError('failed-precondition', `ไม่สามารถ ${action} Admin คนสุดท้ายได้`);
  }
}

exports.listUsers = onCall(async request => {
  const actorUid = await requireAdmin(request);
  const pageToken = request.data?.pageToken ? String(request.data.pageToken) : undefined;
  const result = await auth.listUsers(1000, pageToken);
  const roles = await getRoles();
  await writeAudit(actorUid, 'list_users', actorUid, { count: result.users.length });
  return {
    users: result.users.map(user => ({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      disabled: Boolean(user.disabled),
      emailVerified: Boolean(user.emailVerified),
      createdAt: user.metadata.creationTime || '',
      lastSignInAt: user.metadata.lastSignInTime || '',
      role: roles[user.uid]?.role === 'admin' ? 'admin' : 'user'
    })),
    pageToken: result.pageToken || null
  };
});

exports.setUserRole = onCall(async request => {
  const actorUid = await requireAdmin(request);
  const targetUid = stringArg(request.data, 'uid');
  const role = String(request.data?.role || '').trim();
  if (!['user', 'admin'].includes(role)) throw new HttpsError('invalid-argument', 'บทบาทไม่ถูกต้อง');
  const user = await auth.getUser(targetUid);
  const roles = await getRoles();
  const previousRole = roles[targetUid]?.role === 'admin' ? 'admin' : 'user';
  if (previousRole === 'admin' && role === 'user') await assertCanRemoveAdmin(targetUid, 'ลดสิทธิ์');
  await db.ref(`roles/${targetUid}`).update({
    role,
    email: user.email || roles[targetUid]?.email || '',
    updatedAt: new Date().toISOString()
  });
  await writeAudit(actorUid, 'set_role', targetUid, { previousRole, role });
  return { uid: targetUid, role };
});

exports.setUserDisabled = onCall(async request => {
  const actorUid = await requireAdmin(request);
  const targetUid = stringArg(request.data, 'uid');
  const disabled = Boolean(request.data?.disabled);
  if (targetUid === actorUid && disabled) throw new HttpsError('failed-precondition', 'ไม่สามารถระงับบัญชีที่กำลังใช้งานอยู่ได้');
  if (disabled) await assertCanRemoveAdmin(targetUid, 'ระงับ');
  const user = await auth.updateUser(targetUid, { disabled });
  await writeAudit(actorUid, disabled ? 'disable_user' : 'enable_user', targetUid, { disabled });
  return { uid: user.uid, disabled: Boolean(user.disabled) };
});

exports.createPasswordResetLink = onCall(async request => {
  const actorUid = await requireAdmin(request);
  const targetUid = stringArg(request.data, 'uid');
  const user = await auth.getUser(targetUid);
  if (!user.email) throw new HttpsError('failed-precondition', 'บัญชีนี้ไม่มี email สำหรับส่งลิงก์รีเซ็ต');
  const link = await auth.generatePasswordResetLink(user.email);
  await writeAudit(actorUid, 'password_reset_link', targetUid, { email: user.email });
  return { uid: targetUid, email: user.email, link };
});

exports.deleteUser = onCall(async request => {
  const actorUid = await requireAdmin(request);
  const targetUid = stringArg(request.data, 'uid');
  if (targetUid === actorUid) throw new HttpsError('failed-precondition', 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้');
  await assertCanRemoveAdmin(targetUid, 'ลบ');
  const user = await auth.getUser(targetUid);
  await auth.deleteUser(targetUid);
  await db.ref(`roles/${targetUid}`).remove();
  await writeAudit(actorUid, 'delete_user', targetUid, { email: user.email || '' });
  return { uid: targetUid, deleted: true };
});
