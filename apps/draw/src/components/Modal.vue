<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { X } from '@lucide/vue'
defineProps<{ label: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const priorFocus = document.activeElement as HTMLElement | null
const previousOverflow = document.body.style.overflow
onMounted(() => { dialog.value?.showModal(); document.body.style.overflow = 'hidden' })
onBeforeUnmount(() => { document.body.style.overflow = previousOverflow; priorFocus?.focus() })
const pointerStartedOutside = ref(false)
function onBackdropClick(event: MouseEvent) { if (pointerStartedOutside.value && event.target === dialog.value) emit('close') }
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" :aria-label="label" :class="['modal', { 'modal-wide': wide }]" @cancel.prevent="emit('close')" @pointerdown="pointerStartedOutside = $event.target === dialog" @click="onBackdropClick">
      <div class="modal-content">
        <button class="icon-button modal-close" aria-label="关闭弹窗" @click="emit('close')"><X :size="23" aria-hidden="true" /></button>
        <slot />
      </div>
    </dialog>
  </Teleport>
</template>
