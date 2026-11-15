<script setup lang="ts">
import BottomNav from "@/components/layout/BottomNav.vue";
import BrandMark from "@/components/layout/BrandMark.vue";
import CompassRose from "@/components/layout/CompassRose.vue";
import NavFooter from "@/components/layout/NavFooter.vue";
import NavTree from "@/components/layout/NavTree.vue";
import ParchmentFrame from "@/components/layout/ParchmentFrame.vue";
import AppBreadcrumb from "@/components/page/AppBreadcrumb.vue";
import type { BottomNavTarget, NavEntry, NavLink } from "@/core/navigation/navigation";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

// The clickdummy's navigation as example; in the app the entries come from the registered modules.
const link = (id: string, label: string, icon: NavLink["icon"]): NavLink => ({ id, label, icon, to: `/_bausteine#${id}` });
const account = [
  link("dashboard", "Dashboard", "nav-dashboard"),
  link("bibliothek", "Meine Bibliothek", "nav-bibliothek"),
  link("marketplace", "Marketplace", "nav-marketplace"),
];
const campaign: NavEntry[] = [
  { kind: "link", link: link("uebersicht", "Übersicht", "nav-uebersicht") },
  {
    kind: "group",
    id: "world",
    label: "Welt",
    icon: "nav-welt",
    links: [link("orte", "Orte", "nav-orte"), link("personen", "Personen", "nav-personen"), link("fraktionen", "Fraktionen", "nav-fraktionen")],
  },
  {
    kind: "group",
    id: "adventure",
    label: "Abenteuer",
    icon: "nav-abenteuer",
    links: [link("quests", "Quests", "nav-quests"), link("storylines", "Storylines", "nav-storylines")],
  },
  { kind: "group", id: "compendium", label: "Kompendium", icon: "nav-kompendium", links: [link("zauber", "Zauber", "nav-zauber")] },
  { kind: "divider", id: "divider-1" },
  { kind: "link", link: link("sessions", "Sessions", "nav-sessions") },
  { kind: "link", link: link("notizen", "Notizen", "nav-notizen") },
  { kind: "divider", id: "divider-2" },
  { kind: "link", link: link("freigaben", "Freigaben", "nav-freigaben") },
];
const campaignBottom: BottomNavTarget[] = [
  link("uebersicht", "Übersicht", "nav-uebersicht"),
  { id: "content", label: "Inhalte", icon: "nav-inhalte", panel: "content" },
  link("sessions", "Sessions", "nav-sessions"),
  link("notizen", "Notizen", "nav-notizen"),
  { id: "more", label: "Mehr", icon: "aktion-mehr", panel: "more" },
];
const playerBottom: BottomNavTarget[] = [
  link("spielbrett", "Spielbrett", "nav-spielbrett"),
  link("entdeckt", "Entdeckt", "nav-entdeckungen"),
  link("gruppe", "Gruppe", "ui-users"),
  link("charakter", "Charakter", "ui-shield"),
  link("notizen", "Notizen", "nav-notizen"),
];
</script>

<template>
  <ShowcaseSection
    id="layout"
    title="Layout und Navigation"
    description="Teile der App-Hülle. Seitenleiste, Kopfzeilen, Benutzermenü und Kampagnenwahl brauchen eine Sitzung und sind in der App selbst zu sehen."
  >
    <ShowcaseComponent
      name="NavTree"
      description="Konto und Kampagne; Gruppen einklappbar, aktive Gruppe offen; eingeklappt nur Symbole"
    >
      <ShowcaseVariant
        label="Aktiv: Personen (Gruppe Welt offen)"
        dark
      >
        <div class="w-69">
          <NavTree
            :account="account"
            :campaign="campaign"
            active-id="personen"
            active-group="world"
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Eingeklappt (76 px)"
        dark
      >
        <div class="w-19">
          <NavTree
            :account="account"
            :campaign="campaign"
            active-id="sessions"
            compact
          />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Ohne Kampagne"
        dark
      >
        <div class="w-69">
          <NavTree
            :account="account"
            :campaign="[]"
            active-id="dashboard"
          >
            <template #campaign-empty>
              <p class="px-6 py-2 text-[13.5px] text-parchment/70">
                Wähle eine Kampagne. Danach findest du hier ihre Inhalte.
              </p>
            </template>
          </NavTree>
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="BottomNav"
      description="Mobil, höchstens fünf Ziele; Kampagne mit Kompassrose, Inhalte/Mehr öffnen das Menü"
    >
      <ShowcaseVariant
        label="Kampagne, aktiv: Inhalte"
        dark
        wide
      >
        <BottomNav
          class="block! w-full max-w-md"
          :targets="campaignBottom"
          active="content"
          label="Kampagnennavigation"
          compass-first
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Spieleransicht, aktiv: Gruppe"
        dark
        wide
      >
        <BottomNav
          class="block! w-full max-w-md"
          :targets="playerBottom"
          active="gruppe"
          label="Spielernavigation"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="AppBreadcrumb"
      description="Letztes Element ist die aktuelle Seite; mobileLabel kürzt"
    >
      <ShowcaseVariant
        label="Drei Ebenen, mobil gekürzt"
        wide
      >
        <AppBreadcrumb
          :items="[
            { label: 'Welt', to: '/_bausteine#layout' },
            { label: 'Welt – Orte', mobileLabel: 'Orte', to: '/_bausteine#layout' },
            { label: 'Zum Kupferkrug' },
          ]"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="CompassRose"
      description="tone: navy, light, active (auf Navy), parchment"
    >
      <ShowcaseVariant
        label="navy / light / active"
        dark
      >
        <CompassRose />
        <CompassRose tone="light" />
        <CompassRose tone="active" />
      </ShowcaseVariant>
      <ShowcaseVariant label="parchment, 64 px">
        <CompassRose
          tone="parchment"
          :size="64"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="BrandMark">
      <ShowcaseVariant
        label="Standard / compact (PlayerShell)"
        dark
      >
        <BrandMark />
        <BrandMark compact />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent name="NavFooter">
      <ShowcaseVariant
        label="Abschluss der Navigation"
        dark
      >
        <div class="w-69">
          <NavFooter />
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="ParchmentFrame"
      description="Arbeitsfläche; Ecken fest, Kanten wachsen"
    >
      <ShowcaseVariant label="md (Arbeitsfläche)">
        <ParchmentFrame class="h-40 w-full p-6">
          <p class="section-title">
            Zum Kupferkrug
          </p>
        </ParchmentFrame>
      </ShowcaseVariant>
      <ShowcaseVariant label="sm (Karten-Kasten), tag=section">
        <ParchmentFrame
          size="sm"
          tag="section"
          class="w-full p-4"
        >
          Ein verrauchtes Gasthaus am Hafen.
        </ParchmentFrame>
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
