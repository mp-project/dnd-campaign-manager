/**
 * The uuid checks of the backend, in one place.
 *
 * `UUID_PATTERN` accepts every value a Postgres `uuid` column accepts in canonical form; use it to
 * decide whether a value can be looked up as an id (free text must not reach a uuid column).
 * `RFC_UUID_PATTERN` additionally requires an RFC 9562 version (1–8) and variant; use it to
 * validate ids that this application or a client created.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RFC_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
