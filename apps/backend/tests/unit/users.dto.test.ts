import { UpdateMeSchema } from "#src/modules/users/domain/dto/UpdateMeDto";
import { UpdateSettingsSchema } from "#src/modules/users/domain/dto/UpdateSettingsDto";

describe("users DTOs", () => {
  it("rejects empty self update payload", () => {
    expect(() => UpdateMeSchema.parse({})).toThrow();
  });

  it("accepts valid IANA timezone in settings update", () => {
    const parsed = UpdateSettingsSchema.parse({
      timezone: "Europe/Berlin",
      reducedMotion: true,
    });

    expect(parsed.timezone).toBe("Europe/Berlin");
    expect(parsed.reducedMotion).toBe(true);
  });

  it("rejects invalid timezone", () => {
    expect(() =>
      UpdateSettingsSchema.parse({
        timezone: "Mars/Olympus",
      }),
    ).toThrow();
  });
});
