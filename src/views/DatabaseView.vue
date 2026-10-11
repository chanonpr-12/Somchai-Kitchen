<script setup>
// ============================================================================
// DatabaseView.vue — 3NF Database Studio & Schema Visualizer
// ดูแลและแสดงผล 13 ตารางจริงจาก somchai.db (SQLite) พร้อมคู่มือเปิดใน DBeaver
// ============================================================================
import { ref, computed, onMounted, watch } from 'vue'
import {
  SCHEMA_METADATA,
  localDb,
  mutationLogs,
  resetLocalDatabase
} from '../localDb'
import { sendOrder } from '../api/orders'

const activeTab = ref('visualizer') // 'visualizer' | 'tables' | 'transactions' | 'queries'
const selectedTable = ref('orders')
const searchQuery = ref('')
const isTestingOrder = ref(false)
const sqliteLoading = ref(false)
const sqliteData = ref({})
const serverLogs = ref([])
const transactionsList = ref([])
const queriesList = ref([])
const queryFilter = ref('ALL')
const querySearch = ref('')
const expandedTx = ref([])
const queryViewMode = ref('presentation') // 'presentation' | 'technical'
const copiedId = ref(null)
const hideAllCode = ref(false)

const snackbar = ref(false)
const snackText = ref('')

function showSnack(text) {
  snackText.value = text
  snackbar.value = true
}

async function copySql(sql, id) {
  try {
    await navigator.clipboard.writeText(sql)
    copiedId.value = id
    showSnack('คัดลอกคำสั่ง SQL เรียบร้อยแล้ว')
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, 2000)
  } catch (e) {
    showSnack('ไม่สามารถคัดลอกได้')
  }
}

// สรุปสถิติภาพรวมสำหรับนำเสนออาจารย์
const queryStats = computed(() => {
  const list = queriesList.value || []
  const selectCount = list.filter((q) => q.type === 'SELECT').length
  const writeCount = list.filter((q) => ['INSERT', 'UPDATE', 'DELETE'].includes(q.type)).length
  const txCount = transactionsList.value.length
  const total = list.length
  const avgDuration = total > 0
    ? (list.reduce((acc, q) => acc + (Number(q.durationMs) || 0), 0) / total).toFixed(1)
    : 0
  return {
    total,
    selectCount,
    writeCount,
    txCount,
    avgDuration
  }
})

function getTransactionIcon(name) {
  switch (name) {
    case 'PLACE_ORDER': return 'mdi-food-fork-drink'
    case 'CHECKOUT': return 'mdi-cash-check'
    case 'REGISTER_EMPLOYEE': return 'mdi-account-plus'
    default: return 'mdi-swap-horizontal-bold'
  }
}

function getTransactionColor(name) {
  switch (name) {
    case 'PLACE_ORDER': return 'orange-darken-2'
    case 'CHECKOUT': return 'teal-darken-2'
    case 'REGISTER_EMPLOYEE': return 'indigo-darken-2'
    default: return 'deep-purple-darken-1'
  }
}

function getTransactionThaiCategory(name) {
  switch (name) {
    case 'PLACE_ORDER': return 'การสั่งอาหารที่โต๊ะ'
    case 'CHECKOUT': return 'การชำระเงินและปิดบิล'
    case 'REGISTER_EMPLOYEE': return 'การสมัครบัญชีพนักงานใหม่'
    default: return 'การทำงานแบบ Transaction (ACID)'
  }
}

const tablesMeta = SCHEMA_METADATA

// โหลดข้อมูลจาก SQLite somchai.db จริง
async function loadSqliteData() {
  sqliteLoading.value = true
  try {
    const [tblRes, logRes, txRes, qRes] = await Promise.all([
      fetch('/api/tables-data'),
      fetch('/api/logs'),
      fetch('/api/transactions'),
      fetch('/api/queries')
    ])

    if (tblRes.ok) sqliteData.value = await tblRes.json()
    if (logRes.ok) serverLogs.value = await logRes.json()
    if (txRes.ok) transactionsList.value = await txRes.json()
    if (qRes.ok) queriesList.value = await qRes.json()
  } catch (err) {
    console.warn('Could not fetch sqlite data:', err)
  } finally {
    sqliteLoading.value = false
  }
}

onMounted(() => {
  loadSqliteData()
})

watch(activeTab, (tab) => {
  if (tab === 'tables' || tab === 'transactions' || tab === 'queries') {
    loadSqliteData()
  }
})

// กลุ่มระบบย่อย (Subsystems)
const subsystems = computed(() => {
  const groups = {}
  for (const t of tablesMeta) {
    if (!groups[t.subsystem]) groups[t.subsystem] = []
    groups[t.subsystem].push(t)
  }
  return groups
})

// จำนวนแถวในแต่ละตาราง (จาก SQLite somchai.db เป็นหลัก)
const tableCounts = computed(() => {
  const counts = {}
  for (const t of tablesMeta) {
    counts[t.table] = sqliteData.value[t.table]
      ? sqliteData.value[t.table].length
      : (localDb[t.table] || []).length
  }
  return counts
})

// ข้อมูลตารางที่กำลังเลือกดู
const currentTableMeta = computed(() => {
  return tablesMeta.find((t) => t.table === selectedTable.value) || tablesMeta[0]
})

