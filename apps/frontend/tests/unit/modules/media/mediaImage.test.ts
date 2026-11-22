import { afterEach, describe, expect, it, vi } from "vitest";

// The API client keeps the fetch it finds when it is created, so the fake server comes first.
const server = vi.hoisted(() => {
  const state = {
    links: new Map<string, string>(),
    calls: [] as Array<{ method: string; path: string; query: string; body: unknown }>,
  };
  globalThis.fetch = (async (request: Request) => {
    const url = new URL(request.url);
    const text = await request.text();
    const body = text ? (JSON.parse(text) as { mediaIds: string[] }) : null;
    state.calls.push({ method: request.method, path: url.pathname, query: url.search, body });
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    const answer = (mediaId: string) => {
      const link = state.links.get(mediaId);
      return link ? { mediaId, url: link, expiresAt, expiresInSeconds: 300, mimeType: "image/png" } : null;
    };
    if (request.method === "POST") {
      const data = body!.mediaIds.map(answer).filter((link) => link !== null);
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const link = answer(url.pathname.split("/").at(-2)!);
    return link
      ? new Response(JSON.stringify(link), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "-" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
  }) as typeof fetch;
  return state;
});

import { VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import { createAppQueryClient } from "@/core/api/queryClient";
import MediaImage from "@/modules/media/components/MediaImage.vue";

import { mountWithApp } from "../../helpers/mount";

const CAMPAIGN_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const ID = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function gallery(ids: string[], variant?: "thumbnail") {
  return defineComponent({
    render: () => ids.map((mediaId) => h(MediaImage, { campaignId: CAMPAIGN_ID, mediaId, alt: `Bild ${mediaId}`, variant })),
  });
}

async function settle() {
  await vi.waitFor(() => expect(server.calls.length).toBeGreaterThan(0));
  await flushPromises();
}

describe("MediaImage", () => {
  afterEach(() => {
    server.links.clear();
    server.calls.length = 0;
    document.body.innerHTML = "";
  });

  it("asks for the signed link and shows it", async () => {
    server.links.set(ID(1), "https://storage.example/1?sig=a");
    const { wrapper } = await mountWithApp(MediaImage, {
      props: { campaignId: CAMPAIGN_ID, mediaId: ID(1), alt: "Karte von Elaria", variant: "thumbnail" },
    });
    await settle();

    const img = wrapper.get("img");
    expect(img.attributes("src")).toBe("https://storage.example/1?sig=a");
    expect(img.attributes("alt")).toBe("Karte von Elaria");
    expect(server.calls).toEqual([
      expect.objectContaining({ method: "GET", path: `/api/v1/campaigns/${CAMPAIGN_ID}/media/${ID(1)}/link`, query: "?variant=thumbnail" }),
    ]);
  });

  it("asks for the images of a page in one request", async () => {
    server.links.set(ID(1), "https://storage.example/1");
    server.links.set(ID(2), "https://storage.example/2");
    // The app's client: a 404 is not asked for again.
    const { wrapper } = await mountWithApp(gallery([ID(1), ID(2), ID(3)], "thumbnail"), {
      global: { plugins: [[VueQueryPlugin, { queryClient: createAppQueryClient() }]] },
    });
    await settle();

    expect(server.calls).toEqual([
      expect.objectContaining({
        method: "POST",
        path: `/api/v1/campaigns/${CAMPAIGN_ID}/media/links`,
        body: { mediaIds: [ID(1), ID(2), ID(3)], variant: "thumbnail" },
      }),
    ]);
    expect(wrapper.findAll("img").map((img) => img.attributes("src"))).toEqual(["https://storage.example/1", "https://storage.example/2"]);
    // The file the answer left out shows the image symbol with its description.
    expect(wrapper.find(`[aria-label="Bild ${ID(3)}"]`).exists()).toBe(true);
  });

  it("takes a fresh link when the old one fails to load, then shows the image symbol", async () => {
    server.links.set(ID(1), "https://storage.example/old");
    const { wrapper } = await mountWithApp(MediaImage, {
      props: { campaignId: CAMPAIGN_ID, mediaId: ID(1), alt: "Karte" },
    });
    await settle();

    server.links.set(ID(1), "https://storage.example/new");
    await wrapper.get("img").trigger("error");
    await vi.waitFor(() => expect(wrapper.find("img").attributes("src")).toBe("https://storage.example/new"));

    await wrapper.get("img").trigger("error");
    await flushPromises();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find('[aria-label="Karte"]').exists()).toBe(true);
    expect(server.calls).toHaveLength(2);
  });

  it("loads the same link once more when the server has no other, e.g. after a network hiccup", async () => {
    server.links.set(ID(1), "https://storage.example/same");
    const { wrapper } = await mountWithApp(MediaImage, {
      props: { campaignId: CAMPAIGN_ID, mediaId: ID(1), alt: "Karte" },
    });
    await settle();

    const first = wrapper.get("img").element;
    await wrapper.get("img").trigger("error");
    await vi.waitFor(() => expect(wrapper.get("img").element).not.toBe(first));
    expect(wrapper.get("img").attributes("src")).toBe("https://storage.example/same");

    await wrapper.get("img").trigger("error");
    await flushPromises();
    expect(wrapper.find("img").exists()).toBe(false);
  });

  it("gives an image that loaded another try when it fails later", async () => {
    server.links.set(ID(1), "https://storage.example/same");
    const { wrapper } = await mountWithApp(MediaImage, {
      props: { campaignId: CAMPAIGN_ID, mediaId: ID(1), alt: "Karte" },
    });
    await settle();

    const first = wrapper.get("img").element;
    await wrapper.get("img").trigger("error");
    await vi.waitFor(() => expect(wrapper.get("img").element).not.toBe(first));
    await wrapper.get("img").trigger("load");

    await wrapper.get("img").trigger("error");
    await flushPromises();
    expect(wrapper.find("img").exists()).toBe(true);
  });
});
