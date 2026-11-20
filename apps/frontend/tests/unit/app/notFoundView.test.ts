import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { frontendModules } from "@/app/modules";
import { buildRoutes } from "@/app/router";
import NotFoundView from "@/app/views/NotFoundView.vue";
import { meQuery } from "@/core/auth/session";
import { installAppHead } from "@/core/seo/appHead";

import { mountWithApp } from "../helpers/mount";

async function open(options: { url?: string; locale?: string; signedIn?: boolean } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes(frontendModules) });
  installAppHead(router);
  await router.push(options.url ?? "/gibt-es-nicht");
  const queryClient = new QueryClient();
  if (options.signedIn) queryClient.setQueryData(meQuery.queryKey, { id: "u1" } as never);
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const { wrapper } = await mountWithApp(NotFoundView, {
    router,
    locale: options.locale ?? "de",
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });
  await flushPromises();
  return { wrapper, fetchSpy };
}

const hrefs = (wrapper: Awaited<ReturnType<typeof open>>["wrapper"]) =>
  wrapper.findAll("main a").map((link) => [link.text(), link.attributes("href")]);

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = "";
});

describe("not-found page", () => {
  it("names the problem and leads a visitor to the start page, the FAQ and the contact form", async () => {
    const { wrapper, fetchSpy } = await open();
    expect(wrapper.find("h1").text()).toBe("Seite nicht gefunden");
    expect(hrefs(wrapper)).toEqual([
      ["Zur Startseite", "/"],
      ["FAQ", "/faq"],
      ["Kontakt", "/kontakt"],
    ]);
    // The footer of every public page, and no request: it is prerendered as 404.html.
    expect(wrapper.find("footer nav").exists()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("leads a signed-in account to its campaigns first", async () => {
    const { wrapper } = await open({ signedIn: true });
    expect(hrefs(wrapper).map(([label]) => label)).toEqual(["Zum Dashboard", "Zur Startseite", "FAQ", "Kontakt"]);
    wrapper.unmount();
  });

  it("has a title, stays out of search results and names no canonical address", async () => {
    const { wrapper } = await open({ url: "/en/unbekannt", locale: "en" });
    expect(document.title).toBe("Page not found – Chronik");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    await vi.waitFor(() => expect(document.documentElement.dataset.prerendered).toBe("ready"));
    wrapper.unmount();
    expect(document.documentElement.dataset.prerendered).toBeUndefined();
  });
});
