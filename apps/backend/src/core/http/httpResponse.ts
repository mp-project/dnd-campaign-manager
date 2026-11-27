export type HttpHeaders = Readonly<Record<string, string>>;

/**
 * What a controller answers: status, body and headers. Routes hand it to `sendHttpResponse`, so the
 * controller decides the status (201, 204 …) instead of the route.
 */
export interface IHttpResponse<T> {
  readonly statusCode: number;
  readonly data: T;
  readonly headers: HttpHeaders;
}

export class HttpResponse<T> implements IHttpResponse<T> {
  constructor(
    readonly statusCode: number,
    readonly data: T,
    readonly headers: HttpHeaders = {},
  ) {}
}

/** The part of Fastify's reply the adapter uses; typed replies of any route fit it. */
export interface HttpReply {
  code(statusCode: number): HttpReply;
  headers(values: Record<string, string>): HttpReply;
  send(payload?: unknown): HttpReply;
}

/**
 * Writes a controller's answer to the reply. A 204 sends no body. The status is set before sending, so
 * the route's response schema for that status serializes the body. A header the controller names
 * replaces one a hook set earlier under the same name.
 */
export function sendHttpResponse<T>(reply: HttpReply, response: IHttpResponse<T>): HttpReply {
  reply.code(response.statusCode);

  if (Object.keys(response.headers).length > 0) {
    reply.headers({ ...response.headers });
  }

  return response.statusCode === 204 ? reply.send() : reply.send(response.data);
}
