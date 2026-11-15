import { describe, expect, it } from "vitest";

import Avatar from "@/components/base/Avatar.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import { STATUS_CODES, statusDefinition } from "@/core/ui/status";

import { mountWithApp } from "../helpers/mount";

describe("status badges", () => {
  it("shows tone, icon and the translated label of a status code", async () => {
    const { wrapper } = await mountWithApp(StatusBadge, { props: { status: "DRAFT" } });

    expect(wrapper.classes()).toEqual(expect.arrayContaining(["badge", "badge-neutral"]));
    expect(wrapper.text()).toBe("Entwurf");
    expect(wrapper.find("use").attributes("href")).toMatch(/#ui-file$/);
  });

  it("shows an unknown status neutral with its code instead of failing", async () => {
    const { wrapper } = await mountWithApp(StatusBadge, { props: { status: "SOMETHING_NEW" } });

    expect(wrapper.classes()).toContain("badge-neutral");
    expect(wrapper.text()).toBe("SOMETHING_NEW");
    expect(wrapper.find("svg").exists()).toBe(false);
  });

  it("has a label for every status in every language", async () => {
    for (const locale of ["de", "en"]) {
      for (const status of STATUS_CODES) {
        const { wrapper } = await mountWithApp(StatusBadge, { props: { status }, locale });
        expect(wrapper.text(), `${locale} ${status}`).not.toBe("");
        expect(wrapper.text()).not.toContain("common.status");
        wrapper.unmount();
      }
    }
    expect(statusDefinition("ARCHIVED")).toMatchObject({ known: true, tone: "neutral" });
  });
});

describe("avatar", () => {
  it("shows initials, tone and the presence dot", async () => {
    const { wrapper } = await mountWithApp(Avatar, { props: { initials: "LM", tone: "violet", online: true } });

    expect(wrapper.text()).toBe("LM");
    expect(wrapper.classes()).toContain("bg-avatar-violet");
    expect(wrapper.find("[title='Online']").classes()).toContain("bg-ok");
  });
});
