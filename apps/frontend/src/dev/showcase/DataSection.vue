<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

import Badge from "@/components/base/Badge.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import FormField from "@/components/base/FormField.vue";
import IconButton from "@/components/base/IconButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import TextArea from "@/components/base/TextArea.vue";
import TextInput from "@/components/base/TextInput.vue";
import ContentThumb from "@/components/data/ContentThumb.vue";
import CountMeta from "@/components/data/CountMeta.vue";
import DataTable, { type TableSort } from "@/components/data/DataTable.vue";
import GridCard from "@/components/data/GridCard.vue";
import HpBar from "@/components/data/HpBar.vue";
import KpiCard from "@/components/data/KpiCard.vue";
import MetaItem from "@/components/data/MetaItem.vue";
import StatTile from "@/components/data/StatTile.vue";
import VisibilityLabel from "@/components/data/VisibilityLabel.vue";
import EditorDrawer from "@/components/editor/EditorDrawer.vue";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

type Place = { id: string; name: string; type: string; status: string; documents: number; updated: string };
const places: Place[] = [
  { id: "1", name: "Grauhafen", type: "Stadt", status: "ACTIVE", documents: 12, updated: "12.11.2026" },
  { id: "2", name: "Zum Kupferkrug", type: "Taverne", status: "DRAFT", documents: 3, updated: "10.11.2026" },
  { id: "3", name: "Höhle am Westpfad", type: "Verlies", status: "ARCHIVED", documents: 1, updated: "02.11.2026" },
];
const columns = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Typ", sortable: true },
  { key: "status", label: "Status" },
  { key: "documents", label: "Dokumente", class: "text-right" },
  { key: "updated", label: "Geändert", sortable: true },
];
const sort = ref<TableSort>({ key: "name", direction: "asc" });
const sorted = computed(() => {
  if (!sort.value) return places;
  const { key, direction } = sort.value;
  const factor = direction === "asc" ? 1 : -1;
  return [...places].sort((a, b) => String(a[key as keyof Place]).localeCompare(String(b[key as keyof Place])) * factor);
});

const route = useRoute();
const editorOpen = computed(() => route.query.editor === "1");
const editorSection = ref("general");
const editorBusy = ref(false);
const editorName = ref("Zum Kupferkrug");
const editorText = ref("Ein verrauchtes Gasthaus am Hafen. Mara sitzt meist am Kamin.");
const editorSections = [
  { id: "general", label: "Allgemein", icon: "ui-file" as const, description: "Name und Kurzbeschreibung" },
  { id: "story", label: "Geschichte", icon: "nav-notizen" as const, description: "Was die Spielleitung wissen muss" },
  { id: "links", label: "Verknüpfungen", mobileLabel: "Links", icon: "ui-link" as const },
];
function save(): void {
  editorBusy.value = true;
  setTimeout(() => (editorBusy.value = false), 1200);
}
const thumb = `${import.meta.env.BASE_URL}assets/deko/bergsiegel-navy.svg`;
</script>

