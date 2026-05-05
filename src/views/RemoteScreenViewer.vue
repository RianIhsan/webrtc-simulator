<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const stageRef = ref(null)
const videoRef = ref(null)
const bridgeMissing = ref(false)
const isFullscreen = ref(false)
const statsTimer = ref(null)
const status = reactive({
  sessionStatus: 'idle',
  socketStatus: 'idle',
  peerStatus: 'idle',
  connectionState: 'new',
  controlChannelState: 'idle',
  remoteStreamState: 'idle',
  currentStep: 'idle',
  lastError: '',
  screenReady: false,
  canInteract: false,
  sessionId: '',
  deviceId: '',
})
const stats = reactive({
  fps: null,
  bitrateKbps: null,
  packetsLost: null,
  jitterMs: null,
  roundTripTimeMs: null,
  availableOutgoingBitrateKbps: null,
  frameWidth: null,
  frameHeight: null,
  qualityLabel: 'offline',
  updatedAt: '',
})

const getBridge = () => {
  try {
    return window.opener?.__remoteDesktopSimulatorBridge ?? null
  } catch {
    return null
  }
}

const applySnapshot = () => {
  const bridge = getBridge()
  if (!bridge) {
    bridgeMissing.value = true
    return
  }

  Object.assign(status, bridge.getStatusSnapshot?.() ?? {})
  Object.assign(stats, bridge.getStatsSnapshot?.() ?? {})
  bridgeMissing.value = false
}

const attachViewer = () => {
  const bridge = getBridge()
  if (!bridge || !stageRef.value || !videoRef.value) {
    bridgeMissing.value = true
    return
  }

  bridge.attachViewerElements?.({
    stageElement: stageRef.value,
    videoElement: videoRef.value,
  })
  applySnapshot()
  stageRef.value.focus()
}

const detachViewer = () => {
  const bridge = getBridge()
  bridge?.detachViewerElements?.()
}

const toggleFullscreen = async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.()
    return
  }

  await document.exitFullscreen?.()
}

const syncFullscreen = () => {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

const forwardKeyboard = (type, event) => {
  const bridge = getBridge()
  bridge?.handleKeyboard?.(type, event)
}

const forwardMouseMove = (event) => {
  const bridge = getBridge()
  bridge?.handleMouseMove?.(event)
}

const forwardMouseButton = (type, event) => {
  const bridge = getBridge()
  bridge?.handleMouseButton?.(type, event)
}

const forwardWheel = (event) => {
  const bridge = getBridge()
  bridge?.handleWheel?.(event)
}

const closeTab = () => {
  window.close()
}

const qualityBadgeClass = computed(() => {
  if (stats.qualityLabel === 'strong') {
    return 'badge badge--success'
  }

  if (stats.qualityLabel === 'stable') {
    return 'badge badge--info'
  }

  if (stats.qualityLabel === 'warming up') {
    return 'badge badge--muted'
  }

  return 'badge badge--warning'
})

const metricCards = computed(() => [
  ['Quality', stats.qualityLabel || '-'],
  ['FPS', stats.fps ?? '-'],
  ['Bitrate', stats.bitrateKbps ? `${stats.bitrateKbps} kbps` : '-'],
  ['RTT', stats.roundTripTimeMs ? `${stats.roundTripTimeMs} ms` : '-'],
  ['Jitter', stats.jitterMs ? `${stats.jitterMs} ms` : '-'],
  ['Packets lost', stats.packetsLost ?? '-'],
  ['Resolution', stats.frameWidth && stats.frameHeight ? `${stats.frameWidth} x ${stats.frameHeight}` : '-'],
])

onMounted(() => {
  attachViewer()
  applySnapshot()
  statsTimer.value = window.setInterval(() => {
    applySnapshot()
  }, 1000)
  document.addEventListener('fullscreenchange', syncFullscreen)
})

onBeforeUnmount(() => {
  window.clearInterval(statsTimer.value)
  document.removeEventListener('fullscreenchange', syncFullscreen)
  detachViewer()
})
</script>

<template>
  <main class="viewer-page">
    <section class="viewer-shell">
      <header class="viewer-topbar">
        <div class="viewer-title">
          <p class="viewer-kicker">Remote Screen Viewer</p>
          <h1>{{ status.sessionId || 'Viewer' }}</h1>
          <p class="viewer-subtitle">
            Session {{ status.sessionStatus }} | connection {{ status.connectionState }} | control
            {{ status.controlChannelState }}
          </p>
        </div>

        <div class="viewer-actions">
          <span :class="qualityBadgeClass">{{ stats.qualityLabel || 'offline' }}</span>
          <button class="ghost-button" type="button" @click="toggleFullscreen">
            {{ isFullscreen ? 'Exit fullscreen' : 'Fullscreen' }}
          </button>
          <button class="ghost-button" type="button" @click="closeTab">
            Tutup tab
          </button>
        </div>
      </header>

      <div v-if="bridgeMissing" class="viewer-empty">
        <strong>Viewer perlu dibuka dari halaman simulator utama.</strong>
        <p>
          Tab ini tidak menemukan koneksi aktif di `window.opener`, jadi stream tidak bisa dipasang. Jalankan session dari
          halaman utama lalu buka viewer dari tombol `Tampilkan screen di tab baru`.
        </p>
      </div>

      <div v-else class="viewer-layout">
        <section
          ref="stageRef"
          class="viewer-stage"
          tabindex="0"
          @keydown.prevent="forwardKeyboard('keyboard.key_down', $event)"
          @keyup.prevent="forwardKeyboard('keyboard.key_up', $event)"
          @click="stageRef?.focus()"
          @contextmenu.prevent
        >
          <video
            ref="videoRef"
            autoplay
            playsinline
            muted
            :class="['viewer-video', status.canInteract ? 'viewer-video--interactive' : '']"
            @mousemove="forwardMouseMove"
            @click="stageRef?.focus()"
            @mousedown.prevent="forwardMouseButton('mouse.down', $event)"
            @mouseup.prevent="forwardMouseButton('mouse.up', $event)"
            @wheel.prevent="forwardWheel"
            @contextmenu.prevent
          />

          <div class="viewer-overlay">
            <strong>{{ status.screenReady ? 'Remote screen live' : 'Menunggu screen ready' }}</strong>
            <p>
              Gunakan keyboard, mouse, dan wheel langsung di area ini. Input tetap diproses oleh koneksi yang hidup di tab
              simulator utama.
            </p>
          </div>
        </section>

        <aside class="viewer-sidebar">
          <article class="metric-panel">
            <p class="viewer-kicker">Health</p>
            <h2>Realtime metrics</h2>

            <dl class="metric-grid">
              <template v-for="[label, value] in metricCards" :key="label">
                <dt>{{ label }}</dt>
                <dd>{{ value }}</dd>
              </template>
            </dl>
          </article>

          <article class="metric-panel">
            <p class="viewer-kicker">Session</p>
            <h2>Transport state</h2>

            <dl class="metric-grid">
              <dt>Socket</dt>
              <dd>{{ status.socketStatus }}</dd>
              <dt>Peer</dt>
              <dd>{{ status.peerStatus }}</dd>
              <dt>Step</dt>
              <dd>{{ status.currentStep }}</dd>
              <dt>Device</dt>
              <dd>{{ status.deviceId || '-' }}</dd>
              <dt>Updated</dt>
              <dd>{{ stats.updatedAt || '-' }}</dd>
            </dl>

            <p v-if="status.lastError" class="error-banner">
              {{ status.lastError }}
            </p>
          </article>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped>
.viewer-page {
  min-height: 100vh;
  padding: 18px;
}

.viewer-shell {
  min-height: calc(100vh - 36px);
  display: grid;
  gap: 18px;
  border: 1px solid var(--line);
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(255, 179, 71, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(22, 18, 20, 0.96), rgba(10, 10, 14, 0.98));
  box-shadow: var(--shadow);
  padding: 18px;
}

.viewer-topbar,
.metric-panel,
.viewer-empty {
  border: 1px solid var(--line);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.04);
}

