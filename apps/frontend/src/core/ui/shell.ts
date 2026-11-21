import { defineStore } from "pinia";
import { ref } from "vue";

const COLLAPSED_KEY = "questaria.navCollapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** State of the app shell: collapsed sidebar (remembered per browser) and the mobile menu. */
export const useShellStore = defineStore("shell", () => {
  const navCollapsed = ref(readCollapsed());
  const mobileNavOpen = ref(false);
  /** `content` opens the mobile menu at the content groups (world, adventure, compendium). */
  const mobileNavFocus = ref<"content" | null>(null);

  function setNavCollapsed(collapsed: boolean): void {
    navCollapsed.value = collapsed;
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // Without storage the choice lasts until the page is reloaded.
    }
  }

  function openMobileNav(focus: "content" | null = null): void {
    mobileNavFocus.value = focus;
    mobileNavOpen.value = true;
  }

  function closeMobileNav(): void {
    mobileNavOpen.value = false;
  }

  return { navCollapsed, mobileNavOpen, mobileNavFocus, setNavCollapsed, openMobileNav, closeMobileNav };
});
