<script setup lang="ts">
import { useAppI18n } from "@/core/i18n";
import BaseButton from "@/components/base/BaseButton.vue";
import CloseButton from "@/components/base/CloseButton.vue";
import IconButton from "@/components/base/IconButton.vue";
import type { ButtonSize, ButtonVariant } from "@/components/base/types";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const lightVariants: ButtonVariant[] = ["primary", "secondary", "ghost", "quiet", "danger"];
const darkVariants: ButtonVariant[] = ["dark", "outline-gold", "primary"];
const sizes: ButtonSize[] = ["lg", "md", "sm", "xs"];

const { t } = useAppI18n();
</script>

<template>
  <ShowcaseSection
    id="buttons"
    title="Buttons"
    description="Pro Kontext genau eine Primäraktion; Beschriftung nennt die konkrete Aktion."
  >
    <ShowcaseComponent
      name="BaseButton"
      description="variant × size, Icons, Links, Zustände"
    >
      <ShowcaseVariant
        v-for="size in sizes"
        :key="size"
        :label="`Varianten, size=${size}`"
        wide
      >
        <BaseButton
          v-for="variant in lightVariants"
          :key="variant"
          :variant="variant"
          :size="size"
        >
          {{ variant }}
        </BaseButton>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Auf Navy: dark, outline-gold, primary"
        dark
        wide
      >
        <BaseButton
          v-for="variant in darkVariants"
          :key="variant"
          :variant="variant"
        >
          {{ variant }}
        </BaseButton>
      </ShowcaseVariant>
      <ShowcaseVariant label="icon / iconRight">
        <BaseButton
          variant="primary"
          icon="aktion-hinzufuegen"
        >
          Ort erstellen
        </BaseButton>
        <BaseButton icon-right="aktion-weiter">
          Weiter
        </BaseButton>
      </ShowcaseVariant>
      <ShowcaseVariant label="disabled">
        <BaseButton
          variant="primary"
          disabled
        >
          {{ t("common.actions.save") }}
        </BaseButton>
        <BaseButton disabled>
          {{ t("common.actions.discard") }}
        </BaseButton>
      </ShowcaseVariant>
      <ShowcaseVariant label="to (RouterLink) / as=&quot;span&quot;">
        <BaseButton
          to="/_bausteine#buttons"
          icon="aktion-zurueck"
        >
          Link
        </BaseButton>
        <BaseButton
          as="span"
          variant="quiet"
        >
          Aktiver Umschalter
        </BaseButton>
      </ShowcaseVariant>
      <ShowcaseVariant label="bare (eigener Inhalt) / block">
        <BaseButton bare>
          <span class="hidden md:inline">Spieler </span>einladen
          <span class="badge badge-burgundy">3</span>
        </BaseButton>
        <BaseButton
          variant="primary"
          block
        >
          Volle Breite
        </BaseButton>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Lange Beschriftung (mobil umbrechend)"
        wide
      >
        <BaseButton
          variant="primary"
          icon="aktion-speichern"
        >
          Änderungen an „Die Schatten von Elaria“ speichern und Spieler benachrichtigen
        </BaseButton>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="IconButton"
      description="Nur Symbol; label wird aria-label und Tooltip"
    >
      <ShowcaseVariant
        v-for="size in sizes"
        :key="size"
        :label="`size=${size}`"
      >
        <IconButton
          icon="aktion-bearbeiten"
          :label="t('common.actions.edit')"
          :size="size"
        />
        <IconButton
          icon="aktion-loeschen"
          :label="t('common.actions.delete')"
          variant="danger"
          :size="size"
        />
        <IconButton
          icon="aktion-filter"
          :label="t('common.actions.filter')"
          variant="secondary"
          :size="size"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="CloseButton">
      <ShowcaseVariant label="Standard / eigenes Label / sm">
        <CloseButton />
        <CloseButton label="Editor schließen" />
        <CloseButton size="sm" />
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