.viewer-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
}

.viewer-title h1,
.metric-panel h2 {
  margin: 0;
}

.viewer-kicker {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.76rem;
  color: var(--accent);
}

.viewer-subtitle,
.viewer-empty p {
  margin: 8px 0 0;
  color: var(--muted);
}

.viewer-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.viewer-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 340px;
  gap: 18px;
  min-height: 0;
}

.viewer-stage {
  position: relative;
  min-height: 68vh;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(37, 29, 28, 0.92), rgba(12, 12, 16, 0.96)),
    radial-gradient(circle at center, rgba(110, 168, 254, 0.12), transparent 60%);
  outline: none;
}

.viewer-stage:focus {
  border-color: var(--line-strong);
  box-shadow: 0 0 0 3px rgba(255, 179, 71, 0.15);
}

.viewer-video {
  width: 100%;
  height: 100%;
  min-height: 68vh;
  object-fit: contain;
  display: block;
  background: #09090d;
}

.viewer-video--interactive {
  cursor: none;
}

.viewer-overlay {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(7, 7, 10, 0.56);
  border: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.viewer-overlay strong {
  display: block;
  margin-bottom: 6px;
}

.viewer-overlay p,
.metric-grid dt {
  color: var(--muted);
}

.viewer-sidebar {
  display: grid;
  gap: 18px;
  align-content: start;
}

.metric-panel {
  padding: 18px;
}

.metric-grid {
  display: grid;
  grid-template-columns: minmax(0, 110px) 1fr;
  gap: 10px 14px;
  margin: 16px 0 0;
}

.metric-grid dt,
.metric-grid dd {
  margin: 0;
}

.metric-grid dd {
  word-break: break-word;
}

.badge {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 0.84rem;
}

.badge--success {
  background: rgba(99, 212, 169, 0.14);
  color: #b8ffe0;
}

.badge--info {
  background: rgba(110, 168, 254, 0.14);
  color: #d5e6ff;
}

.badge--warning {
  background: rgba(255, 209, 102, 0.16);
  color: #ffe6a0;
}

.badge--muted {
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
}

.ghost-button {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.error-banner {
  margin: 16px 0 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 123, 123, 0.14);
  color: #ffd0d0;
}

.viewer-empty {
  padding: 22px;
}

@media (max-width: 1100px) {
  .viewer-layout {
    grid-template-columns: 1fr;
  }

  .viewer-topbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
