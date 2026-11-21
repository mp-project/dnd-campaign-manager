<script setup lang="ts">
/**
 * Sign-in & security, all Clerk's: email addresses, password, connected accounts (Google,
 * Discord), second factor and the signed-in devices. A changed address reaches the app through
 * Clerk's webhook. Clerk's own steps (adding an address, setting a password) live under this path.
 */
import { UserProfile } from "@clerk/vue";

import ClerkPanel from "@/core/auth/ClerkPanel.vue";
</script>

<template>
  <ClerkPanel>
    <UserProfile
      routing="path"
      path="/konto/anmeldung"
    />
  </ClerkPanel>
</template>
