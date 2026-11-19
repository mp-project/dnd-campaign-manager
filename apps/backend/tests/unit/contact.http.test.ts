import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/sha";

import type { EmailMessage } from "#core/email/port";
import { renderContactMessageEmail } from "#src/modules/contact/email/ContactMessageEmailTemplate";
import { buildTestApp } from "#test/helpers/buildTestApp";

const MESSAGE = {
  firstName: "Mira",
  lastName: "Falkenstein",
  email: "mira@example.test",
  topic: "SUPPORT",
  message: "Meine Spieler sehen die freigegebene Karte nicht.",
  privacyAccepted: true,
};

/** Moves the clock the challenge sees (issued at, minimum age, expiry). */
let clockOffset = 0;
const realNow = Date.now.bind(Date);

function contactApp(options: { recipient?: string | undefined; failSend?: boolean } = {}) {
  const sent: EmailMessage[] = [];
  const emailPort = {
    async send(message: EmailMessage) {
      if (options.failSend) throw new Error("smtp down");
      sent.push(message);
    },
  };
  const { app } = buildTestApp({
    env: {
      CONTACT_EMAIL_TO: "recipient" in options ? options.recipient : "kontakt@example.test",
      CONTACT_CHALLENGE_SECRET: "test-contact-challenge-secret-0123456789",
    },
    publicPorts: { emailPort },
  });
  const post = (payload: unknown) => app.inject({ method: "POST", url: "/api/v1/contact", payload: payload as object });

  /** A task from the API, solved like the browser solves it. */
  async function solved() {
    const response = await app.inject({ method: "GET", url: "/api/v1/contact/challenge" });
    const challenge = response.json();
    const solution = await solveChallenge({ challenge, deriveKey });
    return { challenge, solution: solution! };
  }

  /** A message with a solved task that is old enough. */
  async function message(change: Record<string, unknown> = {}) {
    const challenge = await solved();
    clockOffset += 4_000;
    return { ...MESSAGE, challenge, ...change };
  }

  return { app, sent, post, solved, message };
}

beforeEach(() => {
  clockOffset = 0;
  jest.spyOn(Date, "now").mockImplementation(() => realNow() + clockOffset);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /contact/challenge", () => {
  it("hands out a signed task that is never cached", async () => {
    const { app } = contactApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/contact/challenge" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.json();
    expect(body.parameters).toMatchObject({ algorithm: "SHA-256", cost: 1, data: { issuedAt: expect.any(Number) } });
    expect(body.parameters.expiresAt).toBeGreaterThan(body.parameters.data.issuedAt);
    expect(body.signature).toEqual(expect.any(String));
    await app.close();
  });
});

describe("POST /contact", () => {
  it("sends the message to the contact address, with the sender as reply address", async () => {
    const { app, sent, post, message } = contactApp();
    const response = await post(await message());

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "accepted" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "kontakt@example.test",
      replyTo: "mira@example.test",
      subject: "Kontaktformular: Hilfe und Probleme – Mira Falkenstein",
    });
    expect(sent[0]!.text).toContain("Meine Spieler sehen die freigegebene Karte nicht.");
    expect(sent[0]!.text).toContain("E-Mail: mira@example.test");
    await app.close();
  });

  it.each([
    ["without accepted privacy policy", { privacyAccepted: false }],
    ["without first name", { firstName: "  " }],
    ["with a line break in the name", { lastName: "Falkenstein\nBcc: x@example.test" }],
    ["with an invalid email address", { email: "keine-adresse" }],
    ["with an unknown topic", { topic: "SPAM" }],
    ["with a message that is too short", { message: "Hallo" }],
    ["with a message that is too long", { message: "x".repeat(5001) }],
    ["with fields it doesn't know", { phone: "0123" }],
  ])("refuses a message %s", async (_label, change) => {
    const { app, sent, post, message } = contactApp();
    const response = await post(await message(change));
    expect(response.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  describe("JS challenge", () => {
    it("refuses a message without a solved task", async () => {
      const { app, sent, post } = contactApp();
      const response = await post(MESSAGE);
      expect(response.statusCode).toBe(400);
      expect(sent).toHaveLength(0);
      await app.close();
    });

    it("refuses a wrong solution and a changed task", async () => {
      const { app, sent, post, message } = contactApp();
      // The key is the proof of work: only who tried the counters knows it.
      const wrong = await message();
      const key = wrong.challenge.solution.derivedKey;
      wrong.challenge.solution.derivedKey = `${key[0] === "0" ? "1" : "0"}${key.slice(1)}`;
      expect((await post(wrong)).json().error.details).toEqual({ challenge: "invalid" });

      const changed = await message();
      changed.challenge.challenge.parameters.data.issuedAt -= 60;
      expect((await post(changed)).json().error.details).toEqual({ challenge: "invalid" });
      expect(sent).toHaveLength(0);
      await app.close();
    });

    it("refuses a message sent faster than anybody can fill the form", async () => {
      const { app, sent, post, solved } = contactApp();
      const response = await post({ ...MESSAGE, challenge: await solved() });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual({ challenge: "tooFast" });
      expect(sent).toHaveLength(0);
      await app.close();
    });

    it("refuses an expired task", async () => {
      const { app, sent, post, message } = contactApp();
      const late = await message();
      clockOffset += 11 * 60_000;
      expect((await post(late)).json().error.details).toEqual({ challenge: "expired" });
      expect(sent).toHaveLength(0);
      await app.close();
    });

    it("counts every task once", async () => {
      const { app, sent, post, message } = contactApp();
      const once = await message();
      expect((await post(once)).statusCode).toBe(202);
      const again = await post(once);
      expect(again.statusCode).toBe(400);
      expect(again.json().error.details).toEqual({ challenge: "used" });
      expect(sent).toHaveLength(1);
      await app.close();
    });
  });

  it("accepts a message whose honeypot is filled, without sending it", async () => {
    const { app, sent, post, message } = contactApp();
    const response = await post(await message({ website: "https://spam.example" }));
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "accepted" });
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("is unavailable without a contact address", async () => {
    const { app, sent, post, message } = contactApp({ recipient: undefined });
    const response = await post(await message());
    expect(response.statusCode).toBe(503);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("answers 500 when the email can't be sent", async () => {
    const { app, post, message } = contactApp({ failSend: true });
    const response = await post(await message());
    expect(response.statusCode).toBe(500);
    await app.close();
  });
});

describe("contact email", () => {
  it("names sender, topic and time and keeps the message as typed", () => {
    const email = renderContactMessageEmail({
      firstName: "Mira",
      lastName: "Falkenstein",
      email: "mira@example.test",
      topic: "PRIVACY",
      message: "Zeile 1\nZeile 2",
      receivedAt: new Date("2026-11-19T10:00:00.000Z"),
    });
    expect(email.subject).toBe("Kontaktformular: Datenschutz – Mira Falkenstein");
    expect(email.text).toContain("Thema: Datenschutz");
    expect(email.text).toContain("Eingegangen: 2026-11-19T10:00:00.000Z");
    expect(email.text).toContain("Zeile 1\nZeile 2");
  });
});
