import { generateUniqueUserTag, usernameFromDisplayName } from "#src/modules/auth/service/UserTag";

describe("userTag generation", () => {
  it("derives a normalized username from a display name", () => {
    expect(usernameFromDisplayName("  Jörg Mustermann  ")).toBe("jorg-mustermann");
  });

  it("retries when a generated tag already exists", async () => {
    const exists = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const userTag = await generateUniqueUserTag("mustermann", exists);

    expect(userTag).toMatch(/^mustermann#[0-9]{6}$/);
    expect(exists).toHaveBeenCalledTimes(2);
  });

  it("fails after exhausting collision retries", async () => {
    const exists = jest.fn().mockResolvedValue(true);

    await expect(generateUniqueUserTag("mustermann", exists)).rejects.toThrow(
      "Could not allocate a unique user tag",
    );
    expect(exists).toHaveBeenCalledTimes(20);
  });
});