<script setup lang="ts">
import { useAppI18n } from "@/core/i18n";
import { provide, ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import ExpandableText from "@/components/content/ExpandableText.vue";
import MentionText from "@/components/content/MentionText.vue";
import ModalDialog from "@/components/content/ModalDialog.vue";
import SafeHtml from "@/components/content/SafeHtml.vue";
import StepIndicator from "@/components/content/StepIndicator.vue";
import { MENTION_OPENER, MENTION_RESOLVER, type MentionTarget } from "@/core/content/mentions";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const targets: Record<string, MentionTarget | null> = {
  rovan: { name: "Hauptmann Rovan", typeLabel: "Person", summary: "Wachhauptmann am Nordtor", round: true },
  mara: { name: "Mara Lichtwacht", typeLabel: "Person", summary: "Kundschafterin", round: true, gmOnly: true },
  nordtor: { name: "Grauhafen – Nordtor", typeLabel: "Ort", summary: "Stadttor im Norden", icon: "nav-orte" },
  morgenhain: null,
};
provide(MENTION_RESOLVER, (ref) => (ref.id in targets ? targets[ref.id] : undefined));
const opened = ref("");
provide(MENTION_OPENER, (ref) => (opened.value = `${ref.type}:${ref.id}`));

const story =
  "Die Gruppe trifft @[Hauptmann Rovan](npc:rovan) am @[Nordtor](location:nordtor). Er berichtet von Aschenwölfen im @[Morgenhain](location:morgenhain) und bittet um Hilfe. " +
  "@[Mara Lichtwacht](npc:mara) kennt einen geheimen Pfad durch die Höhle am Westpfad, verlangt dafür aber das bronzene Siegel. " +
  "Wer ihr folgt, erreicht den Wachturm auf der Rabenhöhe noch vor Einbruch der Nacht.";

const smallDialog = ref(false);
const wideDialog = ref(false);
const steps = [
  { id: "file", label: "Datei bereitstellen", to: "/_bausteine#content" },
  { id: "check", label: "Prüfen", to: "/_bausteine#content" },
  { id: "import", label: "Importieren" },
];
const html =
  "<h3>Zum Kupferkrug</h3><p>Ein <strong>verrauchtes</strong> Gasthaus. <em>Mara</em> sitzt meist am Kamin.</p>" +
  "<ul><li>Bier: 4 KM</li><li>Zimmer: 5 SM</li></ul><p><a href='javascript:alert(1)'>Skript-Link</a> und <img src=x onerror=alert(1)> werden entfernt.</p>";

const { t } = useAppI18n();
</script>

<template>
  <ShowcaseSection
    id="content"
    title="Inhalte"
  >
    <ShowcaseComponent
      name="ExpandableText"
      description="Vorschau mit Auslassung; Umschalter nur bei abgeschnittenem Text"
    >
      <ShowcaseVariant
        label="Standard (3 Zeilen)"
        wide
      >
        <ExpandableText :text="story" />
      </ShowcaseVariant>
      <ShowcaseVariant label="lines=1">
        <ExpandableText
          :text="story"
          :lines="1"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="compact (Tabellenzelle)">
        <ExpandableText
          :text="story"
          compact
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Kurzer Text (kein Umschalter)"
        wide
      >
        <ExpandableText text="Ein ruhiger Abend im Hafen." />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="MentionText"
      description="Marke mit Vorschaukarte, entfernt, unbekannt, kaputte Syntax"
    >
      <ShowcaseVariant
        label="Aufgelöst (Vorschau beim Darüberfahren, Klick öffnet)"
        wide
      >
        <p>
          <MentionText text="Frag @[Rovan](npc:rovan) am @[Nordtor](location:nordtor), oder @[Mara](npc:mara)." />
        </p>
        <span
          v-if="opened"
          class="meta"
        >Geöffnet: {{ opened }}</span>
      </ShowcaseVariant>
      <ShowcaseVariant label="Ziel entfernt (durchgestrichen) / unbekannt (gespeicherter Name)">
        <p><MentionText text="@[Morgenhain](location:morgenhain) · @[Schmugglerbucht](location:bucht)" /></p>
      </ShowcaseVariant>
      <ShowcaseVariant label="Kaputte Syntax bleibt Text">
        <p><MentionText text="@[Rovan](npc rovan) und @[](x:1)" /></p>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="ModalDialog"
      description="Mobil als Bottom-Sheet; Esc und Klick daneben schließen"
    >
      <ShowcaseVariant label="Bestätigung mit Footer">
        <BaseButton @click="smallDialog = true">
          Kampagne archivieren
        </BaseButton>
        <ModalDialog
          v-model="smallDialog"
          title="Kampagne archivieren"
          width="480px"
        >
          <p>„Die Schatten von Elaria“ wird archiviert. Spieler sehen sie danach nicht mehr.</p>
          <template #footer>
            <BaseButton @click="smallDialog = false">
              {{ t("common.actions.cancel") }}
            </BaseButton>
            <BaseButton
              variant="primary"
              @click="smallDialog = false"
            >
              {{ t("common.actions.archive") }}
            </BaseButton>
          </template>
        </ModalDialog>
      </ShowcaseVariant>
      <ShowcaseVariant label="Breit, langer Inhalt, ohne Footer">
        <BaseButton @click="wideDialog = true">
          Regeltext anzeigen
        </BaseButton>
        <ModalDialog
          v-model="wideDialog"
          title="Rettungswürfe"
          width="760px"
          close-label="Regeltext schließen"
        >
          <p
            v-for="n in 12"
            :key="n"
            class="mb-3"
          >
            Ein Rettungswurf stellt den Versuch dar, einem Zauber, einer Falle, einem Gift, einer Krankheit oder einer ähnlichen Bedrohung zu widerstehen.
          </p>
        </ModalDialog>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="StepIndicator"
      description="Erledigt (mit Link zurück), aktuell, offen; mobil nur der aktuelle Titel"
    >
      <ShowcaseVariant
        label="Am Anfang"
        wide
      >
        <StepIndicator
          :steps="steps"
          current="file"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Mittendrin"
        wide
      >
        <StepIndicator
          :steps="steps"
          current="check"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="complete"
        wide
      >
        <StepIndicator
          :steps="steps"
          complete
          class="w-full"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="SafeHtml"
      description="Server-HTML (Markdown) erneut bereinigt"
    >
      <ShowcaseVariant
        label="Inhalt mit Skript-Versuchen"
        wide
      >
        <SafeHtml :html="html" />
      </ShowcaseVariant>
      <ShowcaseVariant label="Leer / null">
        <SafeHtml :html="null" />
        <span class="meta">(nichts)</span>
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
