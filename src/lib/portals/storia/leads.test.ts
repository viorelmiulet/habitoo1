import { describe, expect, it } from "vitest";
import {
  parseStoriaAdIds,
  parseStoriaAdSlugs,
  storiaAdSlugFromUrl,
  withStoriaAdSlug,
} from "./adverts.server";
import { parseStoriaCustomId, readEventShape, readMessagePayload } from "./leads.server";

/** Payload real din jurnal (test App Manager, `flow: publish_advert`). */
const lifecyclePayload = {
  destination: "https://crm.habitoo.ro/api/public/portal/v1/storia/notifications",
  timestamp: 1789069410,
  event_timestamp: 1789069410,
  transaction_id: "3e2d3d2f-ccaf-4da7-b7ea-97234e78470f",
  object_id: "43744f15-9268-4cda-a46e-ffa3c2b7182e",
  flow: "publish_advert",
  data: {
    activated_at: "2026-09-10T19:43:30Z",
    code: "active",
    moderation: { reason: null, description: null },
    url: "https://www.storia.ro/ro/oferta/apartament-IDabc.html",
  },
  event_type: "advert_posted_success",
};

/** Structura exactă a payloadului real, cu valorile personale anonimizate. */
const messagePayload = {
  data: {
    ad_id: "IwcT",
    message: {
      name: "John Doe",
      text: "Sunt interesat de apartament, se poate vedea sâmbătă?",
    },
  },
  destination: "https://crm.habitoo.ro/api/public/portal/v1/storia/notifications",
  event_type: "incoming_message_success",
  flow: "incoming_message",
  object_id: "6073df05-2979-4372-a552-4c906a02a5cc",
  event_timestamp: 1531735505952,
  timestamp: 1524148443449,
  transaction_id: "b480075b-43de-11e8-a691-55a1dd521900",
};

describe("readEventShape", () => {
  it("citește uuid-ul anunțului din payload-ul real de ciclu de viață", () => {
    const shape = readEventShape(lifecyclePayload)!;
    expect(shape.flow).toBe("publish_advert");
    expect(shape.advertUuid).toBe("43744f15-9268-4cda-a46e-ffa3c2b7182e");
    expect(shape.transactionId).toBe("3e2d3d2f-ccaf-4da7-b7ea-97234e78470f");
  });

  it("nu confundă uuid-ul mesajului cu cel al anunțului", () => {
    const shape = readEventShape(messagePayload)!;
    expect(shape.flow).toBe("incoming_message");
    expect(shape.advertUuid).toBeNull();
    expect(shape.adSlug).toBe("IwcT");
  });

  it("extrage expeditorul și mesajul", () => {
    const message = readMessagePayload(readEventShape(messagePayload)!);
    expect(message.senderName).toBe("John Doe");
    expect(message.email).toBeNull();
    expect(message.phone).toBeNull();
    expect(message.body).toBe("Sunt interesat de apartament, se poate vedea sâmbătă?");
    expect(message.messageId).toBeNull();
    expect(message.sentAt).toBeNull();
  });

  it("tratează payload-ul gol fără să arunce", () => {
    expect(readEventShape(null)).toBeNull();
    expect(readEventShape("text")).toBeNull();
  });
});

describe("identificatori", () => {
  it("parsează identificatorul propriu trimis la publicare", () => {
    expect(parseStoriaCustomId("HBT-13e713e9-9066-412f-afac-2306b042d5b8-SALE")).toEqual({
      propertyId: "13e713e9-9066-412f-afac-2306b042d5b8",
      transaction: "sale",
    });
    expect(parseStoriaCustomId("altceva")).toBeNull();
  });

  it("memorează slug-ul canonic fără să piardă uuid-urile", () => {
    const external = "SALE:43744f15-9268-4cda-a46e-ffa3c2b7182e";
    const updated = withStoriaAdSlug(external, "IwcT");
    expect(updated).toBe(`${external}|ADSLUG:IwcT`);
    expect(parseStoriaAdSlugs(updated)).toEqual(["IwcT"]);
    expect(withStoriaAdSlug(updated, "IwcT")).toBe(updated);
  });

  it("citește segmentele AD vechi doar pentru compatibilitate", () => {
    expect(parseStoriaAdIds("SALE:uuid|AD:9846457")).toEqual(["9846457"]);
  });

  it("extrage slug-ul din link în notificarea de ciclu de viață", () => {
    const shape = readEventShape(lifecyclePayload)!;
    expect(shape.publicUrl).toBe("https://www.storia.ro/ro/oferta/apartament-IDabc.html");
    expect(shape.adSlug).toBe("abc");
  });

  it("citește id-ul alfanumeric din formatul real al linkului Storia", () => {
    // Format confirmat pe un anunț live din contul agenției.
    expect(storiaAdSlugFromUrl("https://www.storia.ro/ro/oferta/apartament-test-IDIwcT.html")).toBe(
      "IwcT",
    );
    expect(storiaAdSlugFromUrl(null)).toBeNull();
    expect(storiaAdSlugFromUrl("https://www.storia.ro/ro/rezultate/vanzare")).toBeNull();
  });
});
