import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'

// ไอคอน Material Design (mdi) — โหลด webfont ให้ v-icon ใช้งานได้
import '@mdi/font/css/materialdesignicons.css'

// ฟอนต์ไทย Sarabun แบบ self-host (skill §3.1) — โหลดเฉพาะน้ำหนักที่ใช้ (เบา = โหลดเร็ว)
import '@fontsource/sarabun/300.css'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/500.css'
import '@fontsource/sarabun/700.css'

// สไตล์รวมของแอป (ตั้งฟอนต์ไทย + ระยะบรรทัดสูงสำหรับไทย)
import './style.css'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(vuetify)
  .mount('#app')
