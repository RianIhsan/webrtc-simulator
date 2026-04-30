<script setup>
import SimulatorView from './views/SimulatorView.vue'
import RemoteScreenViewer from './views/RemoteScreenViewer.vue'

const isViewerMode = new URLSearchParams(window.location.search).get('viewer') === '1'
</script>

<template>
  <RemoteScreenViewer v-if="isViewerMode" />
  <SimulatorView v-else />
</template>