// ข้อมูลแถวที่จะนำมาแสดง
const currentTableRows = computed(() => {
  return sqliteData.value[selectedTable.value] || localDb[selectedTable.value] || []
})

// กรองแถวตามคำค้นหา
const filteredRows = computed(() => {
  const rows = currentTableRows.value
  if (!searchQuery.value.trim()) return rows
  const q = searchQuery.value.toLowerCase()
  return rows.filter((row) => {
    return Object.values(row).some((val) => String(val).toLowerCase().includes(q))
  })
})

// กรองคำสั่ง Queries
const filteredQueries = computed(() => {
  let list = queriesList.value
  if (queryFilter.value !== 'ALL') {
    list = list.filter((q) => q.type === queryFilter.value)
  }
  if (querySearch.value.trim()) {
    const q = querySearch.value.toLowerCase()
    list = list.filter((item) =>
      (item.sql && item.sql.toLowerCase().includes(q)) ||
      (item.summary && item.summary.toLowerCase().includes(q)) ||
      (item.table && item.table.toLowerCase().includes(q)) ||
      (item.transactionId && item.transactionId.toLowerCase().includes(q))
    )
  }
  return list
})

function selectTable(tName) {
  selectedTable.value = tName
  activeTab.value = 'tables'
  loadSqliteData()
}

// รีเซ็ตข้อมูลเริ่มต้น (SQLite somchai.db, localDb และประวัติ Log)
async function handleResetSeed() {
  if (confirm('คุณต้องการรีเซ็ตข้อมูลทั้ง 13 ตารางและประวัติ Log ใน somchai.db กลับเป็นค่าเริ่มต้นใช่หรือไม่?')) {
    try {
      await fetch('/api/reset', { method: 'POST' })
    } catch {}
    resetLocalDatabase()
    serverLogs.value = []
    mutationLogs.value = []
    await loadSqliteData()
    showSnack('รีเซ็ตฐานข้อมูล 13 ตารางและประวัติ Transaction/Log เรียบร้อย')
  }
}

// ล้างประวัติ Log และ Transaction
async function handleClearLogs() {
  if (confirm('คุณต้องการล้างประวัติ Queries และ Transactions ทั้งหมดใช่หรือไม่?')) {
    try {
      await fetch('/api/logs/clear', { method: 'POST' })
    } catch {}
    transactionsList.value = []
    queriesList.value = []
    serverLogs.value = []
    showSnack('ล้างประวัติเรียบร้อย')
  }
}

// ปุ่มทดสอบด่วน: สั่งอาหารทดสอบ 1 รายการเพื่อดูการเปลี่ยนแปลงตารางสด ๆ
async function handleQuickTestOrder() {
  isTestingOrder.value = true
  try {
    const res = await sendOrder({
      table: '1',
      items: [
        {
          id: 1,
          menuId: 1,
          name: 'ผัดกะเพราหมูสับไข่ดาว',
          unitPrice: 65,
          qty: 1,
          note: 'เผ็ดน้อย ทดสอบจาก DB Studio',
          toppings: [{ id: 1, option_id: 1, name: 'ไข่ดาว', price: 10 }]
        }
      ]
    })
    showSnack(`สร้าง Order #${res.no || res.order_id || 'ใหม่'} สำเร็จ! ทำงานใน 1 Transaction เรียบร้อย`)
    await loadSqliteData()
    activeTab.value = 'transactions'
  } catch (e) {
    showSnack(`สั่งอาหารทดสอบไม่สำเร็จ: ${e.message}`)
  } finally {
    isTestingOrder.value = false
  }
}

function getLogColor(type) {
  switch (type) {
    case 'SELECT': return 'info'
    case 'INSERT': return 'success'
    case 'UPDATE': return 'warning'
    case 'DELETE': return 'error'
    case 'BEGIN':
    case 'COMMIT': return 'deep-purple'
    case 'ROLLBACK': return 'error'
    default: return 'primary'
  }
}

function getTxStatusColor(status) {
  switch (status) {
    case 'COMMITTED': return 'success'
    case 'ROLLED_BACK': return 'error'
    case 'IN_PROGRESS': return 'warning'
    default: return 'grey'
  }
}

