<script setup lang="ts">
import { computed, ref } from "vue";

import Icon from "@/components/base/Icon.vue";
import { ICON_NAMES } from "@/components/base/iconNames";
import TextInput from "@/components/base/TextInput.vue";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const filter = ref("");
const groups = computed(() =>
  ["nav", "aktion", "orig", "ui"].map((prefix) => ({
    prefix,
    names: ICON_NAMES.filter((name) => name.startsWith(`${prefix}-`) && name.includes(filter.value.trim())),
  })),
);
</script>

<template>
  <ShowcaseSection
    id="icons"
    title="Icons"
    :description="`${ICON_NAMES.length} Symbole aus public/assets/icons/chronik.svg, Farbe über currentColor.`"
  >
    <ShowcaseComponent
      name="Icon"
      description="Größen 16/20/24/32, Fachsymbole 40–48"
    >
      <ShowcaseVariant label="Größen">
        <Icon
          v-for="size in [16, 20, 24, 32, 40, 48]"
          :key="size"
          name="nav-orte"
          :size="size"
          class="text-earth"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="Farben über text-*">
        <Icon
          name="ui-star"
          :size="28"
          class="text-gold"
        />
        <Icon
          name="ui-heart"
          :size="28"
          class="text-danger"
        />
        <Icon
          name="ui-check-circle"
          :size="28"
          class="text-ok"
        />
        <Icon
          name="aktion-bearbeiten"
          :size="28"
          class="text-brand"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>
    <TextInput
      v-model="filter"
      icon="aktion-suchen"
      placeholder="Icon suchen …"
      class="max-w-sm"
    />
    <ShowcaseVariant
      v-for="group in groups"
      :key="group.prefix"
      :label="`${group.prefix}-* (${group.names.length})`"
      wide
    >
      <div class="grid w-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
        <div
          v-for="name in group.names"
          :key="name"
          class="flex flex-col items-center gap-1 rounded-control p-2 text-center hover:bg-parchment-sunk"
        >
          <Icon
            :name="name"
            :size="28"
          />
          <code class="text-[11.5px] break-all text-ink-2">{{ name }}</code>
        </div>
      </div>
    </ShowcaseVariant>
  </ShowcaseSection>
</template>
