import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { buildDuplicatedProperty, duplicateStoragePath } from "@/lib/property-duplicate";

describe("property duplication", () => {
  it("copies descriptive fields and resets publication/runtime state", () => {
    const source = {
      id: "source-id",
      organization_id: "org-id",
      title: "Apartament central",
      reference: "RF-1007",
      status: "active",
      publish_status: "published",
      published_at: "2026-09-10T10:00:00Z",
      external_id: "legacy-external",
      deleted_at: null,
      last_activity_at: "2026-09-10T11:00:00Z",
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-10T10:00:00Z",
      created_by: "old-user",
      updated_by: "old-user",
      utilities: ["electricitate", "apa"],
      wall_finishes: ["vopsea lavabila"],
      appliances: ["frigider"],
      lat: 44.4268,
      lng: 26.1025,
      location_precise: true,
      collaboration: true,
      collab_commission_percent: 2.5,
      collab_terms: "Comision împărțit egal",
    } as Tables<"properties">;

    const result = buildDuplicatedProperty(source, {
      organizationId: "org-id",
      actorId: "new-user",
      reference: "RF-1008",
    });

    expect(result).toMatchObject({
      title: "Apartament central",
      reference: "RF-1008",
      status: "draft",
      publish_status: "draft",
      published_at: null,
      external_id: null,
      utilities: ["electricitate", "apa"],
      wall_finishes: ["vopsea lavabila"],
      appliances: ["frigider"],
      lat: 44.4268,
      lng: 26.1025,
      location_precise: true,
      collaboration: true,
      collab_commission_percent: 2.5,
      collab_terms: "Comision împărțit egal",
      created_by: "new-user",
      updated_by: "new-user",
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("created_at");
  });

  it("creates independent paths under the destination property", () => {
    const first = duplicateStoragePath(
      "org",
      "new-property",
      "org/old-property/photo.jpg",
      "photo.jpg",
    );
    const second = duplicateStoragePath(
      "org",
      "new-property",
      "org/old-property/photo.jpg",
      "photo.jpg",
    );
    expect(first).toMatch(/^org\/new-property\/.+-photo\.jpg$/);
    expect(second).not.toBe(first);
  });
});