</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Header Card -->
    <v-card class="mb-4 border elevation-1 rounded-lg">
      <v-card-text class="d-flex flex-wrap align-center justify-space-between ga-3">
        <div>
          <div class="d-flex align-center ga-2">
            <v-icon color="primary" size="28">mdi-database-eye</v-icon>
            <h1 class="text-h5 font-weight-bold mb-0">3NF Database Studio</h1>
            <v-chip
              color="deep-purple"
              variant="flat"
              size="small"
              class="font-weight-bold"
            >
              Local SQLite (somchai.db)
            </v-chip>
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            ฐานข้อมูลจริง 13 ตารางตามหลัก 3NF เก็บใน <code>database/somchai.db</code>
          </div>
        </div>

        <!-- Tool Actions -->
        <div class="d-flex flex-wrap align-center ga-2">
          <!-- Quick Test Order Button -->
          <v-btn
            color="primary"
            variant="tonal"
            density="comfortable"
            prepend-icon="mdi-play-circle-outline"
            :loading="isTestingOrder"
            @click="handleQuickTestOrder"
          >
            ทดลองสั่งอาหาร (Test Live)
          </v-btn>

          <!-- Reset Seed Button -->
          <v-btn
            color="warning"
            variant="tonal"
            density="comfortable"
            prepend-icon="mdi-refresh"
            @click="handleResetSeed"
          >
            รีเซ็ตค่าเริ่มต้น
          </v-btn>
        </div>
      </v-card-text>

      <!-- Main Tabs -->
      <v-tabs v-model="activeTab" bg-color="surface" color="primary" density="comfortable" class="border-t">
        <v-tab value="visualizer" prepend-icon="mdi-graphql">
          Schema Visualizer (ผัง ER 3NF)
        </v-tab>
        <v-tab value="tables" prepend-icon="mdi-table-large">
          Data Browser (ตารางข้อมูล 13 ตาราง)
        </v-tab>
        <v-tab value="transactions" prepend-icon="mdi-swap-horizontal-bold">
          Transactions Inspector
          <v-badge
            :content="transactionsList.length"
            color="deep-purple"
            inline
            class="ms-1"
          />
        </v-tab>
        <v-tab value="queries" prepend-icon="mdi-database-search">
          All Queries Log
          <v-badge
            :content="filteredQueries.length"
            color="primary"
            inline
            class="ms-1"
          />
        </v-tab>
      </v-tabs>
    </v-card>

    <!-- ── TAB 1: Schema Visualizer ─────────────────────────────────────────── -->
    <v-window v-model="activeTab">
      <v-window-item value="visualizer">
        <div class="mb-4">
          <v-alert
            type="info"
            variant="tonal"
            density="compact"
            icon="mdi-information-outline"
            class="text-caption"
          >
            แผนผังเชิงสัมพันธ์จำลองโครงสร้าง Studio ตามหลัก 3NF แบ่งตาม 4 กลุ่มระบบย่อย
            คลิกที่ตารางใดก็ได้เพื่อเปิดดูข้อมูลแถวสดในไฟล์ <code>somchai.db</code>
          </v-alert>
        </div>

        <!-- Subsystems Grid -->
        <div v-for="(tables, subName) in subsystems" :key="subName" class="mb-6">
          <div class="d-flex align-center ga-2 mb-3">
            <v-icon color="secondary" size="20">mdi-folder-table</v-icon>
            <h2 class="text-subtitle-1 font-weight-bold mb-0 text-secondary">
              {{ subName }}
            </h2>
            <v-chip size="x-small" variant="outlined">{{ tables.length }} ตาราง</v-chip>
          </div>

          <v-row dense>
            <v-col
              v-for="tbl in tables"
              :key="tbl.table"
              cols="12"
              sm="6"
              md="4"
              lg="3"
            >
              <v-card
                class="border schema-card h-100 cursor-pointer elevation-hover"
                :class="{ 'border-primary': selectedTable === tbl.table }"
                @click="selectTable(tbl.table)"
              >
                <!-- Table Header -->
                <div class="pa-3 bg-surface-light border-b d-flex justify-space-between align-center">
                  <div>
                    <div class="font-weight-bold text-body-2 text-primary font-monospace">
                      <v-icon size="16" class="me-1">mdi-table</v-icon>
                      {{ tbl.table }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ tbl.thaiName }}
                    </div>
                  </div>
                  <v-chip size="x-small" color="primary" variant="flat">
                    {{ tableCounts[tbl.table] || 0 }} rows
                  </v-chip>
                </div>

                <!-- Columns List -->
                <v-list density="compact" class="py-1">
                  <v-list-item
                    v-for="col in tbl.columns"
                    :key="col.name"
                    class="px-3 py-1"
                  >
                    <template #prepend>
                      <span v-if="col.isPk" class="text-caption text-warning font-weight-bold me-1" title="Primary Key">(PK)</span>
                      <span v-else-if="col.isFk" class="text-caption text-info font-weight-bold me-1" title="Foreign Key">(FK)</span>
                    </template>

                    <v-list-item-title class="text-caption font-monospace font-weight-medium">
                      {{ col.name }}
                    </v-list-item-title>

                    <template #append>
                      <span class="text-caption text-disabled font-monospace">
                        {{ col.type }}
                      </span>
                    </template>
                  </v-list-item>
                </v-list>

                <!-- Footer / Target FK -->
                <div v-if="tbl.columns.some(c => c.isFk)" class="pa-2 bg-grey-lighten-4 border-t text-caption">
                  <div v-for="c in tbl.columns.filter(col => col.isFk)" :key="c.name" class="text-info font-weight-medium">
                    (FK) {{ c.name }} จากตาราง {{ c.fkTarget.split('.')[0] }}
                  </div>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-window-item>

      <!-- ── TAB 2: Data Browser ─────────────────────────────────────────────── -->
      <v-window-item value="tables">
        <v-row>
          <!-- Left Table Navigation List -->
          <v-col cols="12" md="3" lg="2">
            <v-card class="border">
              <v-card-title class="text-caption font-weight-bold text-uppercase pb-1 d-flex justify-space-between align-center">
                <span>รายชื่อ 13 ตาราง</span>
                <v-btn icon="mdi-refresh" size="x-small" variant="text" :loading="sqliteLoading" @click="loadSqliteData" />
              </v-card-title>
              <v-divider />
              <v-list density="compact" nav>
                <v-list-item
                  v-for="tbl in tablesMeta"
                  :key="tbl.table"
                  :active="selectedTable === tbl.table"
                  color="primary"
                  @click="selectTable(tbl.table)"
                >
                  <template #prepend>
                    <v-icon size="16" class="me-2">mdi-table</v-icon>
                  </template>
                  <v-list-item-title class="text-caption font-monospace">
                    {{ tbl.table }}
                  </v-list-item-title>
                  <template #append>
                    <v-chip size="x-small" density="comfortable" color="primary" variant="tonal">
                      {{ tableCounts[tbl.table] || 0 }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <!-- Right Data Table Content -->
          <v-col cols="12" md="9" lg="10">
            <v-card class="border">
              <!-- Table Meta Banner -->
              <v-card-item class="bg-surface-light border-b py-3">
                <div class="d-flex flex-wrap align-center justify-space-between ga-2">
                  <div>
                    <div class="d-flex align-center ga-2">
                      <span class="text-h6 font-weight-bold font-monospace text-primary">
                        {{ currentTableMeta.table }}
                      </span>
                      <span class="text-body-2 text-medium-emphasis">
                        ({{ currentTableMeta.thaiName }})
                      </span>
                      <v-chip size="small" variant="outlined" color="secondary">
                        {{ currentTableMeta.subsystem }}
                      </v-chip>
                      <v-chip size="small" color="deep-purple" variant="flat">
                        {{ tableCounts[currentTableMeta.table] || 0 }} แถวใน somchai.db
                      </v-chip>
                    </div>
                    <div class="text-caption text-medium-emphasis mt-1">
                      {{ currentTableMeta.description }}
                    </div>
                  </div>

                  <div class="d-flex align-center ga-2">
                    <v-text-field
                      v-model="searchQuery"
                      density="compact"
                      variant="outlined"
                      placeholder="ค้นหาข้อมูล..."
                      prepend-inner-icon="mdi-magnify"
                      hide-details
                      style="width: 220px;"
                    />
                    <v-btn
                      icon="mdi-refresh"
                      size="small"
                      variant="tonal"
                      color="primary"
                      :loading="sqliteLoading"
                      @click="loadSqliteData"
                    />
                  </div>
                </div>
              </v-card-item>

              <!-- Table Data View -->
              <v-card-text class="pa-0">
                <v-table density="compact" hover class="data-table">
                  <thead>
                    <tr class="bg-grey-lighten-4">
                      <th
                        v-for="col in currentTableMeta.columns"
                        :key="col.name"
                        class="text-caption font-weight-bold font-monospace text-no-wrap"
                      >
                        <span v-if="col.isPk" class="text-warning font-weight-bold">(PK) </span>
                        <span v-if="col.isFk" class="text-info font-weight-bold">(FK) </span>
                        {{ col.name }}
                        <span class="text-disabled font-weight-regular ms-1">({{ col.type }})</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in filteredRows" :key="idx">
                      <td
                        v-for="col in currentTableMeta.columns"
                        :key="col.name"
                        class="text-caption font-monospace"
                      >
                        <template v-if="typeof row[col.name] === 'boolean' || col.type === 'BOOLEAN'">
                          <v-chip size="x-small" :color="row[col.name] ? 'success' : 'grey'">
                            {{ row[col.name] ? 'TRUE' : 'FALSE' }}
                          </v-chip>
                        </template>
                        <template v-else-if="col.name.toLowerCase().includes('status')">
                          <v-chip size="x-small" color="primary" variant="outlined">
                            {{ row[col.name] }}
                          </v-chip>
                        </template>
                        <template v-else>
                          {{ row[col.name] ?? '-' }}
                        </template>
                      </td>
                    </tr>
                    <tr v-if="filteredRows.length === 0">
                      <td :colspan="currentTableMeta.columns.length" class="text-center py-6 text-medium-emphasis">
                        <v-icon size="32" color="disabled" class="d-block mb-1 mx-auto">mdi-database-off</v-icon>
                        ไม่มีข้อมูลในตาราง {{ currentTableMeta.table }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <!-- ── TAB 3: Transactions Inspector ─────────────────────────────────── -->
      <v-window-item value="transactions">
        <v-card class="border">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between py-3 border-b bg-surface-light ga-2">
            <div class="d-flex align-center ga-2">
              <v-icon color="deep-purple">mdi-swap-horizontal-bold</v-icon>
              <div>
                <span class="text-subtitle-1 font-weight-bold">Database Transactions (ACID)</span>
                <span class="text-caption text-medium-emphasis ms-2 d-none d-sm-inline">
                  (กลุ่มคำสั่ง SQL ที่ทำงานร่วมกันแบบ Transaction ใน somchai.db)
                </span>
              </div>
            </div>
            <div class="d-flex align-center ga-2">
              <v-btn
                size="small"
                variant="outlined"
                color="error"
                prepend-icon="mdi-delete-sweep-outline"
                @click="handleClearLogs"
              >
                ล้างประวัติ
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-refresh"
                :loading="sqliteLoading"
                @click="loadSqliteData"
              >
                รีเฟรช
              </v-btn>
            </div>
          </v-card-title>

          <!-- Executive Stats Strip -->
          <div class="pa-4 bg-surface-light border-b">
            <v-row dense>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="deep-purple" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">Transactions (ACID)</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.txCount }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="info" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">คำสั่งอ่าน (SELECT)</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.selectCount }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="success" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">คำสั่งเขียน (INSERT / UPDATE)</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.writeCount }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="warning" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">เวลาเฉลี่ยต่อคำสั่ง</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.avgDuration }} ms</div>
                </v-card>
              </v-col>
            </v-row>
          </div>

          <v-card-text class="pa-3 pa-md-4">
            <div v-if="transactionsList.length === 0" class="text-center py-10 text-medium-emphasis">
              <v-icon size="48" color="disabled" class="mb-2">mdi-swap-horizontal-circle-outline</v-icon>
              <div class="text-subtitle-1 font-weight-bold">ยังไม่มีประวัติ Transaction ที่บันทึก</div>
              <div class="text-caption mt-1 mb-4">กดปุ่ม "ทดลองสั่งอาหาร" ด้านล่าง เพื่อดูการทำงานของ Transaction แบบสดๆ ให้อาจารย์ดู</div>
              <v-btn color="primary" variant="flat" prepend-icon="mdi-play" :loading="isTestingOrder" @click="handleQuickTestOrder">
                ทดลองสั่งอาหาร 1 รายการ
              </v-btn>
            </div>

            <!-- Step-by-Step Flow Timeline Presentation -->
            <div v-else>
              <div class="d-flex justify-space-between align-center mb-3">
                <span class="text-caption font-weight-bold text-medium-emphasis">
                  บันทึกรอบ Transaction ล่าสุด ({{ transactionsList.length }} รอบ):
                </span>
                <v-btn
                  size="small"
                  variant="text"
                  :prepend-icon="hideAllCode ? 'mdi-code-braces' : 'mdi-code-tags-check'"
                  @click="hideAllCode = !hideAllCode"
                >
                  {{ hideAllCode ? 'แสดงกล่องโค้ด SQL ทุกขั้นตอน' : 'ซ่อนโค้ด SQL (ดูเฉพาะสรุปกระบวนการ)' }}
                </v-btn>
              </div>

              <v-card
                v-for="tx in transactionsList"
                :key="tx.id"
                variant="outlined"
                class="mb-4 border rounded-xl overflow-hidden shadow-sm"
              >
                <!-- Transaction Action Card Header -->
                <div class="pa-3 px-4 d-flex flex-wrap align-center justify-space-between bg-grey-lighten-4 border-b ga-2">
                  <div class="d-flex align-center ga-3">
                    <v-avatar :color="getTransactionColor(tx.name)" size="42" class="elevation-1">
                      <v-icon color="white" size="22">{{ getTransactionIcon(tx.name) }}</v-icon>
                    </v-avatar>
                    <div>
                      <div class="d-flex align-center ga-2 flex-wrap">
                        <span class="text-subtitle-1 font-weight-bold text-grey-darken-4">
                          {{ tx.title || tx.name }}
                        </span>
                        <v-chip size="x-small" :color="getTxStatusColor(tx.status)" variant="flat" class="font-weight-bold">
                          {{ tx.status === 'COMMITTED' ? 'สำเร็จ (COMMITTED)' : tx.status }}
                        </v-chip>
                        <span class="text-caption font-monospace font-weight-bold text-deep-purple">
                          [{{ tx.id }}]
                        </span>
                      </div>
                      <div class="text-caption text-medium-emphasis">
                        {{ getTransactionThaiCategory(tx.name) }} · รวม {{ tx.queries ? tx.queries.length : 0 }} คำสั่งใน 1 Transaction (ACID)
                      </div>
                    </div>
                  </div>
                  <div class="d-flex align-center ga-2 text-caption text-medium-emphasis font-monospace">
                    <v-chip size="x-small" variant="tonal" prepend-icon="mdi-timer-outline">
                      {{ tx.durationMs }} ms
                    </v-chip>
                    <span>{{ tx.time }}</span>
                  </div>
                </div>

                <!-- Timeline of Steps -->
                <div class="pa-4 bg-white">
                  <div
                    v-for="(q, qIdx) in (tx.queries || [])"
                    :key="q.id || qIdx"
                    class="step-item d-flex align-start ga-3 mb-4"
                  >
                    <!-- Step Number Bubble -->
                    <div class="step-badge-circle font-weight-bold text-caption" :class="'step-color-' + q.type">
                      {{ qIdx + 1 }}
                    </div>

                    <!-- Step Detail -->
                    <div class="flex-grow-1">
                      <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-1">
                        <div class="d-flex align-center ga-2">
                          <v-chip size="x-small" :color="getLogColor(q.type)" variant="flat" class="font-weight-bold">
                            {{ q.type }}
                          </v-chip>
                          <v-chip size="x-small" variant="tonal" color="primary" class="font-monospace font-weight-bold">
                            ตาราง {{ q.table }}
                          </v-chip>
                          <span class="text-caption text-disabled font-monospace">
                            {{ q.durationMs }} ms
                          </span>
                        </div>
                      </div>

                      <!-- Thai Explanation -->
                      <div class="text-body-2 font-weight-bold text-grey-darken-3 mb-2">
                        {{ q.summary }}
                      </div>

                      <!-- SQL Code Box with Copy Button -->
                      <div v-if="!hideAllCode" class="sql-box rounded-lg overflow-hidden border">
                        <div class="d-flex align-center justify-space-between px-3 py-1 bg-grey-darken-3 text-caption text-grey-lighten-2 border-b">
                          <span class="font-monospace text-caption">SQL Query #{{ qIdx + 1 }}</span>
                          <v-btn
                            size="x-small"
                            variant="text"
                            color="white"
                            :prepend-icon="copiedId === (q.id || qIdx) ? 'mdi-check' : 'mdi-content-copy'"
                            @click="copySql(q.sql, q.id || qIdx)"
                          >
                            {{ copiedId === (q.id || qIdx) ? 'คัดลอกแล้ว' : 'คัดลอก SQL' }}
                          </v-btn>
                        </div>
                        <div class="pa-3 bg-grey-darken-4 text-green-accent-3 font-monospace text-caption sql-code">
                          <pre class="ma-0 text-wrap">{{ q.sql }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Transaction Complete Banner -->
                  <div class="d-flex align-center ga-2 pa-2 px-3 bg-green-lighten-5 rounded-lg border border-success-subtle text-caption text-green-darken-3 font-weight-medium">
                    <v-icon color="success" size="18">mdi-check-circle</v-icon>
                    <span>
                      <strong>Transaction Atomicity:</strong> คำสั่งทั้งหมดถูกบันทึกสำเร็จพร้อมกันใน somchai.db หากเกิดข้อผิดพลาดจะ Rollback ข้อมูลกลับทันที ไม่ส่งผลกระทบต่อตารางอื่น
                    </span>
                  </div>
                </div>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </v-window-item>

      <!-- ── TAB 4: All Queries Log ─────────────────────────────────────────── -->
      <v-window-item value="queries">
        <v-card class="border">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between py-3 border-b bg-surface-light ga-2">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary">mdi-database-search</v-icon>
              <div>
                <span class="text-subtitle-1 font-weight-bold">SQL Queries Studio</span>
                <span class="text-caption text-medium-emphasis ms-2 d-none d-sm-inline">
                  (บันทึกทุกคำสั่ง SQL จากการใช้งานจริงใน somchai.db)
                </span>
              </div>
            </div>
            <div class="d-flex align-center ga-2">
              <v-btn
                size="small"
                variant="outlined"
                color="error"
                prepend-icon="mdi-delete-sweep-outline"
                @click="handleClearLogs"
              >
                ล้างประวัติ
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-refresh"
                :loading="sqliteLoading"
                @click="loadSqliteData"
              >
                รีเฟรช
              </v-btn>
            </div>
          </v-card-title>

          <!-- Executive Stats Strip -->
          <div class="pa-4 bg-surface-light border-b">
            <v-row dense>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="deep-purple" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">Transactions (ACID)</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.txCount }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="info" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">คำสั่งอ่าน (SELECT)</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.selectCount }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="success" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">คำสั่งเขียน (INSERT / UPDATE)</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.writeCount }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="warning" class="pa-3 rounded-lg text-center">
                  <div class="text-caption font-weight-bold text-medium-emphasis">เวลาเฉลี่ยต่อคำสั่ง</div>
                  <div class="text-h5 font-weight-bold mt-1">{{ queryStats.avgDuration }} ms</div>
                </v-card>
              </v-col>
            </v-row>
          </div>

          <!-- Mode Switcher Toolbar -->
          <div class="pa-3 border-b bg-grey-lighten-5 d-flex flex-wrap align-center justify-space-between ga-3">
            <div class="d-flex align-center ga-2 flex-wrap">
              <span class="text-caption font-weight-bold text-grey-darken-2">มุมมอง:</span>
              <v-btn-toggle
                v-model="queryViewMode"
                mandatory
                density="compact"
                color="primary"
                variant="flat"
                rounded="pill"
              >
                <v-btn value="presentation" prepend-icon="mdi-presentation" size="small" class="px-3 font-weight-bold">
                  โหมดนำเสนอ (Step-by-Step Flow)
                </v-btn>
                <v-btn value="technical" prepend-icon="mdi-code-braces" size="small" class="px-3 font-weight-bold">
                  โหมดโค้ด SQL เต็ม (Stream)
                </v-btn>
              </v-btn-toggle>
            </div>

            <div class="d-flex align-center ga-2 flex-wrap">
              <v-btn
                v-if="queryViewMode === 'presentation'"
                size="small"
                variant="text"
                :prepend-icon="hideAllCode ? 'mdi-code-braces' : 'mdi-code-tags-check'"
                @click="hideAllCode = !hideAllCode"
              >
                {{ hideAllCode ? 'แสดงกล่องโค้ด SQL ทุกขั้นตอน' : 'ซ่อนโค้ด SQL (ดูเฉพาะสรุปกระบวนการ)' }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-play"
                :loading="isTestingOrder"
                @click="handleQuickTestOrder"
              >
                ทดลองสั่งอาหาร (Demo Live)
              </v-btn>
            </div>
          </div>

          <!-- ── PRESENTATION VIEW MODE (Step-by-Step Flow) ── -->
          <v-card-text v-if="queryViewMode === 'presentation'" class="pa-3 pa-md-4">
            <div v-if="transactionsList.length === 0" class="text-center py-10 text-medium-emphasis">
              <v-icon size="48" color="disabled" class="mb-2">mdi-presentation</v-icon>
              <div class="text-subtitle-1 font-weight-bold">ยังไม่มีข้อมูลสำหรับนำเสนอ</div>
              <div class="text-caption mt-1 mb-4">กดปุ่ม "ทดลองสั่งอาหาร" เพื่อสร้าง Flow ขั้นตอนการทำงานให้อาจารย์ดูได้ทันที</div>
              <v-btn color="primary" variant="flat" prepend-icon="mdi-play" :loading="isTestingOrder" @click="handleQuickTestOrder">
                ทดลองสั่งอาหาร 1 รายการ
              </v-btn>
            </div>

            <div v-else>
              <v-card
                v-for="tx in transactionsList"
                :key="tx.id"
                variant="outlined"
                class="mb-4 border rounded-xl overflow-hidden shadow-sm"
              >
                <!-- Transaction Action Card Header -->
                <div class="pa-3 px-4 d-flex flex-wrap align-center justify-space-between bg-grey-lighten-4 border-b ga-2">
                  <div class="d-flex align-center ga-3">
                    <v-avatar :color="getTransactionColor(tx.name)" size="42" class="elevation-1">
                      <v-icon color="white" size="22">{{ getTransactionIcon(tx.name) }}</v-icon>
                    </v-avatar>
                    <div>
                      <div class="d-flex align-center ga-2 flex-wrap">
                        <span class="text-subtitle-1 font-weight-bold text-grey-darken-4">
                          {{ tx.title || tx.name }}
                        </span>
                        <v-chip size="x-small" :color="getTxStatusColor(tx.status)" variant="flat" class="font-weight-bold">
                          {{ tx.status === 'COMMITTED' ? 'สำเร็จ (COMMITTED)' : tx.status }}
                        </v-chip>
                        <span class="text-caption font-monospace font-weight-bold text-deep-purple">
                          [{{ tx.id }}]
                        </span>
                      </div>
                      <div class="text-caption text-medium-emphasis">
                        {{ getTransactionThaiCategory(tx.name) }} · รวม {{ tx.queries ? tx.queries.length : 0 }} คำสั่งใน 1 Transaction (ACID)
                      </div>
                    </div>
                  </div>
                  <div class="d-flex align-center ga-2 text-caption text-medium-emphasis font-monospace">
                    <v-chip size="x-small" variant="tonal" prepend-icon="mdi-timer-outline">
                      {{ tx.durationMs }} ms
                    </v-chip>
                    <span>{{ tx.time }}</span>
                  </div>
                </div>

                <!-- Timeline of Steps -->
                <div class="pa-4 bg-white">
                  <div
                    v-for="(q, qIdx) in (tx.queries || [])"
                    :key="q.id || qIdx"
                    class="step-item d-flex align-start ga-3 mb-4"
                  >
                    <!-- Step Number Bubble -->
                    <div class="step-badge-circle font-weight-bold text-caption" :class="'step-color-' + q.type">
                      {{ qIdx + 1 }}
                    </div>

                    <!-- Step Detail -->
                    <div class="flex-grow-1">
                      <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-1">
                        <div class="d-flex align-center ga-2">
                          <v-chip size="x-small" :color="getLogColor(q.type)" variant="flat" class="font-weight-bold">
                            {{ q.type }}
                          </v-chip>
                          <v-chip size="x-small" variant="tonal" color="primary" class="font-monospace font-weight-bold">
                            ตาราง {{ q.table }}
                          </v-chip>
                          <span class="text-caption text-disabled font-monospace">
                            {{ q.durationMs }} ms
                          </span>
                        </div>
                      </div>

                      <!-- Thai Explanation -->
                      <div class="text-body-2 font-weight-bold text-grey-darken-3 mb-2">
                        {{ q.summary }}
                      </div>

                      <!-- SQL Code Box with Copy Button -->
                      <div v-if="!hideAllCode" class="sql-box rounded-lg overflow-hidden border">
                        <div class="d-flex align-center justify-space-between px-3 py-1 bg-grey-darken-3 text-caption text-grey-lighten-2 border-b">
                          <span class="font-monospace text-caption">SQL Query #{{ qIdx + 1 }}</span>
                          <v-btn
                            size="x-small"
                            variant="text"
                            color="white"
                            :prepend-icon="copiedId === (q.id || qIdx) ? 'mdi-check' : 'mdi-content-copy'"
                            @click="copySql(q.sql, q.id || qIdx)"
                          >
                            {{ copiedId === (q.id || qIdx) ? 'คัดลอกแล้ว' : 'คัดลอก SQL' }}
                          </v-btn>
                        </div>
                        <div class="pa-3 bg-grey-darken-4 text-green-accent-3 font-monospace text-caption sql-code">
                          <pre class="ma-0 text-wrap">{{ q.sql }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Transaction Complete Banner -->
                  <div class="d-flex align-center ga-2 pa-2 px-3 bg-green-lighten-5 rounded-lg border border-success-subtle text-caption text-green-darken-3 font-weight-medium">
                    <v-icon color="success" size="18">mdi-check-circle</v-icon>
                    <span>
                      <strong>Transaction Atomicity:</strong> คำสั่งทั้งหมดถูกบันทึกสำเร็จพร้อมกันใน somchai.db หากเกิดข้อผิดพลาดจะ Rollback ข้อมูลกลับทันที ไม่ส่งผลกระทบต่อตารางอื่น
                    </span>
                  </div>
                </div>
              </v-card>
            </div>
          </v-card-text>

          <!-- ── TECHNICAL STREAM VIEW MODE (Full SQL Queries) ── -->
          <v-card-text v-else class="pa-3">
            <!-- Filter & Search Toolbar -->
            <div class="pa-3 mb-3 border rounded-lg bg-grey-lighten-5 d-flex flex-wrap align-center justify-space-between ga-2">
              <div class="d-flex flex-wrap align-center ga-1">
                <span class="text-caption font-weight-bold me-1">กรองประเภท:</span>
                <v-chip
                  size="small"
                  :variant="queryFilter === 'ALL' ? 'flat' : 'outlined'"
                  color="primary"
                  class="cursor-pointer"
                  @click="queryFilter = 'ALL'"
                >
                  ทั้งหมด ({{ queriesList.length }})
                </v-chip>
                <v-chip
                  size="small"
                  :variant="queryFilter === 'SELECT' ? 'flat' : 'outlined'"
                  color="info"
                  class="cursor-pointer"
                  @click="queryFilter = 'SELECT'"
                >
                  SELECT
                </v-chip>
                <v-chip
                  size="small"
                  :variant="queryFilter === 'INSERT' ? 'flat' : 'outlined'"
                  color="success"
                  class="cursor-pointer"
                  @click="queryFilter = 'INSERT'"
                >
                  INSERT
                </v-chip>
                <v-chip
                  size="small"
                  :variant="queryFilter === 'UPDATE' ? 'flat' : 'outlined'"
                  color="warning"
                  class="cursor-pointer"
                  @click="queryFilter = 'UPDATE'"
                >
                  UPDATE
                </v-chip>
                <v-chip
                  size="small"
                  :variant="queryFilter === 'DELETE' ? 'flat' : 'outlined'"
                  color="error"
                  class="cursor-pointer"
                  @click="queryFilter = 'DELETE'"
                >
                  DELETE
                </v-chip>
              </div>

              <v-text-field
                v-model="querySearch"
                density="compact"
                variant="outlined"
                placeholder="ค้นหาใน SQL / ตาราง / รหัส TX..."
                prepend-inner-icon="mdi-magnify"
                hide-details
                style="max-width: 280px;"
              />
            </div>

            <div v-if="filteredQueries.length === 0" class="text-center py-10 text-medium-emphasis">
              <v-icon size="40" color="disabled" class="mb-2">mdi-database-search</v-icon>
              <div>ไม่พบคำสั่ง SQL ที่ตรงกับเงื่อนไข</div>
            </div>

            <div v-else class="log-stream">
              <v-card
                v-for="q in filteredQueries"
                :key="q.id"
                variant="outlined"
                class="mb-3 border log-item rounded-lg overflow-hidden"
              >
                <div class="pa-2 px-3 bg-grey-lighten-4 d-flex align-center justify-space-between flex-wrap ga-2 border-b">
                  <div class="d-flex align-center ga-2 flex-wrap">
                    <v-chip size="x-small" :color="getLogColor(q.type)" class="font-weight-bold">
                      {{ q.type }}
                    </v-chip>
                    <span class="text-caption font-weight-bold text-primary font-monospace">
                      {{ q.table }}
                    </span>
                    <span v-if="q.transactionId" class="text-caption text-deep-purple font-weight-bold font-monospace">
                      [{{ q.transactionId }}]
                    </span>
                    <span class="text-caption text-grey-darken-3 font-weight-medium">
                      {{ q.summary }}
                    </span>
                  </div>
                  <div class="d-flex align-center ga-2 text-caption text-disabled font-monospace">
                    <span>{{ q.durationMs }} ms</span>
                    <span>·</span>
                    <span>{{ q.time }}</span>
                    <v-btn
                      size="x-small"
                      variant="text"
                      color="primary"
                      :prepend-icon="copiedId === q.id ? 'mdi-check' : 'mdi-content-copy'"
                      @click="copySql(q.sql, q.id)"
                    >
                      {{ copiedId === q.id ? 'คัดลอกแล้ว' : 'คัดลอก' }}
                    </v-btn>
                  </div>
                </div>
                <div class="pa-3 bg-grey-darken-4 text-green-accent-3 font-monospace text-caption sql-code">
                  <pre class="ma-0 text-wrap">{{ q.sql }}</pre>
                </div>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Snackbar แจ้งเตือน -->
    <v-snackbar v-model="snackbar" timeout="3000" color="primary">
      {{ snackText }}
      <template #actions>
        <v-btn color="white" variant="text" @click="snackbar = false">ปิด</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.font-monospace {
  font-family: 'Consolas', 'Courier New', monospace;
}
.schema-card {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.schema-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.sql-code {
  border-radius: 0 0 6px 6px;
  overflow-x: auto;
  line-height: 1.45;
  background-color: #1e1e24 !important;
}
.data-table th, .data-table td {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.step-badge-circle {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}
.step-color-SELECT {
  background-color: #1976d2;
}
.step-color-INSERT {
  background-color: #2e7d32;
}
.step-color-UPDATE {
  background-color: #ed6c02;
}
.step-color-DELETE {
  background-color: #d32f2f;
}
.step-color-BEGIN,
.step-color-COMMIT {
  background-color: #673ab7;
}
.step-color-ROLLBACK {
  background-color: #c2185b;
}
.sql-box {
  background-color: #1e1e24;
}
</style>
