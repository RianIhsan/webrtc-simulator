# WebRTC Remote Desktop Simulator

Simulator frontend berbasis Vue + Vite untuk flow remote desktop yang mengikuti dokumen di `docs/aAOcKu3CIztasDeFlbe3yx8esRFyxJ5m.pdf`.

## Jalankan

```bash
npm install
npm run dev
```

## Yang sudah diimplementasikan

- Form konfigurasi runtime untuk `apiBaseUrl`, `wsPath`, token, `deviceId`, `sessionId`, timeout, metadata, dan ICE servers.
- Guided flow step-by-step:
  - create session via HTTP
  - connect WebSocket
  - setup `RTCPeerConnection` + datachannel `control`
  - create offer dan kirim ke backend
- WebSocket event router untuk event session, signaling answer, dan ICE candidate.
- Remote screen area dengan `<video>` untuk render stream dari agent.
- Keyboard, mouse move, click, dan wheel lewat datachannel JSON.
- Debug panel untuk state, request id, event history, dan transport log.

## Alur pakai

1. Isi `Access token`, `Device ID`, dan endpoint backend.
2. Klik `Start from HTTP create session`.
3. Tunggu event `remote.desktop.session.accepted` dari backend atau isi `Session ID manual` untuk reconnect.
4. Lanjutkan `Connect WebSocket`, `Setup peer`, lalu `Create offer` jika auto mode dimatikan.
5. Saat answer dan track sudah masuk, remote screen akan muncul di panel utama.
6. Fokus ke area screen untuk mulai kirim keyboard dan mouse event.

## Catatan

- Tidak ada page auth sesuai permintaan; token langsung diisi dari panel konfigurasi.
- File `src/router/index.js` sekarang hanya menyimpan shape route supaya gampang diaktifkan lagi saat nanti mau menambah `vue-router`.
