import { describe, expect, it, vi } from "vitest";

import ExpandableText from "@/components/content/ExpandableText.vue";
import MentionText from "@/components/content/MentionText.vue";
import SafeHtml from "@/components/content/SafeHtml.vue";
import StepIndicator from "@/components/content/StepIndicator.vue";
import { MENTION_OPENER, MENTION_RESOLVER, parseMentions } from "@/core/content/mentions";

import { mountWithApp } from "../helpers/mount";

describe("mentions", () => {
  it("parses mentions and leaves broken ones as text", () => {
    expect(parseMentions("Frag @[Hauptmann Rovan](npc:42) am @[Nordtor](location:n7).")).toEqual([
      { text: "Frag " },
      { mention: { name: "Hauptmann Rovan", type: "npc", id: "42" } },
      { text: " am " },
      { mention: { name: "Nordtor", type: "location", id: "n7" } },
      { text: "." },
    ]);
    expect(parseMentions("@[Kaputt](npc 42) und @[](x:1)")).toEqual([{ text: "@[Kaputt](npc 42) und @[](x:1)" }]);
    expect(parseMentions(null)).toEqual([]);
  });

  it("shows marks with the current name, strikes gone targets and opens on click", async () => {
    const open = vi.fn();
    const { wrapper } = await mountWithApp(MentionText, {
      props: { text: "@[Rovan](npc:42) trifft @[Mara](npc:7)" },
      global: {
        provide: {
          [MENTION_RESOLVER as symbol]: (ref: { id: string }) =>
            ref.id === "42" ? { name: "Hauptmann Rovan", typeLabel: "Person", gmOnly: true } : null,
          [MENTION_OPENER as symbol]: open,
        },
      },
    });
    const [rovan, mara] = wrapper.findAll("button.men");

    expect(rovan!.text()).toBe("Hauptmann Rovan");
    expect(wrapper.find(".men-card").text()).toContain("Person · Nur SL");
    expect(mara!.classes()).toContain("men-gone");
    expect(mara!.attributes("aria-label")).toBe("Mara (nicht mehr vorhanden)");

    await rovan!.trigger("click");
    await mara!.trigger("click");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ name: "Rovan", type: "npc", id: "42" });
  });

  it("shows the stored name when the resolver fails", async () => {
    const { wrapper } = await mountWithApp(MentionText, {
      props: { text: "@[Rovan](npc:42)" },
      global: { provide: { [MENTION_RESOLVER as symbol]: () => { throw new Error("offline"); } } },
    });

    expect(wrapper.find("button.men").text()).toBe("Rovan");
  });
});

describe("content", () => {
  it("expands long text", async () => {
    const { wrapper } = await mountWithApp(ExpandableText, { props: { text: "Ein langer Text" } });
    const toggle = wrapper.find("button");

    expect(toggle.text()).toBe("Mehr anzeigen");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(toggle.text()).toBe("Weniger anzeigen");
  });

  it("removes scripts, handlers and javascript links from server HTML", async () => {
    const { wrapper } = await mountWithApp(SafeHtml, {
      props: { html: '<p onclick="alert(1)">Hallo <a href="javascript:alert(1)">x</a><script>alert(1)</script><img src=x onerror=alert(1)></p>' },
    });
    const html = wrapper.html();

    expect(html).toContain("Hallo");
    expect(html).not.toMatch(/onclick|onerror|<script|javascript:/);
  });

  it("marks done, current and open steps", async () => {
    const { wrapper } = await mountWithApp(StepIndicator, {
      props: { current: "check", steps: [{ id: "file", label: "Datei" }, { id: "check", label: "Prüfen" }, { id: "import", label: "Import" }] },
    });
    const steps = wrapper.findAll("li");

    expect(wrapper.find("ol").attributes("aria-label")).toBe("Fortschritt");
    expect(steps[0]!.find("use").attributes("href")).toMatch(/#ui-check$/);
    expect(steps[1]!.attributes("aria-current")).toBe("step");
    expect(steps[2]!.text()).toContain("3");
  });
});
