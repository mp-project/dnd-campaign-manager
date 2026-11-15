import { computed } from "vue";
import { useRoute } from "vue-router";

import { safeRedirectPath } from "@/core/auth/redirect";

/**
 * The page to open after signing in (`?redirect=`): `target` is the checked path to go to,
 * `passOn` the query that carries it from one sign-in page to the next.
 */
export function useAuthRedirect() {
  const route = useRoute();
  const target = computed(() => safeRedirectPath(route.query.redirect));
  const passOn = computed<{ redirect?: string }>(() =>
    typeof route.query.redirect === "string" ? { redirect: route.query.redirect } : {},
  );
  return { target, passOn };
}
