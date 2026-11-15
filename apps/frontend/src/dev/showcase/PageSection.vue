<script setup lang="ts">
import { ref } from "vue";

import FormField from "@/components/base/FormField.vue";
import TextInput from "@/components/base/TextInput.vue";
import BackLink from "@/components/page/BackLink.vue";
import FilterSelect from "@/components/page/FilterSelect.vue";
import FormFooter from "@/components/page/FormFooter.vue";
import ListPageHeader from "@/components/page/ListPageHeader.vue";
import ListToolbar from "@/components/page/ListToolbar.vue";
import PageHeader from "@/components/page/PageHeader.vue";
import PaginationBar from "@/components/page/PaginationBar.vue";
import ResultBar from "@/components/page/ResultBar.vue";
import SectionCard from "@/components/page/SectionCard.vue";
import SectionIntro from "@/components/page/SectionIntro.vue";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const crumbs = [
  { label: "Die Schatten von Elaria", mobileLabel: "Kampagne", to: "/_bausteine#page" },
  { label: "Welt" },
  { label: "Orte" },
];
const typeOptions = [
  { value: "CITY", label: "Stadt" },
  { value: "TAVERN", label: "Taverne" },
  { value: "DUNGEON", label: "Verlies" },
  { value: "RUIN", label: "Ruine" },
];
const sortOptions = [
  { value: "name", label: "Name" },
  { value: "updated", label: "Zuletzt geändert" },
];
const filters = [
  { key: "type", label: "Typ", options: typeOptions },
  {
    key: "access",
    label: "Zugänglichkeit",
    options: [
      { value: "OPEN", label: "Offen" },
      { value: "HIDDEN", label: "Verborgen" },
    ],
  },
];

const chosenTypes = ref<string[]>(["TAVERN"]);
const query = ref("");
const active = ref<Record<string, string[]>>({ type: ["CITY"] });
const sort = ref("name");
const view = ref<"list" | "grid">("list");
const page = ref(3);
const perPage = ref(10);
const manyPage = ref(1);
const name = ref("Zum Kupferkrug");
const footerEvent = ref("");
const takeOver = [
  { heading: "In diese Kampagne übernehmen" },
  { label: "Aus meiner Bibliothek", icon: "nav-bibliothek" as const, action: () => undefined },
  { label: "Aus dem Marketplace", icon: "nav-marketplace" as const, action: () => undefined },
];
</script>

