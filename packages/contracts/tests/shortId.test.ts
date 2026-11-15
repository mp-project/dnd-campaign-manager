import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { fromShortId, parseRefSegment, SHORT_ID_LENGTH, toRefSegment, toShortId } from "../src/index.ts";

describe("short ids", () => {
  it("turns UUIDs into 22 characters and back without loss", () => {
    for (let n = 0; n < 500; n += 1) {
      const uuid = randomUUID();
      const shortId = toShortId(uuid);
      assert.equal(shortId.length, SHORT_ID_LENGTH);
      assert.match(shortId, /^[1-9A-HJ-NP-Za-km-z]+$/);
      assert.equal(fromShortId(shortId), uuid);
    }
  });

  it("keeps the edges and ignores the case of the UUID", () => {
    const zero = "00000000-0000-0000-0000-000000000000";
    const max = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    assert.equal(toShortId(zero), "1".repeat(SHORT_ID_LENGTH));
    assert.equal(fromShortId(toShortId(zero)), zero);
    assert.equal(fromShortId(toShortId(max)), max);
    assert.equal(toShortId("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"), toShortId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
  });

  it("refuses what isn't a short id", () => {
    assert.equal(fromShortId(""), null);
    assert.equal(fromShortId("1".repeat(21)), null);
    assert.equal(fromShortId("0".repeat(SHORT_ID_LENGTH)), null);
    assert.equal(fromShortId("z".repeat(SHORT_ID_LENGTH)), null, "larger than 128 bits");
    assert.throws(() => toShortId("not-a-uuid"), TypeError);
  });

  it("builds and reads URL segments; only the short id counts", () => {
    const uuid = randomUUID();
    const segment = toRefSegment(uuid, "die-schatten-von-elaria");
    assert.equal(segment, `${toShortId(uuid)}-die-schatten-von-elaria`);
    assert.deepEqual(parseRefSegment(segment), { id: uuid, slug: "die-schatten-von-elaria" });
    assert.deepEqual(parseRefSegment(toShortId(uuid)), { id: uuid, slug: "" });
    assert.equal(toRefSegment(uuid, ""), toShortId(uuid));
    assert.equal(parseRefSegment(`${toShortId(uuid)}x-slug`), null);
    assert.equal(parseRefSegment("kupferkrug"), null);
  });
});
