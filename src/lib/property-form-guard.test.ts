import { describe, expect, it, vi } from "vitest";
import { FOREIGN_FORM_MESSAGE, guardedPropertyWrite } from "./property-form-guard";

describe("protecția formularului fișei", () => {
  it("formular încărcat pentru alt id → nicio scriere", async () => {
    const write = vi.fn(async () => {});
    await expect(guardedPropertyWrite({ formPropertyId: "A", routeId: "B", loadedPropertyId: "B" }, write)).rejects.toThrow(FOREIGN_FORM_MESSAGE);
    expect(write).not.toHaveBeenCalled();
  });
  it("Publică pe B după editarea lui A nu scrie câmpurile lui A", async () => {
    const write = vi.fn(async () => {});
    await expect(guardedPropertyWrite({ formPropertyId: "A", routeId: "B", loadedPropertyId: "A" }, write)).rejects.toThrow(FOREIGN_FORM_MESSAGE);
    await expect(guardedPropertyWrite({ formPropertyId: "B", routeId: "B", loadedPropertyId: "A" }, write)).rejects.toThrow(FOREIGN_FORM_MESSAGE);
    await expect(guardedPropertyWrite({ formPropertyId: null, routeId: "B", loadedPropertyId: "B" }, write)).rejects.toThrow(FOREIGN_FORM_MESSAGE);
    expect(write).not.toHaveBeenCalled();
  });
  it("formularul aceleiași proprietăți se scrie", async () => {
    const write = vi.fn(async () => {});
    await guardedPropertyWrite({ formPropertyId: "B", routeId: "B", loadedPropertyId: "B" }, write);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
