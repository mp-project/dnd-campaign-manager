<script setup lang="ts">
import Avatar from "@/components/base/Avatar.vue";
import Badge from "@/components/base/Badge.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import type { AvatarTone, BadgeTone } from "@/components/base/types";
import { STATUS_CODES } from "@/core/ui/status";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const tones: BadgeTone[] = ["gold", "green", "blue", "violet", "rose", "sand", "neutral", "burgundy", "ok", "warn", "danger", "info", "outline"];
const avatarTones: AvatarTone[] = ["teal", "gold", "blue", "brown", "violet", "burgundy"];
const sizes = [24, 32, 40, 56, 72];
</script>

<template>
  <ShowcaseSection
    id="badges"
    title="Badges, Status, Avatare"
  >
    <ShowcaseComponent
      name="Badge"
      description="tone, icon, dot"
    >
      <ShowcaseVariant
        label="Töne"
        wide
      >
        <Badge
          v-for="tone in tones"
          :key="tone"
          :tone="tone"
        >
          {{ tone }}
        </Badge>
      </ShowcaseVariant>
      <ShowcaseVariant label="icon">
        <Badge
          tone="gold"
          icon="ui-star"
        >
          Hauptquest
        </Badge>
        <Badge
          tone="blue"
          icon="nav-orte"
        >
          Stadt
        </Badge>
      </ShowcaseVariant>
      <ShowcaseVariant label="dot">
        <Badge
          tone="ok"
          dot
        >
          Online
        </Badge>
        <Badge
          tone="warn"
          dot
        >
          Wartet
        </Badge>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="StatusBadge"
      description="Status-Code → Ton, Symbol, übersetztes Label"
    >
      <ShowcaseVariant
        label="Alle Status-Codes"
        wide
      >
        <StatusBadge
          v-for="status in STATUS_CODES"
          :key="status"
          :status="status"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label=":icon=&quot;false&quot; / dot">
        <StatusBadge
          status="ACTIVE"
          :icon="false"
        />
        <StatusBadge
          status="PENDING"
          dot
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="Unbekannter Code (neutral, kein Fehler)">
        <StatusBadge status="SOMETHING_NEW" />
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="Avatar"
      description="Initialen oder Bild, Töne, Größen, Online-Punkt"
    >
      <ShowcaseVariant label="Töne">
        <Avatar
          v-for="tone in avatarTones"
          :key="tone"
          :tone="tone"
          initials="AM"
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="Größen">
        <Avatar
          v-for="size in sizes"
          :key="size"
          :size="size"
          initials="LI"
          tone="violet"
        />
      </ShowcaseVariant>
      <ShowcaseVariant
        label="online / offline / ring (auf Navy)"
        dark
      >
        <Avatar
          initials="LE"
          :online="true"
        />
        <Avatar
          initials="TH"
          tone="brown"
          :online="false"
        />
        <Avatar
          initials="NY"
          tone="blue"
          ring
        />
      </ShowcaseVariant>
      <ShowcaseVariant label="Bild / Bildausschnitt (crop)">
        <Avatar
          src="/assets/deko/bergsiegel-gold.svg"
          :size="56"
          tone="burgundy"
        />
        <Avatar
          src="/assets/deko/fluegelsiegel.svg"
          :size="56"
          :crop="{ x: 50, y: 50, zoom: 1.6 }"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
