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

/**
 * State of the app shell: collapsed sidebar and the mobile menu. The sidebar starts as this browser
 * left it; once the profile is loaded, the account's setting applies, and the toggle button saves to
 * it (`toggleNavCollapsed`, see `app/sidebarPreference`), so it follows the account to every device.
 */
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

  /** The sidebar's own toggle button; unlike `setNavCollapsed`, it is saved to the account. */
  function toggleNavCollapsed(): void {
    setNavCollapsed(!navCollapsed.value);
  }

  function openMobileNav(focus: "content" | null = null): void {
    mobileNavFocus.value = focus;
    mobileNavOpen.value = true;
  }

  function closeMobileNav(): void {
    mobileNavOpen.value = false;
  }

  return {
    navCollapsed,
    mobileNavOpen,
    mobileNavFocus,
    setNavCollapsed,
    toggleNavCollapsed,
    openMobileNav,
    closeMobileNav,
  };
});
