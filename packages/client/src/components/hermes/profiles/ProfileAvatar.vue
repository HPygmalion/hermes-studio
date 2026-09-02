<script setup lang="ts">
import { computed } from 'vue'
import type { ProfileAvatar } from '@/api/hermes/profiles'
import hermesAgentAvatar from '@/assets/hermes-agent-avatar.png'

const props = withDefaults(defineProps<{
  name: string
  avatar?: ProfileAvatar | null
  size?: number
}>(), {
  size: 24,
})

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  flexBasis: `${props.size}px`,
}))
</script>

<template>
  <span class="profile-avatar-view" :style="style">
    <img
      v-if="avatar?.type === 'image' && avatar.dataUrl"
      class="profile-avatar-image"
      :src="avatar.dataUrl"
      alt=""
      draggable="false"
    >
    <img v-else class="profile-avatar-image" :src="hermesAgentAvatar" alt="" draggable="false">
  </span>
</template>

<style scoped>
.profile-avatar-view {
  display: inline-flex;
  flex: 0 0 auto;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-secondary);
}

.profile-avatar-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
</style>
