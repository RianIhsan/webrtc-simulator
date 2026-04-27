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
      'POST create session ke backend, simpan session_id, lalu siapkan state lokal untuk flow remote desktop.',
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
      'Buat RTCPeerConnection, daftarkan handler, lalu buka datachannel `control` untuk keyboard dan mouse.',
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
  ['Session', simulator.status.sessionStatus],
  ['Socket', simulator.status.socketStatus],
  ['Peer', simulator.status.peerStatus],
  ['Connection', simulator.status.connectionState],
  ['Signaling', simulator.status.signalingState],
  ['Control', simulator.status.controlChannelState],
  ['Stream', simulator.status.remoteStreamState],
])

const sessionFacts = computed(() => [
  ['Session ID', simulator.config.sessionId || '-'],
  ['Socket session', simulator.status.socketSessionId || '-'],
  ['Device ID', simulator.config.deviceId || '-'],
  ['Request ID', simulator.status.requestId || '-'],
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

const logLevelClass = (level) => `log-entry log-entry--${level}`
</script>

<template>
  <main class="simulator-page">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Frontend Remote Desktop Simulator</p>
        <h1>Web RTC Simulator</h1>
        <p class="hero-text">
          Flow-nya sudah disusun mengikuti PDF di folder <code>docs</code>: create session, connect websocket,
          signaling offer-answer-ICE, render remote stream, buka datachannel control, lalu kirim keyboard dan
          mouse event ke agent.
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
              <span>Access token</span>
              <input v-model="simulator.config.accessToken" placeholder="Bearer token" />
            </label>
            <label>
              <span>Device ID</span>
              <input v-model="simulator.config.deviceId" placeholder="device-001" />
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
              <button class="secondary-button" type="button" @click="simulator.applyStunOnlyPreset">
                Apply STUN only
              </button>
              <button class="primary-button" type="button" @click="simulator.applyTurnPreset">
                Apply STUN + TURN
              </button>
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
              <h2>Screen view + control surface</h2>
            </div>
            <div class="remote-flags">
              <span :class="['badge', simulator.controlReady ? 'badge--success' : 'badge--muted']">
                control {{ simulator.status.controlChannelState }}
              </span>
              <span :class="['badge', simulator.canInteract ? 'badge--success' : 'badge--warning']">
                {{ simulator.canInteract ? 'input enabled' : 'input disabled' }}
              </span>
            </div>
          </div>

          <div
            class="remote-stage"
            tabindex="0"
            @keydown.prevent="simulator.handleKeyboard('keyboard.key_down', $event)"
            @keyup.prevent="simulator.handleKeyboard('keyboard.key_up', $event)"
            @mousemove="simulator.handleMouseMove"
            @mousedown.prevent="simulator.handleMouseButton('mouse.down', $event)"
            @mouseup.prevent="simulator.handleMouseButton('mouse.up', $event)"
            @wheel.prevent="simulator.handleWheel"
          >
            <video
              :ref="simulator.setRemoteVideoElement"
              autoplay
              playsinline
              muted
              class="remote-video"
            />
            <div class="remote-overlay">
              <strong>{{ simulator.status.remoteStreamState === 'active' ? 'Live screen' : 'Waiting screen' }}</strong>
              <p>
                Focus area ini lalu gunakan keyboard, mouse move, click, dan wheel. Event hanya dikirim saat
                datachannel `control` sudah open dan session status sudah connected.
              </p>
            </div>
          </div>

          <div class="action-row">
            <button class="danger-button" type="button" @click="simulator.terminateSession('ws')">
              Terminate via WS
            </button>
            <button class="ghost-button" type="button" @click="simulator.terminateSession('both')">
              Force terminate WS + HTTP
            </button>
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
.remote-stage,
.toggle-item,
.textarea-field,
.config-grid label,
.turn-helper {
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
textarea:focus,
.remote-stage:focus {
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
.remote-overlay p,
.empty-state {
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

button:hover {
  transform: translateY(-1px);
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

.remote-panel {
  overflow: hidden;
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

.remote-stage {
  position: relative;
  min-height: 420px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(37, 29, 28, 0.92), rgba(12, 12, 16, 0.96)),
    radial-gradient(circle at center, rgba(110, 168, 254, 0.1), transparent 55%);
  outline: none;
}

.remote-video {
  width: 100%;
  min-height: 420px;
  object-fit: contain;
  display: block;
}

.remote-overlay {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 20px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(7, 7, 10, 0.54);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.remote-overlay strong {
  display: block;
  margin-bottom: 6px;
}

.facts-grid {
  display: grid;
  grid-template-columns: minmax(0, 140px) 1fr;
  gap: 10px 14px;
  padding: 16px;
  margin: 0;
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
  padding: 12px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.28);
  color: #ffd9a5;
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 0.82rem;
}

.hero-text code {
  display: inline;
  margin: 0;
  padding: 3px 8px;
}

.log-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.log-entry--success {
  border-color: rgba(99, 212, 169, 0.28);
}

.log-entry--error {
  border-color: rgba(255, 123, 123, 0.36);
}

.log-entry--warning {
  border-color: rgba(255, 209, 102, 0.36);
}

.empty-state {
  padding: 18px 0 4px;
}

@media (max-width: 1100px) {
  .hero-panel,
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .hero-copy h1 {
    max-width: none;
  }
}

@media (max-width: 760px) {
  .simulator-page {
    width: min(100% - 20px, 1420px);
    padding-top: 20px;
  }

  .hero-panel,
  .panel {
    padding: 18px;
    border-radius: 22px;
  }

  .config-grid,
  .steps-grid {
    grid-template-columns: 1fr;
  }

  .panel-heading,
  .log-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .remote-stage,
  .remote-video {
    min-height: 280px;
  }

  .facts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
