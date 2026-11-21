<script setup lang="ts">
import { ref } from "vue";

import BottomNav from "@/components/layout/BottomNav.vue";
import BrandMark from "@/components/layout/BrandMark.vue";
import NavFooter from "@/components/layout/NavFooter.vue";
import NavTree from "@/components/layout/NavTree.vue";
import ParchmentFrame from "@/components/layout/ParchmentFrame.vue";
import SiteFooter from "@/components/layout/SiteFooter.vue";
import LanguageSwitch from "@/components/layout/LanguageSwitch.vue";
import PublicHeader from "@/components/layout/PublicHeader.vue";
import PublicMenu from "@/components/layout/PublicMenu.vue";
import PublicNavLink from "@/components/layout/PublicNavLink.vue";
import SiteHeader from "@/components/layout/SiteHeader.vue";
import WingSeal from "@/components/layout/WingSeal.vue";
import AppBreadcrumb from "@/components/page/AppBreadcrumb.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import TabNav from "@/components/page/TabNav.vue";
import type { BottomNavTarget, NavEntry, NavLink } from "@/core/navigation/navigation";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const tab = ref("anmelden");

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
          seal-first
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
      name="TabNav"
      description="Mit to: eigene URL je Tab (aktiv nach Pfad), sonst v-model; mobil horizontal scrollbar"
    >
      <ShowcaseVariant
        label="boxed, v-model"
        wide
      >
        <TabNav
          v-model="tab"
          label="Bereiche"
          :tabs="[
            { id: 'anmelden', label: 'Anmelden', icon: 'ui-key' },
            { id: 'registrieren', label: 'Registrieren', icon: 'ui-user' },
          ]"
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="plain, mit Links"
        wide
      >
        <TabNav
          variant="plain"
          label="Profil"
          :tabs="[
            { id: 'bausteine', label: 'Bausteine', to: '/_bausteine' },
            { id: 'dashboard', label: 'Dashboard', to: '/dashboard' },
            { id: 'konto', label: 'Konto', to: '/konto' },
          ]"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="InfoNote"
      description="tone: info, ok, warn, danger; announce liest Ergebnisse vor"
    >
      <ShowcaseVariant label="info">
        <InfoNote>Der Code ist 30 Minuten gültig.</InfoNote>
      </ShowcaseVariant>
      <ShowcaseVariant label="ok">
        <InfoNote tone="ok">
          Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden.
        </InfoNote>
      </ShowcaseVariant>
      <ShowcaseVariant label="warn">
        <InfoNote tone="warn">
          Bitte bestätige zuerst deine E-Mail-Adresse.
        </InfoNote>
      </ShowcaseVariant>
      <ShowcaseVariant label="danger">
        <InfoNote tone="danger">
          E-Mail-Adresse oder Passwort ist falsch.
        </InfoNote>
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

    <ShowcaseComponent
      name="SiteHeader"
      description="Kopf der Seiten außerhalb der App; sticky, beim Scrollen schmaler und leicht transparent"
    >
      <ShowcaseVariant
        label="oben"
        dark
      >
        <SiteHeader
          :condensed="false"
          class="w-full"
        >
          <span class="text-[15px]">Anmelden</span>
        </SiteHeader>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="gescrollt"
        dark
      >
        <SiteHeader
          condensed
          class="w-full"
        >
          <span class="text-[15px]">Anmelden</span>
        </SiteHeader>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="PublicHeader"
      description="Kopf aller öffentlichen Seiten: Navigation aus den Modulen (Bereich public), Sprachwahl auf mehrsprachigen Seiten, Demo und Vorab-Registrierung als Buttons; unter lg das Kompass-Menü"
    >
      <ShowcaseVariant
        label="oben"
        dark
      >
        <PublicHeader
          :condensed="false"
          class="w-full"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="PublicNavLink"
      description="Textlink der öffentlichen Navigation: Unterstreichung in der Primärfarbe bei Hover und Fokus, dauerhaft auf der aktuellen Seite"
    >
      <ShowcaseVariant
        label="auf Navy"
        dark
      >
        <PublicNavLink to="/_bausteine#faq">
          FAQ
        </PublicNavLink>
        <PublicNavLink
          to="/_bausteine#roadmap"
          active
        >
          Roadmap (aktiv)
        </PublicNavLink>
        <PublicNavLink to="/_bausteine#kontakt">
          Kontakt
        </PublicNavLink>
      </ShowcaseVariant>
      <ShowcaseVariant label="auf Pergament">
        <PublicNavLink
          to="/_bausteine#faq"
          tone="light"
        >
          FAQ
        </PublicNavLink>
        <PublicNavLink
          to="/_bausteine#roadmap"
          tone="light"
          active
        >
          Roadmap (aktiv)
        </PublicNavLink>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="PublicMenu"
      description="Menü der öffentlichen Seiten unter lg: Kompass öffnet eine Pergamentrolle mit den Kapiteln der Seite, den Navigationslinks und den Aktionen (Fenster schmaler als 1024 px)"
    >
      <ShowcaseVariant
        label="Auslöser"
        dark
      >
        <PublicMenu
          :chapters="[{ section: 'showcase-layout', icon: 'ui-scroll', label: 'common.publicNav.roadmap', hint: 'common.status.PLANNED' }]"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="LanguageSwitch"
      description="Sprachwahl öffentlicher Seiten: Globus mit Menü, führt zur gleichen Seite in der anderen Sprache"
    >
      <ShowcaseVariant
        label="Globus"
        dark
      >
        <LanguageSwitch />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="WingSeal"
      description="Flügelsiegel der Marke in Linien: Emblem in Footer, Karten, Köpfen und Editoren; Ton nach Untergrund"
    >
      <ShowcaseVariant
        label="navy / light / active / eigene Farbe"
        dark
      >
        <WingSeal :size="56" />
        <WingSeal
          :size="56"
          tone="light"
        />
        <WingSeal
          :size="56"
          tone="active"
        />
        <WingSeal
          :size="56"
          class="text-gold-bright"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="parchment">
        <WingSeal
          :size="64"
          tone="parchment"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="SiteFooter"
      description="Fuß aller öffentlichen Seiten: Ruinen, deren Bergkamm in den Abschnitt darüber ragt, eigener Inhalt (Standard: Aufruf der Startseite) und die Links zu Datenschutz und Impressum"
    >
      <ShowcaseVariant
        label="Standard: Aufruf der Startseite"
        dark
      >
        <div class="w-full pt-24">
          <SiteFooter heading-id="showcase-site-footer" />
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="eigener Inhalt"
        dark
      >
        <div class="w-full pt-24">
          <SiteFooter>
            <h2 class="mt-4 font-heading text-[28px] font-bold text-parchment">
              Noch Fragen?
            </h2>
            <p class="mt-3 text-parchment/85">
              Die häufigsten Antworten stehen in den FAQ.
            </p>
          </SiteFooter>
        </div>
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
