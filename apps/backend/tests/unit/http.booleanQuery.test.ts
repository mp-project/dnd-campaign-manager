import { booleanQueryDto } from "#core/http/dto";

describe("booleanQueryDto", () => {
  it("reads the text instead of checking that it is non-empty", () => {
    expect(booleanQueryDto.parse("true")).toBe(true);
    expect(booleanQueryDto.parse("false")).toBe(false);
  });

  it("keeps parsed values valid for the second parse in the controller", () => {
    expect(booleanQueryDto.parse(booleanQueryDto.parse("true"))).toBe(true);
    expect(booleanQueryDto.parse(booleanQueryDto.parse("false"))).toBe(false);
  });

  it.each(["0", "1", "", "abc", "TRUE"])("rejects %p", (value) => {
    expect(() => booleanQueryDto.parse(value)).toThrow();
  });
});
