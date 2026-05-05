<script setup>
import { computed } from 'vue'
import { useRemoteDesktopSimulator } from '../composables/useRemoteDesktopSimulator'

const simulator = useRemoteDesktopSimulator()

const stepCards = computed(() => [
  {
    id: 'create-session',
    title: 'Step 1',
    label: 'Create session',
    description:
      'POST create session WebRTC ke backend, simpan session_id, lalu validasi bahwa transport yang dikembalikan tetap webrtc.',
  },
  {
    id: 'connect-socket',
    title: 'Step 2',
    label: 'Connect WebSocket',
    description:
      'Hubungkan FE ke channel `/ws/remote-desktop`, lalu mulai dengarkan event accepted, signaling, failed, expired, dan terminated.',
  },
  {
    id: 'create-peer',
    title: 'Step 3',
    label: 'Setup peer + control channel',
    description:
      'Buat RTCPeerConnection, buka datachannel `control` dari frontend, lalu siapkan handler untuk keyboard dan mouse.',
  },
  {
    id: 'send-offer',
    title: 'Step 4',
    label: 'Create offer',
    description:
      'Generate SDP offer, kirim lewat WebSocket, lalu tunggu answer dan ICE candidate balik dari agent.',
  },
])

const statusItems = computed(() => [
  ['Lifecycle', simulator.sessionPhase],
  ['Socket', simulator.status.socketStatus],
  ['Peer', simulator.status.peerStatus],
  ['Connection', simulator.status.connectionState],
  ['Control', simulator.status.controlChannelState],
  ['Stream', simulator.status.remoteStreamState],
])

const sessionFacts = computed(() => [
  ['Session ID', simulator.config.sessionId || '-'],
  ['Transport', simulator.status.transportType || 'webrtc (requested)'],
  ['Socket session', simulator.status.socketSessionId || '-'],
  ['Device ID', simulator.config.deviceId || '-'],
  ['Request ID', simulator.status.requestId || '-'],
  ['Lifecycle', simulator.sessionPhase || '-'],
  ['Current Step', simulator.status.currentStep || '-'],
  ['Last signal', simulator.status.lastSignalType || '-'],
  ['Remote desc', simulator.status.hasRemoteDescription ? 'yes' : 'no'],
  ['Pending ICE', String(simulator.status.pendingRemoteIceCount ?? 0)],
  ['TURN relay used', simulator.status.turnRelayUsed ?? '-'],
  ['ICE mode', simulator.iceConfigSummary.mode],
  ['ICE servers', String(simulator.iceConfigSummary.serverCount ?? 0)],
  ['Last offer', simulator.status.latestOfferAt || '-'],
  ['Last answer', simulator.status.latestAnswerAt || '-'],
])

const selectedDeviceSummary = computed(() => {
  return simulator.devices.find((device) => device.id === simulator.config.deviceId) ?? null
})

const viewerFacts = computed(() => [
  ['Viewer status', simulator.viewerReady ? 'ready to open' : 'waiting transport'],
  ['Screen state', simulator.screenReady ? 'live' : simulator.status.remoteStreamState || 'standby'],
  ['Signal quality', simulator.stats.qualityLabel || '-'],
  ['FPS', simulator.stats.fps ?? '-'],
  ['Bitrate', simulator.stats.bitrateKbps ? `${simulator.stats.bitrateKbps} kbps` : '-'],
  ['RTT', simulator.stats.roundTripTimeMs ? `${simulator.stats.roundTripTimeMs} ms` : '-'],
  ['Resolution', simulator.stats.frameWidth && simulator.stats.frameHeight ? `${simulator.stats.frameWidth} x ${simulator.stats.frameHeight}` : '-'],
])

const viewerUrl = computed(() => {
  const url = new URL(window.location.href)
  url.searchParams.set('viewer', '1')
  if (simulator.config.sessionId) {
    url.searchParams.set('session_id', simulator.config.sessionId)
  }
  return url.toString()
})

const openViewerTab = () => {
  const viewerWindow = window.open(viewerUrl.value, '_blank', 'noopener=no,noreferrer=no')
  viewerWindow?.focus?.()
}

const logLevelClass = (level) => `log-entry log-entry--${level}`
</script>

