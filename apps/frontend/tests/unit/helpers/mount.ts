import { mount, type ComponentMountingOptions } from "@vue/test-utils";
import type { Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { type AppI18n, createAppI18n, setLocale } from "@/core/i18n";

const i18nByLocale = new Map<string, Promise<AppI18n>>();

/** One loaded i18n per language for all tests (loading the message files once). */
function i18nFor(locale: string): Promise<AppI18n> {
  let i18n = i18nByLocale.get(locale);
  if (!i18n) {
    i18n = (async () => {
      const instance = createAppI18n();
      await setLocale(instance, locale);
      return instance;
    })();
    i18nByLocale.set(locale, i18n);
  }
  return i18n;
}

export function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:path(.*)*", component: { render: () => null } }],
  });
}

/**
 * Mounts a component the way the app runs it: German messages (or `locale`) and a router.
 * Attached to the document, so teleported content (menus, dialogs) can be found in `document.body`.
 */
export async function mountWithApp<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> & { locale?: string } = {},
) {
  const { locale = "de", global, ...rest } = options;
  const router = testRouter();
  const i18n = await i18nFor(locale);
  const wrapper = mount(component, {
    attachTo: document.body,
    ...rest,
    global: { ...global, plugins: [i18n, router, ...(global?.plugins ?? [])] },
  } as ComponentMountingOptions<C>);
  return { wrapper, router };
}
