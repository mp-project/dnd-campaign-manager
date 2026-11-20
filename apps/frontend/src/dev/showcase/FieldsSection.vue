<script setup lang="ts">
import { ref } from "vue";

import CodeInput from "@/components/base/CodeInput.vue";
import FormField from "@/components/base/FormField.vue";
import IconButton from "@/components/base/IconButton.vue";
import PasswordInput from "@/components/base/PasswordInput.vue";
import SelectInput from "@/components/base/SelectInput.vue";
import TextArea from "@/components/base/TextArea.vue";
import TextInput from "@/components/base/TextInput.vue";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const name = ref("Zum Kupferkrug");
const empty = ref("");
const password = ref("");
const description = ref("Ein verrauchtes Gasthaus am Hafen von Grauhafen, Treffpunkt der Schmuggler.");
const kind = ref<"" | "city" | "tavern" | "dungeon">("");
const kindSet = ref<"" | "city" | "tavern" | "dungeon">("tavern");
const kinds = [
  { value: "city" as const, label: "Stadt" },
  { value: "tavern" as const, label: "Gasthaus" },
  { value: "dungeon" as const, label: "Gewölbe", disabled: true },
];
const code = ref(["4", "8", "2", "", "", ""]);
const codeInvalid = ref(["4", "8", "", "", "", ""]);
const codeFour = ref(["", "", "", ""]);
</script>

<template>
  <ShowcaseSection
    id="fields"
    title="Formularfelder"
    description="Labels außerhalb der Felder (FormField), Fehler direkt am Feld."
  >
    <ShowcaseComponent
      name="FormField"
      description="label, required, counter, hint, error, wide"
    >
      <ShowcaseVariant label="label + required + counter">
        <FormField
          v-slot="field"
          label="Name"
          required
          counter="14 / 80"
          class="w-full"
        >
          <TextInput
            :id="field.id"
            v-model="name"
          />
        </FormField>
      </ShowcaseVariant>
      <ShowcaseVariant label="hint">
        <FormField
          v-slot="field"
          label="Kurzbeschreibung"
          hint="Erscheint in Listen und Vorschaukarten."
          class="w-full"
        >
          <TextInput
            :id="field.id"
            v-model="empty"
            placeholder="Ein Satz genügt"
            :aria-describedby="field.describedby"
          />
        </FormField>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="error"
        wide
      >
        <FormField
          v-slot="field"
          label="E-Mail"
          error="Bitte gib eine gültige E-Mail-Adresse ein."
          class="w-full"
        >
          <TextInput
            :id="field.id"
            model-value="lea@"
            icon="ui-mail"
            :invalid="field.invalid"
            :aria-describedby="field.describedby"
          />
        </FormField>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="TextInput"
      description="icon, suffix, unit, Slot right, readonly, invalid"
    >
      <ShowcaseVariant label="Standard / placeholder">
        <TextInput
          v-model="empty"
          placeholder="Name des Ortes"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="icon">
        <TextInput
          v-model="empty"
          icon="aktion-suchen"
          placeholder="Orte durchsuchen"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="suffix / unit">
        <TextInput
          model-value="9"
          suffix="m"
          class="w-32"
        />
        <TextInput
          model-value="3"
          unit="kg"
          class="w-40"
        />
        <TextInput
          model-value="25"
          unit="GM"
          class="w-40"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="Slot right">
        <TextInput
          model-value="https://questaria.app/e/4fJ8kQ"
          readonly
          class="w-full"
        >
          <template #right>
            <IconButton
              icon="aktion-teilen"
              label="Link kopieren"
              size="sm"
            />
          </template>
        </TextInput>
      </ShowcaseVariant>
      <ShowcaseVariant label="readonly">
        <TextInput
          model-value="die-schatten-von-elaria"
          readonly
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="invalid">
        <TextInput
          model-value="?"
          invalid
          class="w-full"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="PasswordInput">
      <ShowcaseVariant label="Standard (Ein-/Ausblenden)">
        <PasswordInput
          v-model="password"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="new-password + invalid">
        <PasswordInput
          model-value="kurz"
          autocomplete="new-password"
          placeholder="Mindestens 12 Zeichen"
          invalid
          class="w-full"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="SelectInput"
      description="placeholder, icon, deaktivierte Option, invalid"
    >
      <ShowcaseVariant label="placeholder (leer)">
        <SelectInput
          v-model="kind"
          :options="kinds"
          placeholder="Art wählen"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="Wert gesetzt / Option disabled">
        <SelectInput
          v-model="kindSet"
          :options="kinds"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="icon">
        <SelectInput
          v-model="kindSet"
          :options="kinds"
          icon="nav-orte"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="invalid">
        <SelectInput
          v-model="kind"
          :options="kinds"
          placeholder="Pflichtfeld"
          invalid
          class="w-full"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="TextArea">
      <ShowcaseVariant label="Standard">
        <TextArea
          v-model="description"
          class="w-full"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="rows=2 / invalid">
        <TextArea
          model-value=""
          :rows="2"
          placeholder="Notiz"
          invalid
          class="w-full"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="CodeInput"
      description="Einfügen eines Codes wird verteilt"
    >
      <ShowcaseVariant label="6 Ziffern">
        <CodeInput
          v-model="code"
          class="w-full max-w-sm"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="invalid / 4 Ziffern">
        <CodeInput
          v-model="codeInvalid"
          invalid
          class="w-full max-w-sm"
        />
        <CodeInput
          v-model="codeFour"
          class="w-full max-w-60"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