<template>
  <ShowcaseSection
    id="data"
    title="Daten und Editor"
    description="Tabellen, Kacheln, Kennzahlen und die Editor-Schublade."
  >
    <ShowcaseComponent
      name="DataTable"
      description="Desktop Tabelle, mobil Datensätze; Sortierung über v-model:sort (Server), rowTo als Abkürzung"
    >
      <ShowcaseVariant
        label="Sortierbar, mit Aktionen"
        wide
      >
        <DataTable
          v-model:sort="sort"
          class="w-full"
          :columns="columns"
          :rows="sorted"
          caption="Orte"
        >
          <template #cell-name="{ row }">
            <a
              class="name-link hover:underline"
              href="#data"
            >{{ row.name }}</a>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :status="row.status" />
          </template>
          <template #actions>
            <IconButton
              icon="aktion-mehr"
              label="Weitere Aktionen"
              variant="ghost"
            />
          </template>
        </DataTable>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Leer"
        wide
      >
        <DataTable
          class="w-full"
          :columns="columns"
          :rows="[]"
          empty-text="Noch keine Orte angelegt."
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="GridCard"
      description="Kachel der Rasteransicht: Symbol oder Bild, Badges, Metadaten, Aktionen"
    >
      <ShowcaseVariant label="Mit Symbol">
        <GridCard
          class="w-72"
          title="Zum Kupferkrug"
          description="Verrauchtes Gasthaus am Hafen"
          icon="nav-orte"
          to="/_bausteine#data"
        >
          <template #badges>
            <Badge tone="sand">
              Taverne
            </Badge>
            <StatusBadge status="DRAFT" />
          </template>
          <CountMeta
            :documents="3"
            :people="2"
            :links="5"
          />
        </GridCard>
      </ShowcaseVariant>
      <ShowcaseVariant label="Mit Bild">
        <GridCard
          class="w-72"
          title="Hauptmann Rovan"
          description="Wachhauptmann am Nordtor"
          :image="thumb"
        >
          <MetaItem
            icon="nav-orte"
            label="Aufenthaltsort"
          >
            Grauhafen – Nordtor
          </MetaItem>
        </GridCard>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="MetaItem"
      description="Kurze Angabe mit Symbol; label benennt das Symbol für Screenreader"
    >
      <ShowcaseVariant label="Zauber">
        <MetaItem
          icon="ui-hourglass"
          label="Zeitaufwand"
        >
          1 Aktion
        </MetaItem>
        <MetaItem
          icon="ui-map"
          label="Reichweite"
        >
          18 m
        </MetaItem>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="CountMeta"
      description="Dokumente · Personen · Verknüpfungen, mit Pluraltexten für Screenreader"
    >
      <ShowcaseVariant label="Alle drei">
        <CountMeta
          :documents="12"
          :people="1"
          :links="0"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="StatTile"
      description="Kennzahl ohne Karte (RK, TP, HG)"
    >
      <ShowcaseVariant label="Statblock">
        <StatTile
          label="RK"
          :value="16"
          icon="ui-shield"
        />
        <StatTile
          label="TP"
          :value="52"
          icon="ui-heart"
          hint="8W8 + 16"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="KpiCard"
      description="Kennzahl mit Karte (Dashboard)"
    >
      <ShowcaseVariant label="Normal und compact">
        <KpiCard
          label="Aktive Kampagnen"
          :value="3"
          icon="nav-uebersicht"
          hint="1 davon als Spieler"
        />
        <KpiCard
          label="Offene Quests"
          :value="7"
          icon="ui-map"
          compact
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="VisibilityLabel"
      description="Wer Inhalte sieht; short für enge Tabellenzellen"
    >
      <ShowcaseVariant label="Lang">
        <VisibilityLabel value="all" />
        <VisibilityLabel value="selected" />
        <VisibilityLabel value="gm" />
        <VisibilityLabel value="private" />
      </ShowcaseVariant>
      <ShowcaseVariant label="short">
        <VisibilityLabel
          value="all"
          short
        />
        <VisibilityLabel
          value="gm"
          short
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="ContentThumb"
      description="Fotos füllend, freigestellte Bilder eingepasst auf dunklem Grund; Größe über class"
    >
      <ShowcaseVariant label="cover und contain">
        <ContentThumb
          :src="thumb"
          class="size-16"
        />
        <ContentThumb
          :src="thumb"
          contain
          class="size-16"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="HpBar"
      description="Unter 35 % rot, temporäre TP als blaues Schild; dark auf Navy"
    >
      <ShowcaseVariant label="Pergament">
        <div class="flex w-64 flex-col gap-3">
          <HpBar
            :hp="38"
            :max="52"
          />
          <HpBar
            :hp="12"
            :max="52"
          />
          <HpBar
            :hp="40"
            :max="52"
            :temp="10"
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="dark"
        dark
      >
        <div class="flex w-64 flex-col gap-3">
          <HpBar
            :hp="38"
            :max="52"
            dark
          />
          <HpBar
            :hp="12"
            :max="52"
            dark
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="EditorDrawer"
      description="Desktop Drawer mit Abschnitten, mobil Editorseite; save wird gemeldet, die Seite schließt nach Erfolg"
    >
      <ShowcaseVariant label="Als Kindroute (?editor=1)">
        <BaseButton
          icon="aktion-bearbeiten"
          :to="{ query: { editor: '1' }, hash: '#data' }"
        >
          Ort bearbeiten
        </BaseButton>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <EditorDrawer
      v-if="editorOpen"
      v-model="editorSection"
      title="Zum Kupferkrug"
      status="DRAFT"
      icon="nav-orte"
      :sections="editorSections"
      save-label="Ort speichern"
      :close-to="{ query: {}, hash: '#data' }"
      quote="Große Geschichten beginnen mit einem Ort."
      :busy="editorBusy"
      @save="save"
    >
      <template #default="{ section }">
        <div
          v-if="section === 'general'"
          class="flex flex-col gap-4"
        >
          <FormField
            v-slot="field"
            label="Name"
          >
            <TextInput
              :id="field.id"
              v-model="editorName"
            />
          </FormField>
        </div>
        <FormField
          v-else-if="section === 'story'"
          v-slot="field"
          label="Geschichte"
        >
          <TextArea
            :id="field.id"
            v-model="editorText"
          />
        </FormField>
        <p v-else>
          Verknüpfungen mit Personen, Orten und Quests.
        </p>
      </template>
    </EditorDrawer>
  </ShowcaseSection>
</template>
