<script setup lang="ts">
/** Password field: TextInput with a lock icon and a show/hide toggle. */
import { ref } from "vue";

import { useAppI18n } from "@/core/i18n";

import IconButton from "./IconButton.vue";
import TextInput from "./TextInput.vue";

const model = defineModel<string>({ default: "" });
withDefaults(
  defineProps<{
    id?: string;
    placeholder?: string;
    invalid?: boolean;
    autocomplete?: "current-password" | "new-password";
  }>(),
  { autocomplete: "current-password" },
);
const { t } = useAppI18n();
const visible = ref(false);
</script>

<template>
  <TextInput
    :id="id"
    v-model="model"
    :type="visible ? 'text' : 'password'"
    icon="ui-lock"
    :placeholder="placeholder ?? t('common.password.placeholder')"
    :invalid="invalid"
    :autocomplete="autocomplete"
  >
    <template #right>
      <IconButton
        :icon="visible ? 'ui-eye-off' : 'ui-eye'"
        :icon-size="20"
        :label="visible ? t('common.password.hide') : t('common.password.show')"
        :aria-pressed="visible"
        @click="visible = !visible"
      />
    </template>
  </TextInput>
</template>
