<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NInput, NSelect } from 'naive-ui'
import { useAppStore } from '@/stores/hermes/app'
import { useChatStore } from '@/stores/hermes/chat'
import { useCollapsedProviderGroups } from '@/composables/useCollapsedProviderGroups'
import { useI18n } from 'vue-i18n'
import type { AvailableModelGroup } from '@/api/hermes/system'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const { t } = useI18n()
const appStore = useAppStore()
const chatStore = useChatStore()
const { isGroupCollapsed, toggleGroup } = useCollapsedProviderGroups()

const searchQuery = ref('')
const customInput = ref('')
const customProvider = ref('')

// 会话级当前模型（composer 内切换）
const currentModel = computed(() => chatStore.activeSession?.model || appStore.selectedModel || '')
const currentProvider = computed(() => chatStore.activeSession?.provider || appStore.selectedProvider || '')

// 模型组：当前会话实际使用的模型（appStore.modelGroups 已按 profile 组装）
const modelGroups = computed<AvailableModelGroup[]>(() => appStore.modelGroups || [])

const providerOptions = computed(() =>
  modelGroups.value.map(g => ({ label: g.label || g.provider, value: g.provider })),
)

const modelGroupsWithCustom = computed(() =>
  modelGroups.value.map(g => ({
    ...g,
    models: [
      ...g.models,
      ...(appStore.customModels[g.provider] || []).filter(m => !g.models.includes(m)),
    ],
  })),
)

function isCustomModel(model: string, provider: string) {
  return (appStore.customModels[provider] || []).includes(model)
}

async function removeCustomModel(model: string, provider: string) {
  await appStore.removeCustomModel(model, provider)
}

function safeLower(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

const filteredGroups = computed(() => {
  const q = safeLower(searchQuery.value).trim()
  if (!q) return modelGroupsWithCustom.value
  return modelGroupsWithCustom.value
    .map(g => ({
      ...g,
      models: g.models.filter(m => {
        const displayName = appStore.displayModelName(m, g.provider)
        return safeLower(m).includes(q) || safeLower(displayName).includes(q)
      }),
    }))
    .filter(g => g.models.length > 0 || safeLower(g.label).includes(q))
})

function handleSelect(model: string, provider: string) {
  const meta = modelGroups.value.find(g => g.provider === provider)?.model_meta?.[model]
  if (meta?.disabled) return
  void chatStore.switchSessionModel(model, provider)
  close()
}

function modelDisplayName(model: string, provider: string) {
  return appStore.displayModelName(model, provider)
}

function modelAlias(model: string, provider: string) {
  return appStore.getModelAlias(model, provider)
}

function handleCustomSubmit() {
  const model = customInput.value.trim()
  if (!model || !customProvider.value) return
  // 拦截 disabled 模型，避免自定义输入绕过列表里的灰显限制
  const meta = modelGroups.value.find(g => g.provider === customProvider.value)?.model_meta?.[model]
  if (meta?.disabled) return
  void chatStore.switchSessionModel(model, customProvider.value)
  customInput.value = ''
  close()
}

function close() {
  searchQuery.value = ''
  customInput.value = ''
  emit('update:show', false)
}

function open() {
  searchQuery.value = ''
  customInput.value = ''
  customProvider.value = currentProvider.value
}

watch(
  () => props.show,
  (show) => {
    if (show) open()
  },
)

function handleShowChange(show: boolean) {
  emit('update:show', show)
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('models.title')"
    :style="{ width: 'min(480px, calc(100vw - 32px))' }"
    :mask-closable="true"
    @update:show="handleShowChange"
  >
    <NInput
      v-model:value="searchQuery"
      :placeholder="t('models.searchPlaceholder')"
      clearable
      size="small"
      class="model-search"
    />
    <div class="model-list">
      <div v-for="group in filteredGroups" :key="group.provider" class="model-group">
        <div class="model-group-header" @click="toggleGroup(group.provider)">
          <svg
            class="model-group-arrow"
            :class="{ collapsed: isGroupCollapsed(group.provider) }"
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span class="model-group-label">{{ group.label }}</span>
          <span class="model-group-count">{{ group.models.length }}</span>
        </div>
        <div v-show="!isGroupCollapsed(group.provider)" class="model-group-items">
          <div
            v-for="model in group.models"
            :key="model"
            class="model-item"
            :class="{
              active: model === currentModel && group.provider === currentProvider,
              disabled: !!group.model_meta?.[model]?.disabled,
            }"
            :title="group.model_meta?.[model]?.disabled ? t('models.disabledTooltip') : ''"
            @click="handleSelect(model, group.provider)"
          >
            <span class="model-item-label">
              <span class="model-item-name">{{ modelDisplayName(model, group.provider) }}</span>
              <span v-if="modelAlias(model, group.provider)" class="model-item-id">
                {{ t('models.aliasCanonical', { model }) }}
              </span>
            </span>
            <span v-if="group.model_meta?.[model]?.preview" class="model-badge-preview">{{ t('models.previewBadge') }}</span>
            <span v-if="group.model_meta?.[model]?.disabled" class="model-badge-disabled">{{ t('models.disabledBadge') }}</span>
            <span v-if="isCustomModel(model, group.provider)" class="model-badge-custom">{{ t('models.customBadge') }}</span>
            <button
              v-if="isCustomModel(model, group.provider)"
              class="model-custom-remove"
              type="button"
              :title="t('models.removeCustomModel')"
              @click.stop="removeCustomModel(model, group.provider)"
            >
              ×
            </button>
            <svg v-if="model === currentModel && group.provider === currentProvider" class="model-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
      </div>
      <div v-if="filteredGroups.length === 0" class="model-empty">
        {{ t('models.noModels') }}
      </div>
    </div>
    <div class="model-custom">
      <div class="model-custom-row">
        <NSelect
          v-model:value="customProvider"
          :options="providerOptions"
          size="small"
          class="model-custom-provider"
        />
        <NInput
          v-model:value="customInput"
          :placeholder="t('models.customModelPlaceholder')"
          size="small"
          class="model-custom-input"
          @keydown.enter="handleCustomSubmit"
        />
      </div>
      <div class="model-custom-hint">
        {{ t('models.customModelHint') }}
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.model-search {
  margin-bottom: 12px;
}

.model-list {
  max-height: 50vh;
  overflow-y: auto;
  scrollbar-width: thin;
}

.model-group {
  margin-bottom: 4px;
}

.model-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px;
  font-size: 12px;
  font-weight: 600;
  color: $text-secondary;
  cursor: pointer;
  border-radius: $radius-sm;
  user-select: none;
  transition: background-color $transition-fast;

  &:hover {
    background-color: $bg-secondary;
  }
}