<template>
  <ShowcaseSection
    id="page"
    title="Seitenbausteine"
    description="Seitenkopf, Filter, Ergebnisse, Seiten, Abschnitte und Formularfuß – Reihenfolge wie im Klickdummy."
  >
    <ShowcaseComponent
      name="PageHeader"
      description="Breadcrumb → Fachsymbol + Titel → Unterzeile → Aktionen; mobile-actions ersetzt actions auf dem Handy"
    >
      <ShowcaseVariant
        label="Mit Breadcrumb und Aktionen"
        wide
      >
        <div class="w-full">
          <PageHeader
            title="Kampagnenübersicht"
            icon="nav-uebersicht"
            subtitle="Alles Wichtige zu „Die Schatten von Elaria“ auf einen Blick."
            mobile-subtitle="Alles auf einen Blick."
            :breadcrumb="[{ label: 'Die Schatten von Elaria' }]"
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="ListPageHeader"
      description="Genau eine Primäraktion; Menü und Erstellen nur, wenn übergeben (mobil: Mehr-Menü + Plusbutton)"
    >
      <ShowcaseVariant
        label="Spielleitung: Übernehmen + Erstellen"
        wide
      >
        <div class="w-full">
          <ListPageHeader
            title="Orte"
            icon="nav-orte"
            subtitle="Städte, Tavernen und Verliese deiner Welt."
            :breadcrumb="crumbs"
            create-label="Ort erstellen"
            create-to="/_bausteine#page"
            menu-label="Übernehmen"
            menu-icon="aktion-import"
            :menu-items="takeOver"
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Spieler: nur lesen"
        wide
      >
        <div class="w-full">
          <ListPageHeader
            title="Orte"
            icon="nav-orte"
            :breadcrumb="crumbs"
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="BackLink"
      description="Rücksprung unter dem Breadcrumb; boxed als gerahmter Button"
    >
      <ShowcaseVariant label="Link">
        <BackLink
          to="/_bausteine#page"
          label="Zur Nutzerliste"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="boxed">
        <BackLink
          to="/_bausteine#page"
          label="Zurück zur Übersicht"
          boxed
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="FilterSelect"
      description="Mehrfachauswahl; der Button zeigt die Anzahl"
    >
      <ShowcaseVariant label="Eine Auswahl aktiv">
        <FilterSelect
          v-model="chosenTypes"
          label="Typ"
          :options="typeOptions"
        />
        <span class="meta">{{ chosenTypes.join(", ") || "–" }}</span>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="ListToolbar"
      description="Desktop: Suche + Filter + Zurücksetzen; mobil: Suche, Filter-Button mit Anzahl, Sortierung"
    >
      <ShowcaseVariant
        label="Mit zwei Filtern"
        wide
      >
        <div class="w-full">
          <ListToolbar
            v-model:query="query"
            v-model:active="active"
            v-model:sort="sort"
            placeholder="Orte durchsuchen"
            :filters="filters"
            :sort-options="sortOptions"
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="ResultBar"
      description="Anzahl (aria-live), Sortierung und Listen-/Rasteransicht (Desktop)"
    >
      <ShowcaseVariant
        label="Mit Sortierung und Ansicht"
        wide
      >
        <div class="w-full">
          <ResultBar
            v-model:sort="sort"
            v-model:view="view"
            text="24 Orte"
            :sort-options="sortOptions"
            views
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="PaginationBar"
      description="Bereich oder Einträge pro Seite, verkürzte Seitenliste; loadMore: mobil „Mehr laden“"
    >
      <ShowcaseVariant
        label="Bereich + 12 Seiten"
        wide
      >
        <div class="w-full">
          <PaginationBar
            v-model="page"
            v-model:per-page="perPage"
            :pages="12"
            :total="118"
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Einträge pro Seite, mobil Mehr laden"
        wide
      >
        <div class="w-full">
          <PaginationBar
            v-model="manyPage"
            v-model:per-page="perPage"
            :pages="214"
            :per-page-options="[10, 25, 50]"
            load-more
            @more="manyPage++"
          />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="SectionCard"
      description="Karte mit Fachsymbol-Titel und goldener Unterlinie"
    >
      <ShowcaseVariant
        label="Kampagnenprofil"
        wide
      >
        <SectionCard
          title="Kampagnenprofil"
          subtitle="Name, Beschreibung und Regelwerk"
          icon="nav-uebersicht"
          class="w-full"
        >
          <p>Eine düstere Kampagne in den Nebeln von Elaria.</p>
        </SectionCard>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="SectionIntro"
      description="Abschnittseinleitung innerhalb einer Seite oder eines Tabs"
    >
      <ShowcaseVariant
        label="Mit Symbol"
        wide
      >
        <SectionIntro
          title="Mitglieder"
          subtitle="Wer in dieser Kampagne spielt und schreibt."
          icon="ui-users"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="FormFooter"
      description="Verwerfen zuerst, objektbezogenes Speichern rechts; busy während des Speicherns"
    >
      <ShowcaseVariant
        label="Formularseite"
        wide
      >
        <form
          class="w-full"
          @submit.prevent
        >
          <FormField
            v-slot="field"
            label="Name"
          >
            <TextInput
              :id="field.id"
              v-model="name"
            />
          </FormField>
          <FormFooter
            save-label="Kampagne speichern"
            @save="footerEvent = 'gespeichert'"
            @discard="footerEvent = 'verworfen'"
          />
          <p class="meta mt-2">
            Letzte Aktion: {{ footerEvent || "–" }}
          </p>
        </form>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="busy"
        wide
      >
        <div class="w-full">
          <FormFooter busy />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
