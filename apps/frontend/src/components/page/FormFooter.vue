<script setup lang="ts">
/**
 * Footer of a form page (not a drawer): discard first, the object-specific save on the right as
 * the primary action ("Kampagne speichern"); on mobile both side by side. `busy` while saving.
 * Messages after saving are the caller's (toast, field errors).
 */
import BaseButton from "@/components/base/BaseButton.vue";
import { useAppI18n } from "@/core/i18n";

defineProps<{ saveLabel?: string; discardLabel?: string; busy?: boolean }>();
const emit = defineEmits<{ save: []; discard: [] }>();
const { t } = useAppI18n();
</script>

<template>
  <footer class="mt-6 flex gap-3 border-t border-gold/60 pt-4 md:justify-end md:pt-5">
    <BaseButton
      class="flex-1 md:min-w-40 md:flex-none"
      :disabled="busy"
      @click="emit('discard')"
    >
      {{ discardLabel ?? t("common.actions.discard") }}
    </BaseButton>
    <BaseButton
      variant="primary"
      icon="aktion-speichern"
      :icon-size="22"
      class="flex-[1.4] md:min-w-56 md:flex-none"
      :disabled="busy"
      @click="emit('save')"
    >
      {{ saveLabel ?? t("common.actions.save") }}
    </BaseButton>
  </footer>
</template>
