import { isIPv6 } from "node:net";

import type { FastifyRequest } from "fastify";

export const RATE_LIMIT_MAX = {
  read: 60,
  // A gallery asks for one thumbnail per file, all at once.
  mediaRead: 300,
  write: 20,
  sensitiveUser: 20,
  // Anonymous requests count per IP, which several users of one session often share.
  sensitiveIp: 120,
} as const;

/**
 * Default limit for every route, counted per user and route: using one route up does not affect
 * the budget of another route or of another user. Protects against overload and faulty clients.
 */
export const ROUTE_RATE_LIMIT = {
  max: (request: FastifyRequest) =>
    request.method === "GET" || request.method === "HEAD"
      ? RATE_LIMIT_MAX.read
      : RATE_LIMIT_MAX.write,
  timeWindow: "10 seconds",
};

/** For the routes that read media. Set it on a route with `config.rateLimit`. */
export const MEDIA_READ_ROUTE_RATE_LIMIT = {
  max: RATE_LIMIT_MAX.mediaRead,
  timeWindow: "10 seconds",
};

/**
 * Stricter limit for auth routes and routes that send email.
 * Set it on a route with `config.rateLimit`.
 */
export const SENSITIVE_ROUTE_RATE_LIMIT = {
  max: (request: FastifyRequest) =>
    request.verifiedAccessToken ? RATE_LIMIT_MAX.sensitiveUser : RATE_LIMIT_MAX.sensitiveIp,
  timeWindow: "1 minute",
};

/**
 * Normalizes a client IP for counting. An IPv6 client usually controls a whole /64 network, so
 * all of its addresses count as one.
 *
 * @param ip Client IP address.
 * @returns IPv4 address or IPv6 /64 network.
 */
export function normalizeClientIp(ip: string): string {
  const address = ip.toLowerCase().split("%")[0] ?? "";

  if (!isIPv6(address)) {
    return address;
  }

  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1];

  if (mappedIpv4) {
    return mappedIpv4;
  }

  const [head = "", tail = ""] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const zeroGroups = Array<string>(Math.max(8 - headGroups.length - tailGroups.length, 0)).fill("0");
  const network = [...headGroups, ...zeroGroups, ...tailGroups]
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16));

  return `${network.join(":")}::/64`;
}

/**
 * Builds the rate limit bucket of a request: the verified user or, without one, the client IP,
 * combined with the route pattern so `/campaigns/1` and `/campaigns/2` share one budget.
 *
 * @param request Fastify request, already authenticated by the `onRequest` hook.
 * @returns Bucket key.
 */
export function buildRateLimitKey(request: FastifyRequest): string {
  const actorId = request.verifiedAccessToken?.actorId;
  const subject = actorId ? `user:${actorId}` : `ip:${normalizeClientIp(request.ip)}`;

  return `${subject}|${request.method}|${request.routeOptions.url}`;
}
