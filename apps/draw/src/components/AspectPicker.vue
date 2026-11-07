<script setup lang="ts">
import { Scan, ChevronDown } from '@lucide/vue'
import type { Aspect } from '../types'
withDefaults(defineProps<{ modelValue: Aspect; options?: Aspect[]; compact?: boolean; disabled?: boolean; label?: string }>(), { options: () => ['auto', '1:1', '2:3', '3:2', '16:9', '9:16'], label: '画面比例' })
defineEmits<{ 'update:modelValue': [value: Aspect] }>()
</script>

<template>
  <div :class="['select-pill', { compact }]">
    <Scan :size="17" aria-hidden="true" />
    <span>{{ modelValue === 'auto' ? '自动' : modelValue }}</span>
    <ChevronDown :size="14" aria-hidden="true" />
    <select :aria-label="label" :value="modelValue" :disabled="disabled" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value as Aspect)">
      <option v-for="option in options" :key="option" :value="option">{{ option === 'auto' ? '自动' : option }}</option>
    </select>
  </div>
</template>