.model-group-arrow {
  flex-shrink: 0;
  transition: transform $transition-fast;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.model-group-label {
  flex: 1;
}

.model-group-count {
  font-size: 11px;
  color: $text-muted;
  font-weight: 400;
}

.model-group-items {
  padding-inline-start: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: $text-secondary;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background-color: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }

  &.active {
    color: $accent-primary;
    font-weight: 500;
  }

  &.disabled {
    opacity: 0.45;
    cursor: not-allowed;

    &:hover {
      background-color: transparent;
      color: $text-secondary;
    }
  }
}

.model-item-label {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: $font-code;
  font-size: 12px;
}

.model-item-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: $text-muted;
  font-family: $font-code;
  font-size: 10px;
  font-weight: 400;
}

.model-check {
  flex-shrink: 0;
  color: $accent-primary;
}

.model-badge-custom {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  background: $accent-primary;
  padding: 1px 5px;
  border-radius: 3px;
  margin-inline-end: 4px;
  letter-spacing: 0.03em;
}

.model-custom-remove {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  line-height: 18px;
  padding: 0;

  &:hover {
    background: rgba(var(--error-rgb), 0.12);
    color: $error;
  }
}

.model-badge-preview {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  background: #d97706;
  padding: 1px 5px;
  border-radius: 3px;
  margin-inline-end: 4px;
  letter-spacing: 0.03em;
}

.model-badge-disabled {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 600;
  color: $text-muted;
  background: transparent;
  border: 1px solid $border-color;
  padding: 0 5px;
  border-radius: 3px;
  margin-inline-end: 4px;
  letter-spacing: 0.03em;
}

.model-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: $text-muted;
}

.model-custom {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid $border-color;
}

.model-custom-row {
  display: flex;
  gap: 8px;
}

.model-custom-provider {
  width: 160px;
  flex-shrink: 0;
}

.model-custom-input {
  flex: 1;
}

.model-custom-hint {
  margin-top: 6px;
  font-size: 11px;
  color: $text-muted;
}
</style>
