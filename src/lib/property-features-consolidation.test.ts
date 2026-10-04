/**
 * Corecția de date pentru vechiul grup „Facilități”: citim SQL-ul rulat o
 * singură dată și verificăm regulile care împiedică pierderea sau dublarea.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heatingOptions, miscFeatureOptions } from "./property-taxonomy";

const sql = readFileSync("supabase/data-fixes/2026-10-04-consolidate-features.sql", "utf8");
const setClause = sql.slice(sql.indexOf("update public.properties"), sql.indexOf("returning"));

describe("corecția dotărilor din „Facilități”", () => {
  it("nu modifică și nu golește coloana `features`", () => {
    expect(setClause).not.toMatch(/\bfeatures\s*=/);
  });

  it("nu dublează valorile din liste (distinct)", () => {
    const merges = sql.match(/array_agg\(distinct v order by v\)/g) ?? [];
    expect(merges.length).toBeGreaterThanOrEqual(5);
  });

  it("nu suprascrie mobilarea sau parcarea deja completate", () => {
    expect(sql).toContain("when coalesce(s.furnishing, '') = '' and 'Mobilat'");
    expect(sql).toContain("when coalesce(s.parking_spaces, 0) = 0 and 'Parcare'");
  });

  it("actualizează doar proprietățile cu diferențe și auditează doar când există", () => {
    expect(sql).toContain("from changed c");
    expect(sql).toContain("having count(*) > 0");
  });

  it("păstrează o singură ortografie „Șemineu”, în Diverse", () => {
    expect(heatingOptions).not.toContain("Semineu" as never);
    expect(miscFeatureOptions).toContain("Șemineu");
  });
});
