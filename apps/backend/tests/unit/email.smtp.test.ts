import { createServer, type AddressInfo, type Server } from "node:net";

import { createSmtpEmailPort } from "#core/email/smtpEmail";
import { ServiceUnavailableError } from "#core/error/http/index";
import { maskEmail } from "#core/log/mask";

/** A port that accepts connections and closes them at once, like a mail server that is down. */
async function closingServer(): Promise<Server> {
  const server = createServer((socket) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

describe("SMTP email port", () => {
  it("answers a failed delivery with 503 and keeps the cause", async () => {
    const server = await closingServer();
    const port = createSmtpEmailPort({
      host: "127.0.0.1",
      port: (server.address() as AddressInfo).port,
      secure: false,
      fromAddress: "benachrichtigung@example.test",
      fromName: "Test",
    });

    const sending = port.send({
      purpose: "test",
      to: "someone@example.test",
      subject: "Hallo",
      text: "Text",
    });

    await expect(sending).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(sending).rejects.toMatchObject({
      statusCode: 503,
      cause: expect.any(Error),
    });

    server.close();
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
    expect(maskEmail("no-address")).toBe("***");
  });
});
