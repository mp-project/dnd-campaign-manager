import type { Router } from "vue-router";

import { publicPageOf } from "./publicPages";

const MARK = "data-app-robots";

/**
 * Every page that is not a public page (the app, sign-in steps, the not-found page, development
 * pages) says `noindex`: accounts and campaigns are private, and these addresses don't help anyone
 * searching. Public pages set their own head with `usePageMeta`.
 */
export function installAppHead(router: Router): void {
  router.afterEach((to) => {
    const existing = document.head.querySelector<HTMLMetaElement>(`meta[${MARK}]`);
    if (publicPageOf(to)) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const robots = document.createElement("meta");
    robots.setAttribute(MARK, "");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
  });
}
