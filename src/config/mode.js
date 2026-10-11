import { ref } from 'vue'

// โหมดระบบ: Local SQLite (somchai.db) 100%
export const dbModeRef = ref('local')

export function isLocalMode() {
  return true
}
