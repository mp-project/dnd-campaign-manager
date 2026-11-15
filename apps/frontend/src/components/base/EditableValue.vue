<script setup lang="ts">
/**
 * Clickable value: shows the slot and emits `edit` with its element (the anchor of the value editor).
 * Editable shows a hover frame and a small pen; without `editable` only the content is shown.
 *
 *   <EditableValue :label="t(…)" @edit="(anchor) => editValues(anchor, { … })">…</EditableValue>
 */
import Icon from "./Icon.vue";

withDefaults(defineProps<{ editable?: boolean; label: string; block?: boolean }>(), { editable: true });
const emit = defineEmits<{ edit: [anchor: HTMLElement] }>();
</script>

<template>
  <button
    v-if="editable"
    type="button"
    :aria-label="label"
    :title="label"
    class="group/ev relative -m-1 cursor-pointer items-center rounded-control p-1 text-left outline-offset-2 transition-colors hover:bg-gold-soft/40 focus-visible:outline-2 focus-visible:outline-primary"
    :class="block ? 'flex w-[calc(100%+0.5rem)]' : 'inline-flex'"
    @click="emit('edit', $event.currentTarget as HTMLElement)"
  >
    <slot />
    <span
      class="pointer-events-none absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-gold bg-parchment-card text-brand opacity-0 shadow-soft transition-opacity group-hover/ev:opacity-100 group-focus-visible/ev:opacity-100"
      aria-hidden="true"
    >
      <Icon
        name="aktion-bearbeiten"
        :size="12"
      />
    </span>
  </button>
  <span
    v-else
    :class="block ? 'flex' : 'inline-flex'"
    class="items-center"
  ><slot /></span>
</template>
