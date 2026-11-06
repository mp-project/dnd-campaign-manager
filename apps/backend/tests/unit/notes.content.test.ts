import { CreateNoteSchema } from "#src/modules/notes/domain/dto/CreateNoteDto";
import { UpdateNoteSchema } from "#src/modules/notes/domain/dto/UpdateNoteDto";
import { NOTE_CONTENT_MAX_LENGTH } from "#src/modules/notes/domain/entities/NotesTable";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";

describe("note content", () => {
  it.each([
    "<script>alert(1)</script>",
    '<iframe src="//evil"></iframe>',
    '<img src=x onerror="alert(1)">',
    "<svg onload=alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
  ])("renders raw HTML as text: %s", (text) => {
    const html = renderSafeMarkdown("MARKDOWN", text);

    expect(html).not.toMatch(/<(script|iframe|img|svg|a)\b/);
    expect(html).toContain("&lt;");
  });

  it.each([
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](&#106;avascript:alert(1))",
    "[click](vbscript:msgbox)",
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "![x](javascript:alert(1))",
  ])("drops script links: %s", (text) => {
    const html = renderSafeMarkdown("MARKDOWN", text);

    expect(html).not.toMatch(/<(a|img)\b/);
  });

  it("renders Markdown with safe links and allowed images", () => {
    const html = renderSafeMarkdown(
      "MARKDOWN",
      "# Title\n\n**bold** [site](https://example.test) ![map](https://example.test/map.png)",
    );

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain(
      '<a href="https://example.test" rel="noopener noreferrer nofollow" target="_blank">site</a>',
    );
    expect(html).toContain('<img src="https://example.test/map.png" alt="map">');
  });

  it("renders plain text as escaped paragraphs", () => {
    expect(renderSafeMarkdown("PLAIN_TEXT", "a < b\nnext\n\n<script>x</script>")).toBe(
      "<p>a &lt; b<br>\nnext</p>\n<p>&lt;script&gt;x&lt;/script&gt;</p>\n",
    );
  });

  it("renders the longest content quickly, whatever it contains", () => {
    for (const unit of ["<", "&lt;", "\n ", "[a](", "*_"]) {
      const content = unit.repeat(Math.floor(NOTE_CONTENT_MAX_LENGTH / unit.length));
      const started = performance.now();

      renderSafeMarkdown("MARKDOWN", content);
      renderSafeMarkdown("PLAIN_TEXT", content);

      expect({ unit, fast: performance.now() - started < 1_000 }).toEqual({ unit, fast: true });
    }
  });

  it("accepts any text up to the limit and only what the client may set", () => {
    const valid = { name: "Letter", noteType: "HANDOUT", content: "Hello" };

    expect(CreateNoteSchema.parse(valid)).toMatchObject({
      contentFormat: "MARKDOWN",
      status: "ACTIVE",
    });
    expect(CreateNoteSchema.safeParse({ ...valid, content: "<script>x</script>" }).success).toBe(
      true,
    );
    expect(CreateNoteSchema.safeParse({ ...valid, gmNotes: "Use the javascript: console" }).success)
      .toBe(true);
    expect(
      CreateNoteSchema.safeParse({ ...valid, content: "a".repeat(NOTE_CONTENT_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(CreateNoteSchema.safeParse({ ...valid, status: "ARCHIVED" }).success).toBe(false);
    expect(CreateNoteSchema.safeParse({ ...valid, campaignId: crypto.randomUUID() }).success).toBe(
      false,
    );
    expect(
      CreateNoteSchema.safeParse({ ...valid, tagIds: [crypto.randomUUID(), crypto.randomUUID()] })
        .success,
    ).toBe(true);
  });

  it("needs both versions and at least one field for an update", () => {
    const versions = { expectedVersion: 1, expectedAssetVersion: 1 };

    expect(UpdateNoteSchema.safeParse(versions).success).toBe(false);
    expect(UpdateNoteSchema.safeParse({ ...versions, content: "x" }).success).toBe(true);
    expect(UpdateNoteSchema.safeParse({ expectedVersion: 1, content: "x" }).success).toBe(false);
    expect(UpdateNoteSchema.safeParse({ ...versions, assetId: crypto.randomUUID() }).success).toBe(
      false,
    );
  });
});
