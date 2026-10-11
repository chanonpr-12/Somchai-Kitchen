// ============================================================================
// auth.js — การยืนยันตัวตนพนักงานและประวัติการเข้าสู่ระบบ (Somchai.md 3NF)
// Local SQLite (database/somchai.db)
// ============================================================================
import { ref, computed } from 'vue'
import { localDb, getNextSerial } from './localDb'

const STORAGE_KEY = 'somchai_auth_user'

// ล้างค่าเดิมใน localStorage เพื่อป้องกันการจำข้ามแท็บ
try {
  localStorage.removeItem(STORAGE_KEY)
} catch {}

function loadSavedUser() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveUser(u) {
  try {
    if (u) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export const currentUserRef = ref(loadSavedUser())
export const currentRoleRef = ref(loadSavedUser()?.role || null)
export const authReadyRef = ref(true)

export const signInMethodRef = computed(() => {
  const user = currentUserRef.value
  if (!user) return null
  if (user.isAnonymous) return 'ลูกค้าหน้าร้าน'
  return `บัญชีพนักงาน (${user.username})`
})

// เข้าสู่ระบบด้วยบัญชีพนักงาน (employee_accounts)
export async function loginWithEmail(username, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (res.ok) {
      const userObj = await res.json()
      currentUserRef.value = userObj
      currentRoleRef.value = userObj.role
      saveUser(userObj)
      return userObj
    } else {
      const errJson = await res.json()
      throw new Error(errJson.error || 'ล็อกอินไม่สำเร็จ')
    }
  } catch (e) {
    if (e.message && e.message.includes('รหัสผ่านไม่ถูกต้อง')) throw e
    if (e.message && e.message.includes('ไม่พบบัญชี')) throw e
  }

  // Fallback: localDb
  const acc = (localDb.employee_accounts || []).find((a) => (a.employeeUserName ?? a.username) === username)
  if (!acc) throw new Error('ไม่พบบัญชีผู้ใช้นี้ในระบบ')
  if ((acc.employeePwd ?? acc.password_hash) !== password) throw new Error('รหัสผ่านไม่ถูกต้อง')

  const accUName = acc.employeeUserName ?? acc.username
  const accEmpId = acc.employeeID ?? acc.employee_id
  const emp = (localDb.employees || []).find((e) => (e.employeeID ?? e.employee_id) === accEmpId)
  const role = (localDb.roles || []).find((r) => (r.roleID ?? r.role_id) === (emp?.roleID ?? emp?.role_id))
  const roleName = role ? (role.roleName ?? role.role_name) : (username === 'kitchen' ? 'Kitchen' : 'Staff')

  const userObj = {
    uid: accUName,
    username: accUName,
    employeeId: accEmpId,
    displayName: `${emp?.employeeFName ?? emp?.first_name ?? ''} ${emp?.employeeLNAME ?? emp?.last_name ?? ''}`.trim() || accUName,
    role: roleName,
    dateRegis: acc.date_regis
  }

  const loginId = getNextSerial('login_history', 'loginID') || getNextSerial('login_history', 'login_id')
  localDb.login_history.push({
    loginID: loginId,
    login_id: loginId,
    loginTime: new Date().toISOString(),
    login_time: new Date().toISOString(),
    ipAddress: '127.0.0.1 (Local)',
    ip_address: '127.0.0.1 (Local)',
    employeeUserName: accUName,
    username: accUName
  })

  currentUserRef.value = userObj
  currentRoleRef.value = roleName
  saveUser(userObj)
  return userObj
}

export async function registerEmployee({ firstName, lastName, phone, role, username, password }) {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, phone, role, username, password })
    })
    if (res.ok) {
      return await res.json()
    } else {
      const errJson = await res.json()
      throw new Error(errJson.error || 'ลงทะเบียนไม่สำเร็จ')
    }
  } catch (e) {
    if (e.message && (e.message.includes('มีอยู่ในระบบแล้ว') || e.message.includes('กรุณากรอกข้อมูล'))) throw e
  }

  // Fallback: localDb
  const cleanUName = String(username).trim()
  const existing = (localDb.employee_accounts || []).find(
    (a) => (a.employeeUserName ?? a.username) === cleanUName
  )
  if (existing) throw new Error(`ชื่อผู้ใช้ '${cleanUName}' มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`)

  let roleId = 3
  let roleName = 'Staff'
  const normRole = String(role || '').toLowerCase()
  if (normRole === 'admin' || Number(role) === 1) {
    throw new Error('ไม่อนุญาตให้ลงทะเบียนตำแหน่งผู้ดูแลระบบ (Admin) ผ่านหน้าสมัครพนักงาน')
  }
  if (normRole === 'kitchen' || Number(role) === 2) {
    roleId = 2
    roleName = 'Kitchen'
  }

  const nextEmpId = getNextSerial('employees', 'employeeID') || getNextSerial('employees', 'employee_id')
  localDb.employees.push({
    employeeID: nextEmpId,
    employee_id: nextEmpId,
    employeeFName: firstName,
    first_name: firstName,
    employeeLNAME: lastName,
    last_name: lastName,
    phone: phone || '',
    roleID: roleId,
    role_id: roleId
  })

  const regisDate = new Date().toISOString()
  localDb.employee_accounts.push({
    employeeUserName: cleanUName,
    username: cleanUName,
    employeePwd: password,
    password_hash: password,
    employeeID: nextEmpId,
    employee_id: nextEmpId,
    date_regis: regisDate
  })

  return {
    ok: true,
    employeeId: nextEmpId,
    username: cleanUName,
    displayName: `${firstName} ${lastName}`.trim(),
    role: roleName,
    dateRegis: regisDate
  }
}

export async function registerWithEmail(username, password) {
  return await loginWithEmail(username, password)
}

export async function loginWithGoogle() {
  return await loginWithEmail('staff', '1234')
}

export async function readRole(uid) {
  return currentRoleRef.value || null
}

export async function ensureCustomerIdentity() {
  if (!currentUserRef.value) {
    currentUserRef.value = { uid: 'guest', isAnonymous: true }
  }
  return currentUserRef.value
}

export async function logout() {
  currentUserRef.value = null
  currentRoleRef.value = null
  saveUser(null)
}

export function authErrorMessage(e) {
  return e?.message || 'การยืนยันตัวตนล้มเหลว'
}

export function authDeniedMessage(e) {
  return e?.message || 'ไม่มีสิทธิ์เข้าถึง'
}