<template>
  <main class="simulator-page">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Frontend Remote Desktop Simulator</p>
        <h1>Web RTC Simulator</h1>
        <p class="hero-text">
          Frontend ini hanya mensimulasikan flow WebRTC. Screen tidak langsung dirender di halaman ini; setelah media dan
          control siap, operator membuka viewer terpisah di tab baru untuk mode fullscreen dan monitoring kualitas koneksi.
        </p>
      </div>

      <div class="hero-status">
        <div class="hero-badge" v-for="[label, value] in statusItems" :key="label">
          <span>{{ label }}</span>
          <strong>{{ value }}</strong>
        </div>
      </div>
    </section>

    <section class="workspace-grid">
      <div class="left-column">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Configuration</p>
              <h2>Runtime setup</h2>
            </div>
            <button class="ghost-button" type="button" @click="simulator.loadSessionDetail">
              Refresh session
            </button>
          </div>

          <div class="config-grid">
            <label>
              <span>API Base URL</span>
              <input v-model="simulator.config.apiBaseUrl" placeholder="/api/v1" />
            </label>
            <label>
              <span>WebSocket path</span>
              <input v-model="simulator.config.wsPath" placeholder="/ws/remote-desktop" />
            </label>
            <label>
              <span>Login email</span>
              <input v-model="simulator.config.loginEmail" type="email" placeholder="superadmin@sentuh.id" />
            </label>
            <label>
              <span>Login password</span>
              <input v-model="simulator.config.loginPassword" type="password" placeholder="password login" />
            </label>
            <label>
              <span>Access token</span>
              <input v-model="simulator.config.accessToken" placeholder="Bearer token" />
            </label>
            <label>
              <span>Device</span>
              <select v-model="simulator.config.deviceId">
                <option value="">Pilih device</option>
                <option v-for="device in simulator.devices" :key="device.id" :value="device.id">
                  {{ device.name }} | {{ device.deviceType }} | {{ device.status }}
                </option>
              </select>
            </label>
            <label>
              <span>Session ID manual</span>
              <input v-model="simulator.config.sessionId" placeholder="opsional untuk reconnect" />
            </label>
            <label>
              <span>Timeout seconds</span>
              <input v-model="simulator.config.timeoutSeconds" type="number" min="30" step="30" />
            </label>
            <label>
              <span>Metadata source</span>
              <input v-model="simulator.config.metadataSource" />
            </label>
            <label>
              <span>Metadata page</span>
              <input v-model="simulator.config.metadataPage" />
            </label>
          </div>

          <div class="action-row">
            <button
              class="primary-button"
              type="button"
              :disabled="simulator.status.authState === 'loading'"
              @click="simulator.generateAccessToken"
            >
              {{ simulator.status.authState === 'loading' ? 'Generating token...' : 'Generate token' }}
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="!simulator.config.accessToken || simulator.status.devicesState === 'loading'"
              @click="simulator.loadDevices"
            >
              {{ simulator.status.devicesState === 'loading' ? 'Loading devices...' : 'Refresh devices' }}
            </button>
          </div>

          <div class="auth-summary">
            <span :class="['badge', simulator.status.authState === 'success' ? 'badge--success' : 'badge--muted']">
              auth {{ simulator.status.authState }}
            </span>
            <span :class="['badge', simulator.status.devicesState === 'success' ? 'badge--success' : 'badge--muted']">
              devices {{ simulator.status.devicesState }}
            </span>
            <span class="auth-summary__hint">
              {{ simulator.devices.length }} device loaded
            </span>
          </div>

          <div v-if="selectedDeviceSummary" class="device-summary">
            <strong>{{ selectedDeviceSummary.name }}</strong>
            <p>
              {{ selectedDeviceSummary.deviceType }} | status {{ selectedDeviceSummary.status }} | IP
              {{ selectedDeviceSummary.ipAddress }}
            </p>
            <p>
              Tenant {{ selectedDeviceSummary.tenantId }}<span v-if="selectedDeviceSummary.networkType">
                | {{ selectedDeviceSummary.networkType }}
              </span><span v-if="selectedDeviceSummary.signalStrengthPercent !== null">
                | signal {{ selectedDeviceSummary.signalStrengthPercent }}%
              </span>
            </p>
          </div>

          <label class="textarea-field">
            <span>ICE servers JSON</span>
            <textarea v-model="simulator.config.iceServersJson" rows="7" spellcheck="false" />
          </label>

          <div class="turn-helper">
            <div class="turn-helper__head">
              <div>
                <span class="turn-helper__label">TURN helper</span>
                <strong>Isi credential fresh lalu terapkan ke ICE config simulator.</strong>
              </div>
              <span class="turn-helper__badge">
                {{ simulator.iceConfigSummary.hasTurn ? 'TURN active' : 'TURN missing' }}
              </span>
            </div>

            <div class="config-grid">
              <label>
                <span>TURN username</span>
                <input v-model="simulator.config.turnUsername" placeholder="timestamp:operator-id" />
              </label>
              <label>
                <span>TURN credential</span>
                <input v-model="simulator.config.turnCredential" placeholder="credential fresh dari backend" />
              </label>
              <label>
                <span>TURN expires at</span>
                <input v-model="simulator.config.turnExpiresAt" placeholder="opsional, untuk catatan testing" />
              </label>
              <label>
                <span>TURN URLs JSON</span>
                <textarea v-model="simulator.config.turnUrlsJson" rows="4" spellcheck="false" />
              </label>
            </div>

            <div class="action-row">
              <button
                class="secondary-button"
                type="button"
                :disabled="!simulator.config.accessToken || simulator.status.turnState === 'loading'"
                @click="simulator.loadTurnCredentials"
              >
                {{ simulator.status.turnState === 'loading' ? 'Loading TURN...' : 'Fetch TURN credential' }}
              </button>
              <button class="secondary-button" type="button" @click="simulator.applyStunOnlyPreset">
                Apply STUN only
              </button>
              <button class="primary-button" type="button" @click="simulator.applyTurnPreset">
                Apply STUN + TURN
              </button>
            </div>

            <div class="auth-summary">
              <span :class="['badge', simulator.status.turnState === 'success' ? 'badge--success' : 'badge--muted']">
                turn {{ simulator.status.turnState }}
              </span>
              <span class="auth-summary__hint">
                {{ simulator.config.turnExpiresAt ? `expires ${simulator.config.turnExpiresAt}` : 'credential belum dimuat' }}
              </span>
            </div>
          </div>

          <div class="toggle-grid">
            <label class="toggle-item">
              <input v-model="simulator.config.autoConnectSocket" type="checkbox" />
              <span>Auto connect socket setelah create session</span>
            </label>
            <label class="toggle-item">
              <input v-model="simulator.config.autoCreatePeerOnAccept" type="checkbox" />
              <span>Auto buat peer saat event accepted datang</span>
            </label>
            <label class="toggle-item">
              <input v-model="simulator.config.autoCreatePeerAfterSocketOpen" type="checkbox" />
              <span>Auto buat peer setelah socket open</span>
            </label>
            <label class="toggle-item">
              <input v-model="simulator.config.autoCreateOfferOnPeerReady" type="checkbox" />
              <span>Auto kirim offer saat peer siap</span>
            </label>
            <label class="toggle-item">
              <input v-model="simulator.config.reconnectSocket" type="checkbox" />
              <span>Reconnect WebSocket ringan jika belum terminal</span>
            </label>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Guided flow</p>
              <h2>Step by step sesuai PDF</h2>
            </div>
          </div>

          <div class="steps-grid">
            <button
              v-for="step in stepCards"
              :key="step.id"
              class="step-card"
              type="button"
              @click="simulator.runStep(step.id)"
            >
              <span class="step-number">{{ step.title }}</span>
              <strong>{{ step.label }}</strong>
              <p>{{ step.description }}</p>
            </button>
          </div>

          <div class="action-row">
            <button class="primary-button" type="button" @click="simulator.createSession">
              Start from HTTP create session
            </button>
            <button class="secondary-button" type="button" @click="simulator.connectSocket">
              Connect socket only
            </button>
            <button class="secondary-button" type="button" @click="simulator.createAndSendOffer">
              Send offer now
            </button>
          </div>
        </article>

        <article class="panel remote-panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Remote screen</p>
              <h2>Viewer launcher</h2>
            </div>
            <div class="remote-flags">
              <span :class="['badge', simulator.controlReady ? 'badge--success' : 'badge--muted']">
                control {{ simulator.status.controlChannelState }}
              </span>
              <span :class="['badge', simulator.viewerReady ? 'badge--success' : 'badge--warning']">
                {{ simulator.viewerReady ? 'viewer ready' : 'waiting transport' }}
              </span>
            </div>
          </div>

          <div class="viewer-launchpad">
            <div class="viewer-launchpad__copy">
              <strong>
                {{ simulator.screenReady ? 'Screen siap ditampilkan' : simulator.viewerReady ? 'Viewer siap dibuka, menunggu frame pertama' : 'Screen belum siap ditampilkan' }}
              </strong>
              <p>
                Halaman ini hanya menjaga session WebRTC, WebSocket signaling, dan peer connection. Screen baru akan
                dirender ketika operator menekan tombol di bawah dan membuka viewer pada tab terpisah.
              </p>
            </div>

            <dl class="facts-grid facts-grid--compact">
              <template v-for="[label, value] in viewerFacts" :key="label">
                <dt>{{ label }}</dt>
                <dd>{{ value }}</dd>
              </template>
            </dl>

            <div class="action-row">
              <button
                class="primary-button"
                type="button"
                :disabled="!simulator.viewerReady"
                @click="openViewerTab"
              >
                Tampilkan screen di tab baru
              </button>
              <button class="danger-button" type="button" @click="simulator.terminateSession('ws')">
                Terminate via WS
              </button>
              <button class="ghost-button" type="button" @click="simulator.terminateSession('both')">
                Force terminate WS + HTTP
              </button>
            </div>
          </div>
        </article>
      </div>

      <div class="right-column">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Debug</p>
              <h2>Session facts</h2>
            </div>
          </div>

          <dl class="facts-grid">
            <template v-for="[label, value] in sessionFacts" :key="label">
              <dt>{{ label }}</dt>
              <dd>{{ value }}</dd>
            </template>
          </dl>

          <p v-if="simulator.status.lastError" class="error-banner">
            {{ simulator.status.lastError }}
          </p>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Socket events</p>
              <h2>Incoming event router</h2>
            </div>
          </div>

          <ul class="history-list">
            <li v-for="entry in simulator.eventHistory" :key="`${entry.at}-${entry.event}`">
              <strong>{{ entry.event }}</strong>
              <span>{{ entry.at }}</span>
              <code>{{ JSON.stringify(entry.data) }}</code>
            </li>
            <li v-if="simulator.eventHistory.length === 0" class="empty-state">
              Belum ada event masuk dari WebSocket.
            </li>
          </ul>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Transport log</p>
              <h2>HTTP, WS, dan datachannel</h2>
            </div>
          </div>

          <ul class="log-list">
            <li v-for="entry in simulator.logs" :key="entry.id" :class="logLevelClass(entry.level)">
              <div class="log-head">
                <strong>{{ entry.message }}</strong>
                <span>{{ entry.createdAt }}</span>
              </div>
              <code v-if="entry.detail !== null">{{ typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail) }}</code>
            </li>
            <li v-if="simulator.logs.length === 0" class="empty-state">
              Log masih kosong. Jalankan salah satu step untuk mulai tracing flow.
            </li>
          </ul>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.simulator-page {
  width: min(1420px, calc(100% - 32px));
  margin: 0 auto;
  padding: 40px 0 48px;
}

