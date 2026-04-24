import { computed, onBeforeUnmount, proxyRefs, reactive, ref, watch } from 'vue'

const TERMINAL_SESSION_STATUSES = new Set([
  'rejected',
  'failed',
  'terminated',
  'expired',
  'ended',
])

const SESSION_EVENT_TO_STATUS = {
  'remote.desktop.session.requested': 'requested',
  'remote.desktop.session.accepted': 'accepted',
  'remote.desktop.session.rejected': 'rejected',
  'remote.desktop.session.failed': 'failed',
  'remote.desktop.session.terminated': 'terminated',
  'remote.desktop.session.expired': 'expired',
}

function resolveEnvelope(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  return payload.data ?? payload
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function toIsoTime(date = new Date()) {
  return date.toISOString()
}

function normalizeSessionDescriptionSdp(sdp) {
  if (typeof sdp !== 'string') {
    return ''
  }

  const normalized = sdp.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
  return normalized.endsWith('\r\n') ? normalized : `${normalized}\r\n`
}

function createLogEntry(level, message, detail) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    message,
    detail,
    createdAt: toIsoTime(),
  }
}

function buildUrl(base, path) {
  if (!base) {
    return new URL(path, window.location.origin)
  }

  if (/^https?:\/\//i.test(base)) {
    const url = new URL(base)
    url.pathname = `${url.pathname.replace(/\/$/, '')}${path}`
    return url
  }

  return new URL(base.startsWith('/') ? `${base.replace(/\/$/, '')}${path}` : path, window.location.origin)
}

function buildSocketUrl(path, sessionId, token) {
  const isAbsolute = /^wss?:\/\//i.test(path)
  const origin = isAbsolute
    ? new URL(path)
    : new URL(path.startsWith('/') ? path : `/${path}`, window.location.origin)

  if (!isAbsolute) {
    origin.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  }

  origin.searchParams.set('session_id', sessionId)
  if (token) {
    origin.searchParams.set('token', token)
  }

  return origin.toString()
}

