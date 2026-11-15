import { queryOptions } from "@tanstack/vue-query";

import { cachePolicy } from "@/core/api/cachePolicy";
import { meKey } from "@/core/api/queryClient";

import { listSessions, listTrustedDevices } from "./api";

export const sessionsQuery = queryOptions({
  queryKey: meKey("sessions"),
  queryFn: listSessions,
  ...cachePolicy("private"),
});

export const trustedDevicesQuery = queryOptions({
  queryKey: meKey("trusted-devices"),
  queryFn: listTrustedDevices,
  ...cachePolicy("private"),
});