.hero-panel,
.panel {
  border: 1px solid var(--line);
  background: var(--panel);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow);
}

.hero-panel {
  display: grid;
  grid-template-columns: 1.4fr 0.9fr;
  gap: 28px;
  padding: 28px;
  border-radius: 28px;
  margin-bottom: 24px;
}

.eyebrow,
.panel-kicker {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.76rem;
  color: var(--accent);
}

.hero-copy h1,
.panel h2 {
  margin: 0;
  color: var(--text);
}

.hero-copy h1 {
  font-size: clamp(2.2rem, 4vw, 4.4rem);
  line-height: 0.98;
  max-width: 12ch;
}

.hero-text {
  max-width: 65ch;
  margin: 18px 0 0;
  color: var(--muted);
  font-size: 1rem;
}

.hero-status {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-self: end;
}

.hero-badge,
.step-card,
.facts-grid,
.history-list li,
.log-entry,
.toggle-item,
.textarea-field,
.config-grid label,
.turn-helper,
.viewer-launchpad {
  border: 1px solid var(--line);
  background: var(--panel-soft);
  border-radius: 20px;
}

.hero-badge {
  padding: 16px 18px;
}

.hero-badge span,
.facts-grid dt,
.history-list span,
.log-head span,
label span {
  color: var(--muted);
  font-size: 0.88rem;
}

