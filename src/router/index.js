import { createRouter, createWebHistory } from 'vue-router'
import TableView from '../views/TableView.vue'
import MenuView from '../views/MenuView.vue'
import CartView from '../views/CartView.vue'
import OrdersView from '../views/OrdersView.vue'
import KitchenView from '../views/KitchenView.vue'
import StaffView from '../views/StaffView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import DatabaseView from '../views/DatabaseView.vue'
import { ensureCustomerIdentity, currentUserRef } from '../auth'
import { useOrderStore } from '../stores/order'

const routes = [
  { path: '/', name: 'table', component: TableView, meta: { customer: true } },
  { path: '/menu', name: 'menu', component: MenuView, meta: { customer: true } },
  { path: '/cart', name: 'cart', component: CartView, meta: { customer: true } },
  { path: '/orders', name: 'orders', component: OrdersView, meta: { customer: true } },
  { path: '/kitchen', name: 'kitchen', component: KitchenView, meta: { requiresAuth: true, role: 'Kitchen' } },
  { path: '/staff', name: 'staff', component: StaffView, meta: { requiresAuth: true, role: 'Staff' } },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView, meta: { requiresAuth: true } },
  { path: '/database', name: 'database', component: DatabaseView, meta: { requiresAuth: true } },
  { path: '/tables', redirect: '/database' },
  { path: '/db', redirect: '/database' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  if (to.meta.customer) {
    try {
      await ensureCustomerIdentity()
    } catch (e) {
      console.error('ขอตัวตนของลูกค้าไม่สำเร็จ:', e.code || e.message)
    }
  }

  // ป้องกันหน้าพนักงาน/ครัว หากยังไม่เข้าสู่ระบบ
  if (to.meta.requiresAuth) {
    const user = currentUserRef.value
    if (!user || user.isAnonymous) {
      return { path: '/login', query: { next: to.fullPath } }
    }
  }

  // ลูกค้าต้องเลือกโต๊ะก่อนถึงจะสั่งอาหารได้ — ไม่อนุญาตให้ไปหน้าอื่นนอกจากเลือกโต๊ะ (/) และเข้าสู่ระบบ (/login)
  const user = currentUserRef.value
  const isStaff = !!(user && !user.isAnonymous && ['Staff', 'Kitchen', 'Admin'].includes(user.role))
  if (!isStaff && to.path !== '/' && to.path !== '/login') {
    const orderStore = useOrderStore()
    if (!orderStore.table) {
      return { path: '/' }
    }
  }

  return true
})

export default router