export function useRemoteDesktopSimulator() {
  const config = reactive({
    apiBaseUrl: 'http://152.42.216.177:8888/api/v1',
    wsPath: 'ws://152.42.216.177:8888/ws/remote-desktop',
    accessToken: '',
    deviceId: 'device-001',
    sessionId: '',
    timeoutSeconds: 120,
    metadataSource: 'web',
    metadataPage: 'device-detail',
    reconnectSocket: true,
    autoConnectSocket: true,
    autoCreatePeerOnAccept: true,
    autoCreatePeerAfterSocketOpen: true,
    autoCreateOfferOnPeerReady: true,
    iceServersJson: JSON.stringify([{ urls: 'stun:stun.l.google.com:19302' }], null, 2),
  })

  const status = reactive({
    currentStep: 'idle',
    sessionStatus: 'idle',
    socketStatus: 'idle',
    socketSessionId: '',
    peerStatus: 'idle',
    connectionState: 'new',
    signalingState: 'stable',
    iceGatheringState: 'new',
    controlChannelState: 'idle',
    requestState: 'idle',
    remoteStreamState: 'idle',
    hasRemoteDescription: false,
    pendingRemoteIceCount: 0,
    lastSignalType: '',
    turnRelayUsed: null,
    lastError: '',
    requestId: '',
    latestAnswerAt: '',
    latestOfferAt: '',
  })

  const session = ref(null)
  const logs = ref([])
  const remoteVideoElement = ref(null)
  const remoteStream = ref(null)
  const eventHistory = ref([])
  const socketRef = ref(null)
  const peerRef = ref(null)
  const controlChannelRef = ref(null)
  const reconnectTimer = ref(null)
  const lastMouseMoveSentAt = ref(0)
  const pendingRemoteIceCandidates = ref([])

  const addLog = (level, message, detail = null) => {
    logs.value = [createLogEntry(level, message, detail), ...logs.value].slice(0, 120)
  }

  const setError = (message, detail = null) => {
    status.lastError = message
    addLog('error', message, detail)
  }

  const clearError = () => {
    status.lastError = ''
  }

  const hasSession = computed(() => Boolean(config.sessionId))
  const isTerminal = computed(() => TERMINAL_SESSION_STATUSES.has(status.sessionStatus))
  const controlReady = computed(() => status.controlChannelState === 'open')
  const canInteract = computed(
    () => controlReady.value && status.sessionStatus === 'connected' && status.remoteStreamState === 'active',
  )

  watch(remoteVideoElement, (element) => {
    if (!element) {
      return
    }

    element.srcObject = remoteStream.value
    if (remoteStream.value) {
      element.play().catch(() => {})
    }
  })

  watch(remoteStream, (stream) => {
    if (!remoteVideoElement.value) {
      return
    }

    remoteVideoElement.value.srcObject = stream
    if (stream) {
      remoteVideoElement.value.play().catch(() => {})
    }
  })

  const syncSession = (payload) => {
    if (!payload) {
      return
    }

    const next = {
      ...(session.value ?? {}),
      ...payload,
    }

    session.value = next
    config.sessionId = next.session_id ?? next.sessionId ?? config.sessionId
    status.sessionStatus = next.status ?? status.sessionStatus
  }

  const parseIceServers = () => {
    const parsed = parseJson(config.iceServersJson, [])
    return Array.isArray(parsed) ? parsed : []
  }

  const syncRemoteDescriptionFlag = () => {
    status.hasRemoteDescription = Boolean(peerRef.value?.remoteDescription)
  }

  const updatePendingRemoteIceCount = () => {
    status.pendingRemoteIceCount = pendingRemoteIceCandidates.value.length
  }

  const queueRemoteIceCandidate = (candidate) => {
    pendingRemoteIceCandidates.value = [...pendingRemoteIceCandidates.value, candidate].slice(-40)
    updatePendingRemoteIceCount()
    addLog('warning', 'Remote ICE candidate disimpan dulu sampai answer terpasang.', {
      pendingCount: pendingRemoteIceCandidates.value.length,
      candidate,
    })
  }

  const flushPendingRemoteIceCandidates = async () => {
    if (!peerRef.value?.remoteDescription || pendingRemoteIceCandidates.value.length === 0) {
      return
    }

    const queuedCandidates = [...pendingRemoteIceCandidates.value]
    pendingRemoteIceCandidates.value = []
    updatePendingRemoteIceCount()
    addLog('info', 'Memproses remote ICE candidate yang sempat tertunda.', {
      count: queuedCandidates.length,
    })

    for (const candidate of queuedCandidates) {
      await handleIncomingIceCandidate(candidate)
    }
  }

  const resetSessionRuntimeState = ({ preserveSessionId = false } = {}) => {
    pendingRemoteIceCandidates.value = []
    updatePendingRemoteIceCount()
    status.hasRemoteDescription = false
    status.lastSignalType = ''
    status.latestOfferAt = ''
    status.latestAnswerAt = ''
    status.turnRelayUsed = null
    if (!preserveSessionId) {
      status.socketSessionId = ''
      config.sessionId = ''
      session.value = null
    }
  }

  const sendSocketEvent = (event, data) => {
    if (!socketRef.value || socketRef.value.readyState !== WebSocket.OPEN) {
      setError('WebSocket belum terhubung, event belum bisa dikirim.', { event, data })
      return false
    }

    socketRef.value.send(
      JSON.stringify({
        event,
        data,
      }),
    )
    addLog('out', `WS -> ${event}`, data)
    return true
  }

  const sendControlEvent = (payload) => {
    if (!controlChannelRef.value || controlChannelRef.value.readyState !== 'open') {
      return false
    }

    controlChannelRef.value.send(JSON.stringify(payload))
    addLog('control', `DC -> ${payload.type}`, payload)
    return true
  }

  const handleIncomingIceCandidate = async (candidate) => {
    if (!peerRef.value || !candidate) {
      return
    }

    if (!peerRef.value.remoteDescription) {
      queueRemoteIceCandidate(candidate)
      return
    }

    try {
      await peerRef.value.addIceCandidate(
        new RTCIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdp_mid ?? candidate.sdpMid,
          sdpMLineIndex: candidate.sdp_mline_index ?? candidate.sdpMLineIndex,
        }),
      )
      addLog('info', 'Remote ICE candidate berhasil ditambahkan.', candidate)
    } catch (error) {
      setError('Gagal menambahkan remote ICE candidate.', {
        message: error.message,
        candidate,
      })
    }
  }

  const handleIncomingAnswer = async (sdp) => {
    if (!peerRef.value || !sdp) {
      return
    }

    const peer = peerRef.value
    const normalizedSdp = normalizeSessionDescriptionSdp(sdp)
    const remoteDescription = peer.remoteDescription

    console.log('[remote-desktop] incoming answer SDP (raw):', sdp)
    console.log('[remote-desktop] incoming answer SDP (normalized):', normalizedSdp)
    console.log('[remote-desktop] incoming answer SDP meta (raw):', {
      length: sdp.length,
      hasTrailingCrlf: sdp.endsWith('\r\n'),
    })
    console.log('[remote-desktop] incoming answer SDP meta (normalized):', {
      length: normalizedSdp.length,
      hasTrailingCrlf: normalizedSdp.endsWith('\r\n'),
    })

    if (remoteDescription?.type === 'answer' && remoteDescription.sdp === normalizedSdp) {
      addLog('warning', 'Answer duplikat diterima, pemasangan ulang dilewati.')
      return
    }

    try {
      if (peer.signalingState !== 'have-local-offer') {
        addLog('warning', 'Answer datang saat peer belum siap menerima answer.', {
          signalingState: peer.signalingState,
          hasLocalDescription: Boolean(peer.localDescription),
          hasRemoteDescription: Boolean(peer.remoteDescription),
        })
      }

      if (normalizedSdp !== sdp) {
        addLog('info', 'SDP answer dinormalisasi sebelum dipasang ke peer connection.', {
          rawLength: sdp.length,
          normalizedLength: normalizedSdp.length,
          hadTrailingCrlf: sdp.endsWith('\r\n'),
        })
      }

      await peer.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: normalizedSdp,
        }),
      )
      status.latestAnswerAt = toIsoTime()
      status.currentStep = 'answer_received'
      syncRemoteDescriptionFlag()
      addLog('info', 'Remote answer berhasil dipasang ke peer connection.')
      await flushPendingRemoteIceCandidates()
    } catch (error) {
      setError('Gagal memasang remote answer.', {
        message: error.message,
        signalingState: peer.signalingState,
        localDescriptionType: peer.localDescription?.type ?? null,
        remoteDescriptionType: peer.remoteDescription?.type ?? null,
        sdpLength: typeof sdp === 'string' ? sdp.length : null,
        normalizedSdpLength: normalizedSdp.length,
        hadTrailingCrlf: typeof sdp === 'string' ? sdp.endsWith('\r\n') : null,
      })
    }
  }

  const updatePeerState = () => {
    const peer = peerRef.value
    if (!peer) {
      return
    }

    status.connectionState = peer.connectionState
    status.signalingState = peer.signalingState
    status.iceGatheringState = peer.iceGatheringState
    syncRemoteDescriptionFlag()
  }

  const attachDataChannel = (channel) => {
    if (!channel) {
      return
    }

    controlChannelRef.value = channel
    status.controlChannelState = channel.readyState

    channel.onopen = () => {
      status.controlChannelState = channel.readyState
      addLog('success', 'Datachannel control terbuka.')
      sendControlEvent({
        type: 'control.ready',
        timestamp: Date.now(),
      })
    }

    channel.onclose = () => {
      status.controlChannelState = channel.readyState
      addLog('warning', 'Datachannel control tertutup.')
    }

    channel.onerror = (event) => {
      status.controlChannelState = channel.readyState
      setError('Datachannel control error.', event)
    }

    channel.onmessage = (event) => {
      addLog('in', 'DC <- message', event.data)
    }
  }

  const createPeerConnection = async () => {
    if (peerRef.value) {
      addLog('info', 'Peer connection sudah ada, setup dilewati.')
      return peerRef.value
    }

    clearError()
    status.peerStatus = 'creating'
    status.currentStep = 'creating_peer'

    try {
      const peer = new RTCPeerConnection({
        iceServers: parseIceServers(),
      })

      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          addLog('info', 'ICE gathering selesai.')
          return
        }

        sendSocketEvent('remote_signaling.ice_candidate', {
          session_id: config.sessionId,
          device_id: config.deviceId,
          candidate: {
            candidate: event.candidate.candidate,
            sdp_mid: event.candidate.sdpMid,
            sdp_mline_index: event.candidate.sdpMLineIndex,
          },
        })
      }

      peer.ontrack = (event) => {
        remoteStream.value = event.streams[0] ?? new MediaStream([event.track])
        status.remoteStreamState = 'active'
        status.currentStep = 'screen_live'
        addLog('success', 'Remote track diterima dan dirender ke video.', {
          kind: event.track.kind,
          streamId: remoteStream.value?.id,
        })
      }

      peer.onconnectionstatechange = () => {
        updatePeerState()
        addLog('info', `Peer connection state -> ${peer.connectionState}`)
        if (peer.connectionState === 'connected') {
          status.sessionStatus = 'connected'
        }
      }

      peer.onsignalingstatechange = () => {
        updatePeerState()
        addLog('info', `Signaling state -> ${peer.signalingState}`)
      }

      peer.onicegatheringstatechange = () => {
        updatePeerState()
      }

      peer.ondatachannel = (event) => {
        addLog('info', `Remote datachannel diterima: ${event.channel.label}`)
        attachDataChannel(event.channel)
      }

      attachDataChannel(
        peer.createDataChannel('control', {
          ordered: true,
        }),
      )

      peerRef.value = peer
      updatePeerState()
      status.peerStatus = 'ready'
      addLog('success', 'Peer connection berhasil dibuat.')

      if (config.autoCreateOfferOnPeerReady) {
        await createAndSendOffer()
      }

      return peer
    } catch (error) {
      status.peerStatus = 'failed'
      setError('Gagal membuat RTCPeerConnection.', { message: error.message })
      return null
    }
  }

  const createAndSendOffer = async () => {
    clearError()

    if (!peerRef.value) {
      await createPeerConnection()
    }

    if (!peerRef.value) {
      return
    }

    try {
      status.currentStep = 'creating_offer'
      const offer = await peerRef.value.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true,
      })

      await peerRef.value.setLocalDescription(offer)
      status.latestOfferAt = toIsoTime()
      addLog('success', 'Offer berhasil dibuat.', offer.sdp)
      console.log('[remote-desktop] local offer SDP:', offer.sdp)
      console.log('[remote-desktop] localDescription SDP:', peerRef.value.localDescription?.sdp ?? null)
      console.log('[remote-desktop] local offer SDP meta:', {
        length: offer.sdp?.length ?? 0,
        hasTrailingCrlf: offer.sdp?.endsWith('\r\n') ?? false,
      })
      console.log('[remote-desktop] localDescription SDP meta:', {
        length: peerRef.value.localDescription?.sdp?.length ?? 0,
        hasTrailingCrlf: peerRef.value.localDescription?.sdp?.endsWith('\r\n') ?? false,
      })

      sendSocketEvent('remote_signaling.offer', {
        session_id: config.sessionId,
        device_id: config.deviceId,
        sdp: offer.sdp,
      })

      status.currentStep = 'offer_sent'
    } catch (error) {
      setError('Gagal membuat atau mengirim offer.', { message: error.message })
    }
  }

  const routeSocketEvent = async (payload) => {
    const eventName = payload?.event
    const data = payload?.data ?? {}
    if (!eventName) {
      return
    }

    eventHistory.value = [{ event: eventName, data, at: toIsoTime() }, ...eventHistory.value].slice(0, 80)
    addLog('in', `WS <- ${eventName}`, data)
    status.lastSignalType = data.signal_type ?? eventName

    if (SESSION_EVENT_TO_STATUS[eventName]) {
      status.sessionStatus = SESSION_EVENT_TO_STATUS[eventName]
    }

    if (eventName === 'remote.desktop.session.accepted') {
      syncSession({ ...data, status: 'accepted' })
      status.currentStep = 'session_accepted'
      if (config.autoCreatePeerOnAccept) {
        await createPeerConnection()
      }
      return
    }

    if (eventName === 'remote.desktop.signaling.message') {
      if (data.signal_type === 'answer') {
        await handleIncomingAnswer(data.sdp)
      }

      if (data.signal_type === 'ice_candidate') {
        await handleIncomingIceCandidate(data.candidate)
      }
      return
    }

    if (eventName === 'remote.desktop.session.connection_state') {
      status.sessionStatus = data.status ?? status.sessionStatus
      status.connectionState = data.connection_state ?? status.connectionState
      status.signalingState = data.signaling_state ?? status.signalingState
      status.turnRelayUsed = data.turn_relay_used ?? status.turnRelayUsed
      return
    }

    if (eventName === 'remote.desktop.session.requested') {
      syncSession({ ...data, status: 'requested' })
      return
    }

    if (eventName === 'remote.desktop.session.rejected' || eventName === 'remote.desktop.session.failed') {
      setError(data.reason ?? `Session berakhir dengan status ${status.sessionStatus}.`, data)
      cleanupPeerConnection()
      return
    }

    if (eventName === 'remote.desktop.session.terminated' || eventName === 'remote.desktop.session.expired') {
      cleanupPeerConnection()
    }
  }

  const cleanupSocket = (options = {}) => {
    window.clearTimeout(reconnectTimer.value)
    reconnectTimer.value = null

    const socket = socketRef.value
    socketRef.value = null

    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(options.code ?? 1000, options.reason ?? 'cleanup')
      }
    }

    status.socketStatus = 'closed'
    status.socketSessionId = ''
  }

  const cleanupPeerConnection = () => {
    if (controlChannelRef.value) {
      controlChannelRef.value.onopen = null
      controlChannelRef.value.onclose = null
      controlChannelRef.value.onerror = null
      controlChannelRef.value.onmessage = null
      if (controlChannelRef.value.readyState === 'open') {
        controlChannelRef.value.close()
      }
      controlChannelRef.value = null
    }

    if (peerRef.value) {
      peerRef.value.onicecandidate = null
      peerRef.value.ontrack = null
      peerRef.value.onconnectionstatechange = null
      peerRef.value.onsignalingstatechange = null
      peerRef.value.ondatachannel = null
      peerRef.value.close()
      peerRef.value = null
    }

    status.peerStatus = 'idle'
    status.connectionState = 'closed'
    status.signalingState = 'closed'
    status.iceGatheringState = 'complete'
    status.controlChannelState = 'closed'
    status.remoteStreamState = remoteStream.value ? 'paused' : 'idle'
    syncRemoteDescriptionFlag()
    pendingRemoteIceCandidates.value = []
    updatePendingRemoteIceCount()

    if (remoteStream.value) {
      remoteStream.value.getTracks().forEach((track) => track.stop())
      remoteStream.value = null
    }
  }

  const cleanupAll = () => {
    cleanupPeerConnection()
    cleanupSocket()
  }

  const connectSocket = () => {
    clearError()
    if (!config.sessionId) {
      setError('Session ID belum ada. Buat session atau isi session ID manual dulu.')
      return
    }

    cleanupSocket()

    status.socketStatus = 'connecting'
    status.currentStep = 'connecting_socket'

    const socketUrl = buildSocketUrl(config.wsPath, config.sessionId, config.accessToken)
    const socket = new WebSocket(socketUrl)
    const targetSessionId = config.sessionId
    socketRef.value = socket
    status.socketSessionId = targetSessionId
    addLog('info', 'Mencoba connect WebSocket remote desktop.', {
      socketUrl,
      sessionId: targetSessionId,
    })

    socket.onopen = () => {
      status.socketStatus = 'open'
      status.currentStep = 'socket_connected'
      addLog('success', 'WebSocket remote desktop terhubung.', {
        sessionId: targetSessionId,
      })

      if (config.autoCreatePeerAfterSocketOpen && !peerRef.value) {
        addLog(
          'info',
          'Melanjutkan setup peer setelah socket open. Ini jadi fallback kalau event accepted belum datang.',
          { sessionId: targetSessionId },
        )
        createPeerConnection()
      }
    }

    socket.onmessage = async (event) => {
      const payload = parseJson(event.data, null)
      if (!payload) {
        addLog('warning', 'Pesan WebSocket tidak valid JSON.', event.data)
        return
      }

      await routeSocketEvent(payload)
    }

    socket.onerror = (event) => {
      setError('WebSocket mengalami error.', {
        sessionId: targetSessionId,
        event,
      })
    }

    socket.onclose = (event) => {
      status.socketStatus = 'closed'
      addLog('warning', 'WebSocket tertutup.', {
        code: event.code,
        reason: event.reason,
        sessionId: targetSessionId,
      })
      if (socketRef.value === socket) {
        status.socketSessionId = ''
      }

      if (config.reconnectSocket && !isTerminal.value) {
        addLog('info', 'Menjadwalkan reconnect WebSocket.', {
          sessionId: targetSessionId,
          delayMs: 1500,
        })
        reconnectTimer.value = window.setTimeout(() => {
          connectSocket()
        }, 1500)
      }
    }
  }

  const createSession = async () => {
    clearError()
    cleanupAll()
    resetSessionRuntimeState()
    eventHistory.value = []
    status.requestState = 'loading'
    status.currentStep = 'creating_session'

    try {
      const url = buildUrl(config.apiBaseUrl, `/devices/${config.deviceId}/remote-desktop/sessions/`)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
        },
        body: JSON.stringify({
          timeout_seconds: Number(config.timeoutSeconds),
          metadata: {
            source: config.metadataSource,
            page: config.metadataPage,
          },
        }),
      })

      const payload = await response.json().catch(() => ({}))
      status.requestId = payload?.request_id ?? ''

      if (!response.ok) {
        const message =
          response.status === 409
            ? 'Device sedang dipakai operator lain.'
            : response.status === 403
              ? 'Kamu tidak punya akses ke device ini.'
              : response.status === 401
                ? 'Token tidak valid atau sudah expired.'
                : payload?.message ?? 'Gagal membuat session remote desktop.'

        throw new Error(message)
      }

      const data = resolveEnvelope(payload)
      syncSession(data)
      status.requestState = 'success'
      status.sessionStatus = data.status ?? 'requested'
      status.currentStep = 'session_created'
      addLog('success', 'Session remote desktop berhasil dibuat.', data)

      if (config.autoConnectSocket) {
        connectSocket()
      }
    } catch (error) {
      status.requestState = 'error'
      setError(error.message, { requestId: status.requestId })
    }
  }

  const loadSessionDetail = async () => {
    clearError()
    if (!config.sessionId) {
      setError('Isi session ID dulu untuk ambil detail session.')
      return
    }

    status.requestState = 'loading'

    try {
      const url = buildUrl(
        config.apiBaseUrl,
        `/devices/${config.deviceId}/remote-desktop/sessions/${config.sessionId}`,
      )
      const response = await fetch(url, {
        headers: {
          ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
        },
      })
      const payload = await response.json().catch(() => ({}))
      status.requestId = payload?.request_id ?? ''

      if (!response.ok) {
        throw new Error(payload?.message ?? 'Gagal mengambil detail session.')
      }

      const data = resolveEnvelope(payload)
      syncSession(data)
      status.requestState = 'success'
      addLog('success', 'Detail session berhasil di-refresh.', data)
    } catch (error) {
      status.requestState = 'error'
      setError(error.message, { requestId: status.requestId })
    }
  }

  const terminateSession = async (mode = 'ws') => {
    clearError()
    const reason = 'terminated by operator'

    if (!config.sessionId) {
      setError('Session ID belum tersedia untuk terminate.')
      return
    }

    if (mode === 'ws') {
      sendSocketEvent('remote_session.terminate', {
        session_id: config.sessionId,
        device_id: config.deviceId,
        reason,
      })
    }

    if (mode === 'http' || mode === 'both') {
      try {
        const url = buildUrl(
          config.apiBaseUrl,
          `/devices/${config.deviceId}/remote-desktop/sessions/${config.sessionId}/terminate`,
        )
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
          },
          body: JSON.stringify({ reason }),
        })
        const payload = await response.json().catch(() => ({}))
        status.requestId = payload?.request_id ?? ''

        if (!response.ok) {
          throw new Error(payload?.message ?? 'Gagal terminate session lewat HTTP.')
        }

        addLog('success', 'Terminate session via HTTP berhasil.', payload)
      } catch (error) {
        setError(error.message, { requestId: status.requestId })
      }
    }

    status.sessionStatus = 'terminated'
    cleanupPeerConnection()
    cleanupSocket({ reason: 'session-terminated' })
    resetSessionRuntimeState({ preserveSessionId: true })
  }

  const normalizedCoordinates = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width
    const y = rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height

    return {
      x: Number(Math.min(1, Math.max(0, x)).toFixed(4)),
      y: Number(Math.min(1, Math.max(0, y)).toFixed(4)),
    }
  }

  const handleKeyboard = (type, event) => {
    if (!canInteract.value) {
      return
    }

    sendControlEvent({
      type,
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      timestamp: Date.now(),
    })
  }

  const handleMouseMove = (event) => {
    if (!canInteract.value) {
      return
    }

    const now = Date.now()
    if (now - lastMouseMoveSentAt.value < 40) {
      return
    }

    lastMouseMoveSentAt.value = now
    sendControlEvent({
      type: 'mouse.move',
      ...normalizedCoordinates(event),
      timestamp: now,
    })
  }

  const handleMouseButton = (type, event) => {
    if (!canInteract.value) {
      return
    }

    sendControlEvent({
      type,
      button: event.button,
      ...normalizedCoordinates(event),
      timestamp: Date.now(),
    })
  }

  const handleWheel = (event) => {
    if (!canInteract.value) {
      return
    }

    sendControlEvent({
      type: 'mouse.wheel',
      delta_x: event.deltaX,
      delta_y: event.deltaY,
      ...normalizedCoordinates(event),
      timestamp: Date.now(),
    })
  }

  const setRemoteVideoElement = (element) => {
    remoteVideoElement.value = element
  }

  const runStep = async (step) => {
    if (step === 'create-session') {
      await createSession()
      return
    }

    if (step === 'connect-socket') {
      connectSocket()
      return
    }

    if (step === 'create-peer') {
      await createPeerConnection()
      return
    }

    if (step === 'send-offer') {
      await createAndSendOffer()
    }
  }

  onBeforeUnmount(() => {
    cleanupAll()
  })

  return proxyRefs({
    canInteract,
    config,
    controlReady,
    createAndSendOffer,
    createPeerConnection,
    createSession,
    eventHistory,
    handleKeyboard,
    handleMouseButton,
    handleMouseMove,
    handleWheel,
    hasSession,
    isTerminal,
    loadSessionDetail,
    logs,
    runStep,
    session,
    setRemoteVideoElement,
    status,
    terminateSession,
    connectSocket,
  })
}
