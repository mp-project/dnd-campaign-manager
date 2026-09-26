<template>
  <section class="grid gap-4">
    <p class="text-sm text-ink/75">
      Dashboard page placeholder without domain logic.
    </p>

    <div class="flex flex-wrap gap-3">
      <RouterLink
        :to="{ name: 'auth-login' }"
        class="rounded-xl bg-spruce px-4 py-2 text-sm font-semibold text-white transition hover:bg-spruce/90"
      >
        Zum Login
      </RouterLink>

      <RouterLink
        :to="{ name: 'auth-register' }"
        class="rounded-xl border border-spruce/35 bg-white px-4 py-2 text-sm font-semibold text-spruce transition hover:bg-spruce/5"
      >
        Zur Registrierung
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts"></script>
