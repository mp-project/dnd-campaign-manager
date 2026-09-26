export type ErrorPayload = {
  error: {
    code: string;
    message: string;
    details: unknown;
    requestId: string;
  };
};

/**
 * Creates the canonical API error payload envelope.
 *
 * @param params Error details and request correlation id.
 * @returns Serialized error payload.
 */
export function createErrorPayload(params: {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}): ErrorPayload {
  return {
    error: {
      code: params.code,
      message: params.message,
      details: params.details ?? null,
      requestId: params.requestId,
    },
  };
}
