<script setup lang="ts">
import { useAppI18n } from "@/core/i18n";
import { computed, ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import DropdownMenu, { type DropdownItem } from "@/components/base/DropdownMenu.vue";
import EditableValue from "@/components/base/EditableValue.vue";
import { ApiError } from "@/core/api/errors";
import { editValues } from "@/core/ui/valueEditor";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const { t } = useAppI18n();

const items = computed<DropdownItem[]>(() => [
  { heading: "Zum Kupferkrug" },
  { label: "Ansehen", icon: "aktion-ansehen" },
  { label: t("common.actions.edit"), icon: "aktion-bearbeiten" },
  { label: "Teilen", icon: "aktion-teilen" },
  { divider: true },
  { label: t("common.actions.archive"), icon: "ui-database", danger: true },
]);
const sortItems: DropdownItem[] = [
  { label: "Name", active: true },
  { label: "Zuletzt geändert" },
  { label: "Typ" },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const strength = ref(14);
const hp = ref({ current: 27, max: 34 });
const location = ref({ name: "Zum Kupferkrug", kind: "tavern", visible: false });
const session = ref({ date: "2026-11-21", time: "19:30" });
const note = ref("Rovan misstraut der Stadtwache.");

function editStrength(anchor: HTMLElement): void {
  editValues(anchor, {
    title: "Stärke",
    fields: [{ key: "value", label: "Wert", type: "number", value: strength.value, min: 1, max: 30 }],
    preview: (values) => `Modifikator ${Math.floor((Number(values.value) - 10) / 2)}`,
    onSave: async (values) => {
      await wait(600);
      strength.value = Number(values.value);
    },
  });
}

function editHitPoints(anchor: HTMLElement): void {
  editValues(anchor, {
    title: "Trefferpunkte",
    fields: [
      { key: "current", label: "Aktuell", type: "number", value: hp.value.current, min: 0, max: hp.value.max, noStepper: true },
      { key: "max", label: "Maximum", type: "number", value: hp.value.max, min: 1, unit: "TP" },
    ],
    onSave: async (values) => {
      await wait(400);
      hp.value = { current: Number(values.current), max: Number(values.max) };
    },
  });
}

function editLocation(anchor: HTMLElement): void {
  editValues(anchor, {
    title: "Ort",
    hint: "Text, Auswahl und Schalter in einem Fenster.",
    saveLabel: "Ort speichern",
    fields: [
      { key: "name", label: "Name", type: "text", value: location.value.name, required: true, full: true },
      { key: "kind", label: "Art", type: "select", value: location.value.kind, options: [{ value: "city", label: "Stadt" }, { value: "tavern", label: "Gasthaus" }] },
      { key: "visible", label: "Für Spieler sichtbar", type: "toggle", value: location.value.visible },
    ],
    onSave: async (values) => {
      await wait(400);
      location.value = { name: String(values.name), kind: String(values.kind), visible: Boolean(values.visible) };
    },
  });
}

function editSession(anchor: HTMLElement): void {
  editValues(anchor, {
    title: "Nächste Session",
    fields: [
      { key: "date", label: "Datum", type: "date", value: session.value.date },
      { key: "time", label: "Uhrzeit", type: "time", value: session.value.time },
    ],
    onSave: (values) => {
      session.value = { date: String(values.date), time: String(values.time) };
    },
  });
}

function editNote(anchor: HTMLElement): void {
  editValues(anchor, {
    title: "Notiz",
    fields: [{ key: "text", label: "Text", type: "textarea", value: note.value, rows: 4 }],
    onSave: (values) => {
      note.value = String(values.text);
    },
  });
}

function editConflict(anchor: HTMLElement): void {
  editValues(anchor, {
    title: "Gold",
    hint: "Speichern schlägt hier immer fehl (412), das Fenster bleibt offen.",
    fields: [{ key: "value", label: "Gold", type: "number", value: 120, min: 0, unit: "GM" }],
    onSave: async () => {
      await wait(500);
      throw new ApiError({ status: 412, code: "VERSION_CONFLICT", message: "changed" });
    },
  });
}

</script>

<template>
  <ShowcaseSection
    id="menus"
    title="Menüs und Einzelwerte"
  >
    <ShowcaseComponent
      name="DropdownMenu"
      description="Überschriften, Trenner, danger, active; hell und dunkel"
    >
      <ShowcaseVariant label="Standard-Auslöser (rechtsbündig)">
        <DropdownMenu :items="items" />
      </ShowcaseVariant>
      <ShowcaseVariant label="Eigener Auslöser, align=left, active">
        <DropdownMenu
          :items="sortItems"
          align="left"
        >
          <template #trigger="{ toggle, open }">
            <BaseButton
              size="sm"
              icon="ui-sort"
              :aria-expanded="open"
              @click="toggle"
            >
              Sortieren
            </BaseButton>
          </template>
        </DropdownMenu>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="dark (auf Navy)"
        dark
      >
        <DropdownMenu
          :items="items"
          dark
        >
          <template #trigger="{ toggle, open }">
            <BaseButton
              variant="dark"
              icon="nav-kampagne"
              :aria-expanded="open"
              @click="toggle"
            >
              Die Schatten von Elaria
            </BaseButton>
          </template>
        </DropdownMenu>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="EditableValue"
      description="Klickbarer Wert, öffnet den ValueEditor"
    >
      <ShowcaseVariant label="inline / nicht bearbeitbar">
        Stärke
        <EditableValue
          label="Stärke bearbeiten"
          @edit="editStrength"
        >
          <b class="font-heading text-[22px] text-heading">{{ strength }}</b>
        </EditableValue>
        <span class="meta">Spieler ohne Recht:</span>
        <EditableValue
          label="Stärke"
          :editable="false"
        >
          <b class="font-heading text-[22px] text-heading">{{ strength }}</b>
        </EditableValue>
      </ShowcaseVariant>
      <ShowcaseVariant label="block">
        <EditableValue
          label="Notiz bearbeiten"
          block
          @edit="editNote"
        >
          <span class="text-ink-2">{{ note }}</span>
        </EditableValue>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="ValueEditor"
      description="Alle Feldtypen; Speichern ist eine verzögerte Anfrage"
    >
      <ShowcaseVariant label="number + preview">
        <EditableValue
          label="Stärke bearbeiten"
          @edit="editStrength"
        >
          Stärke <b class="ml-1 font-heading">{{ strength }}</b>
        </EditableValue>
      </ShowcaseVariant>
      <ShowcaseVariant label="zwei Zahlen, unit, noStepper">
        <EditableValue
          label="Trefferpunkte bearbeiten"
          @edit="editHitPoints"
        >
          TP <b class="ml-1 font-heading">{{ hp.current }} / {{ hp.max }}</b>
        </EditableValue>
      </ShowcaseVariant>
      <ShowcaseVariant label="text (required) + select + toggle">
        <EditableValue
          label="Ort bearbeiten"
          @edit="editLocation"
        >
          <span class="name-link">{{ location.name }}</span>
        </EditableValue>
      </ShowcaseVariant>
      <ShowcaseVariant label="date + time">
        <EditableValue
          label="Session bearbeiten"
          @edit="editSession"
        >
          {{ session.date }} · {{ session.time }}
        </EditableValue>
      </ShowcaseVariant>
      <ShowcaseVariant label="textarea">
        <EditableValue
          label="Notiz bearbeiten"
          @edit="editNote"
        >
          Notiz bearbeiten
        </EditableValue>
      </ShowcaseVariant>
      <ShowcaseVariant label="Fehler beim Speichern (412)">
        <EditableValue
          label="Gold bearbeiten"
          @edit="editConflict"
        >
          Gold <b class="ml-1 font-heading">120 GM</b>
        </EditableValue>
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