.hero-badge strong {
  display: block;
  margin-top: 6px;
  font-size: 1.05rem;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
  gap: 24px;
}

.left-column,
.right-column {
  display: grid;
  gap: 24px;
  align-content: start;
}

.panel {
  border-radius: 28px;
  padding: 24px;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.config-grid label,
.textarea-field {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
}

.turn-helper {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.turn-helper__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.turn-helper__head strong {
  display: block;
  color: var(--text);
}

.turn-helper__label {
  display: block;
  margin-bottom: 6px;
  color: var(--accent);
  font-size: 0.76rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.turn-helper__badge {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 179, 71, 0.1);
  color: var(--text);
  font-size: 0.84rem;
  white-space: nowrap;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(7, 7, 10, 0.28);
  color: var(--text);
  padding: 12px 14px;
  outline: none;
}

input:focus,
select:focus,
textarea:focus {
  border-color: var(--line-strong);
  box-shadow: 0 0 0 3px rgba(255, 179, 71, 0.15);
}

textarea {
  resize: vertical;
  min-height: 150px;
}

.toggle-grid,
.steps-grid,
.action-row,
.remote-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  flex: 1 1 240px;
}

.toggle-item input {
  width: 18px;
  height: 18px;
  margin: 0;
}

.steps-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 18px;
}

