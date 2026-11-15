<script setup lang="ts">
import { ref } from "vue";

import CheckBox from "@/components/base/CheckBox.vue";
import NumberStepper from "@/components/base/NumberStepper.vue";
import RadioCard from "@/components/base/RadioCard.vue";
import RangeField from "@/components/base/RangeField.vue";
import SegmentedControl from "@/components/base/SegmentedControl.vue";
import ToggleSwitch from "@/components/base/ToggleSwitch.vue";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const torches = ref(3);
const arrows = ref(20);
const coins = ref(120);
const volume = ref(60);
const ambience = ref(35);
const density = ref("comfortable");
const invite = ref("email");
const view = ref("table");
const push = ref(true);
const mail = ref(false);
const silent = ref(true);
const agreed = ref(false);
const remember = ref(true);
const visibility = ref("gm");
const ruleset = ref("2024");
</script>

<template>
  <ShowcaseSection
    id="controls"
    title="Auswahl und Zähler"
  >
    <ShowcaseComponent
      name="NumberStepper"
      description="Nicht für Trefferpunkte"
    >
      <ShowcaseVariant label="mit max">
        <NumberStepper
          v-model="torches"
          label="Fackeln"
          :max="10"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="ohne max / unit">
        <NumberStepper
          v-model="arrows"
          label="Pfeile"
        />
        <NumberStepper
          v-model="coins"
          label="Gold"
          unit="GM"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="readonly">
        <NumberStepper
          :model-value="2"
          label="Zauberplätze"
          :max="4"
          readonly
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="RangeField">
      <ShowcaseVariant
        label="Standard (%)"
        wide
      >
        <RangeField
          v-model="volume"
          label="Lautstärke"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="hideLabel / eigene unit"
        wide
      >
        <RangeField
          v-model="ambience"
          label="Ambiente"
          hide-label
          unit="dB"
          :max="80"
          class="w-full"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="SegmentedControl">
      <ShowcaseVariant label="2 Optionen">
        <SegmentedControl
          v-model="density"
          label="Dichte"
          :options="[{ value: 'comfortable', label: 'Komfortabel' }, { value: 'compact', label: 'Kompakt' }]"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="mit Icons">
        <SegmentedControl
          v-model="view"
          label="Ansicht"
          :options="[{ value: 'table', label: 'Tabelle', icon: 'ui-list' }, { value: 'grid', label: 'Kacheln', icon: 'ui-grid' }]"
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="3 Optionen"
        wide
      >
        <SegmentedControl
          v-model="invite"
          label="Einladen"
          class="w-full"
          :options="[{ value: 'email', label: 'Per E-Mail' }, { value: 'link', label: 'Einladungslink' }, { value: 'code', label: 'Code' }]"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="ToggleSwitch">
      <ShowcaseVariant label="an / aus mit description">
        <div class="flex w-full flex-col">
          <ToggleSwitch
            v-model="push"
            label="Push-Benachrichtigungen"
            description="Auf diesem Gerät"
          />
          <ToggleSwitch
            v-model="mail"
            label="E-Mail"
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant label="switchLeft / disabled / ariaLabel">
        <div class="flex w-full flex-col">
          <ToggleSwitch
            v-model="silent"
            label="Leise Session"
            switch-left
          />
          <ToggleSwitch
            :model-value="true"
            label="Vom Server gesperrt"
            disabled
          />
          <ToggleSwitch
            v-model="mail"
            aria-label="Spieler sehen die Karte"
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="CheckBox">
      <ShowcaseVariant label="Standard / description">
        <div class="flex flex-col">
          <CheckBox
            v-model="agreed"
            label="Ich habe die Nutzungsbedingungen gelesen"
          />
          <CheckBox
            v-model="remember"
            label="Diesem Gerät vertrauen"
            description="Für 30 Tage ohne Bestätigungscode anmelden."
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant label="disabled">
        <CheckBox
          :model-value="true"
          label="Pflichtfeld"
          disabled
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="RadioCard"
      description="icon, description, disabled"
    >
      <ShowcaseVariant label="Sichtbarkeit">
        <div class="flex w-full flex-col gap-2">
          <RadioCard
            v-model="visibility"
            value="gm"
            name="vis"
            icon="ui-lock"
            label="Nur SL"
            description="Nur für die Spielleitung sichtbar."
          />
          <RadioCard
            v-model="visibility"
            value="selected"
            name="vis"
            icon="ui-users"
            label="Ausgewählte Spieler"
            description="Nur für ausgewählte Spieler sichtbar."
          />
          <RadioCard
            v-model="visibility"
            value="all"
            name="vis"
            icon="ui-globe"
            label="Alle Mitglieder"
            description="Für alle Kampagnenmitglieder sichtbar."
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant label="ohne Icon / disabled">
        <div class="flex w-full flex-col gap-2">
          <RadioCard
            v-model="ruleset"
            value="2024"
            name="rs"
            label="D&D 5e (2024)"
          />
          <RadioCard
            v-model="ruleset"
            value="2014"
            name="rs"
            label="D&D 5e (2014)"
            description="Nicht mit dieser Kampagne kompatibel."
            disabled
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
