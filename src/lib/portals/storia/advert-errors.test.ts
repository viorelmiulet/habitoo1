import { describe, expect, it } from "vitest";
import {
  isStoriaErrorEvent,
  isStoriaRemovalSuccess,
  isStoriaSuccessEvent,
  readStoriaAdvertError,
  storiaInfoMessage,
  storiaNotificationId,
  STORIA_ERROR_MAX,
} from "./advert-errors";
import { readEventShape } from "./leads.server";

/** Payload simulat după documentația OLX (eroare de validare la publicare). */
const postedError = {
  flow: "publish_advert",
  event_type: "advert_posted_error",
  object_id: "43744f15-9268-4cda-a46e-ffa3c2b7182e",
  transaction_id: "11111111-2222-3333-4444-555555555555",
  timestamp: 1789069410,
  event_timestamp: 1789069410,
  data: {
    error: {
      summary: "Validation failed",
      detail: "The advert has invalid fields",
      validation: [
        { field: "title", messages: ["Title is too short"] },
        { field: "price.value", message: "Price must be greater than 0" },
      ],
    },
  },
};

describe("evenimente de eroare Storia", () => {
  it("recunoaște erorile și erorile de imagine", () => {
    expect(isStoriaErrorEvent("advert_posted_error")).toBe(true);
    expect(isStoriaErrorEvent("advert_put_error")).toBe(true);
    expect(isStoriaErrorEvent("advert_image_error")).toBe(true);
    expect(isStoriaErrorEvent("advert_posted_success")).toBe(false);
    expect(isStoriaErrorEvent(null)).toBe(false);
  });

  it("găsește anunțul după object_id", () => {
    expect(readEventShape(postedError)!.advertUuid).toBe("43744f15-9268-4cda-a46e-ffa3c2b7182e");
  });

  it("extrage sumarul, detaliul și erorile per câmp", () => {
    const err = readStoriaAdvertError(postedError.data, postedError.event_type);
    expect(err.recognized).toBe(true);
    expect(err.message).toContain("Storia a respins anunțul");
    expect(err.message).toContain("Validation failed");
    expect(err.message).toContain("titlu (title): Title is too short");
    expect(err.message).toContain("preț (price.value): Price must be greater than 0");
  });

  it("acceptă validarea ca obiect câmp → mesaje", () => {
    const err = readStoriaAdvertError(
      { errors: { description: ["Too short"] } },
      "advert_put_error",
    );
    expect(err.message).toContain("descriere (description): Too short");
  });

  it("tratează eroarea de imagine", () => {
    const err = readStoriaAdvertError(
      { images: [{ url: "https://x/1.jpg", reason: "Image smaller than 300px" }] },
      "advert_image_error",
    );
    expect(err.message).toContain("Storia a respins o imagine");
    expect(err.message).toContain("Image smaller than 300px");
  });

  it("păstrează brutul când structura nu e recunoscută", () => {
    const err = readStoriaAdvertError({ foo: { bar: 1 } }, "advert_posted_error");
    expect(err.recognized).toBe(false);
    expect(err.raw).toContain("foo");
  });

  it("limitează mesajul la 500 de caractere", () => {
    const err = readStoriaAdvertError({ error: { summary: "x".repeat(2000) } }, "advert_posted_error");
    expect(err.message.length).toBeLessThanOrEqual(STORIA_ERROR_MAX);
  });
});

describe("succes și stări informative", () => {
  it("recunoaște succesul și retragerile", () => {
    expect(isStoriaSuccessEvent("advert_put_success")).toBe(true);
    expect(isStoriaRemovalSuccess("advert_deleted_success")).toBe(true);
    expect(isStoriaRemovalSuccess("advert_deactivated_success")).toBe(true);
    expect(isStoriaRemovalSuccess("advert_activated_success")).toBe(false);
  });

  it("unpaid, blocked și new sunt informative, nu erori", () => {
    expect(storiaInfoMessage("unpaid")).toContain("neplătit");
    expect(storiaInfoMessage("blocked")).toContain("verificare");
    expect(storiaInfoMessage("new")).toContain("nepublicat");
    expect(storiaInfoMessage("moderated")).toBeNull();
    expect(storiaInfoMessage("active")).toBeNull();
  });

  it("aceeași tranzacție dă același id de notificare", async () => {
    const a = await storiaNotificationId(["storia_error", "org", "tx", "user"]);
    expect(a).toBe(await storiaNotificationId(["storia_error", "org", "tx", "user"]));
    expect(a).not.toBe(await storiaNotificationId(["storia_error", "org", "tx2", "user"]));
  });
});