.step-card {
  text-align: left;
  padding: 18px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.step-card:hover {
  transform: translateY(-2px);
  border-color: var(--line-strong);
  background: rgba(255, 179, 71, 0.08);
}

.step-card strong {
  display: block;
  margin: 6px 0 8px;
  font-size: 1.06rem;
}

.step-card p,
.empty-state,
.viewer-launchpad__copy p {
  margin: 0;
  color: var(--muted);
}

.step-number {
  color: var(--accent-cool);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
  transition:
    transform 180ms ease,
    opacity 180ms ease,
    background 180ms ease;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.primary-button {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: #1b1208;
  font-weight: 700;
}

.secondary-button,
.ghost-button {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.danger-button {
  background: rgba(255, 123, 123, 0.18);
  color: #ffd0d0;
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

.badge--warning {
  background: rgba(255, 209, 102, 0.16);
  color: #ffe6a0;
}

.badge--muted {
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
}

.auth-summary,
.device-summary {
  border: 1px solid var(--line);
  background: var(--panel-soft);
  border-radius: 18px;
}

.auth-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
  margin-top: 14px;
}

.auth-summary__hint {
  color: var(--muted);
  font-size: 0.88rem;
}

.device-summary {
  display: grid;
  gap: 6px;
  padding: 16px;
  margin-top: 14px;
}

.device-summary strong,
.device-summary p {
  margin: 0;
}

.device-summary p {
  color: var(--muted);
}

.remote-panel {
  overflow: hidden;
}

.viewer-launchpad {
  display: grid;
  gap: 18px;
  padding: 22px;
  background:
    linear-gradient(180deg, rgba(37, 29, 28, 0.92), rgba(12, 12, 16, 0.96)),
    radial-gradient(circle at center, rgba(110, 168, 254, 0.1), transparent 55%);
}

.viewer-launchpad__copy {
  display: grid;
  gap: 8px;
}

.viewer-launchpad__copy strong {
  font-size: 1.15rem;
}

.facts-grid {
  display: grid;
  grid-template-columns: minmax(0, 140px) 1fr;
  gap: 10px 14px;
  padding: 16px;
  margin: 0;
}

.facts-grid--compact {
  grid-template-columns: minmax(0, 150px) 1fr;
}

.facts-grid dt,
.facts-grid dd {
  margin: 0;
}

.facts-grid dd {
  word-break: break-word;
}

.error-banner {
  margin: 16px 0 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 123, 123, 0.14);
  color: #ffd0d0;
}

.history-list,
.log-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}

.history-list li,
.log-entry {
  padding: 14px 16px;
}

.history-list strong,
.log-head strong {
  display: block;
  margin-bottom: 6px;
}

.history-list code,
.log-entry code,
.hero-text code {
  display: block;
  margin-top: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.log-entry--error {
  border-color: rgba(255, 123, 123, 0.35);
}

.log-entry--success {
  border-color: rgba(99, 212, 169, 0.32);
}

@media (max-width: 1080px) {
  .hero-panel,
  .workspace-grid,
  .config-grid,
  .steps-grid {
    grid-template-columns: 1fr;
  }
}
</style>
