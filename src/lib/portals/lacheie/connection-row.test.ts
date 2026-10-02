import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ensureLaCheieConnectionRow,
  LACHEIE_CONNECTION_CREATE_ERROR,
  PORTAL_CONNECTION_STATUSES,
} from "./connection-row";

function fakeAdmin(opts: { existingAfterConflict?: unknown; insertError?: { code: string } | null }) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  let reads = 0;
  const admin = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => {
        reads += 1;
        if (q._insert) {
          return opts.insertError ? { data: null, error: opts.insertError } : { data: { id: "new", ...(q._insert as object) }, error: null };
        }
        return { data: reads > 1 ? (opts.existingAfterConflict ?? null) : null, error: null };
      };
      q.insert = (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        q._insert = row;
        return table === "portal_operation_logs" ? Promise.resolve({ error: null }) : q;
      };
      return q;
    },
  };
  return { admin, inserts };
}

describe("ensureLaCheieConnectionRow", () => {
  it("creează rândul cu status permis", async () => {
    const { admin, inserts } = fakeAdmin({});
    const row = await ensureLaCheieConnectionRow(admin, "org", "u");
    expect(row.status).toBe("not_configured");
    expect(PORTAL_CONNECTION_STATUSES).toContain(inserts[0]!.row.status as never);
  });
  it("la conflict unic refolosește rândul existent", async () => {
    const { admin } = fakeAdmin({ insertError: { code: "23505" }, existingAfterConflict: { id: "old" } });
    expect(await ensureLaCheieConnectionRow(admin, "org", "u")).toEqual({ id: "old" });
  });
  it("altă eroare: jurnal fără date sensibile și mesaj clar", async () => {
    const { admin, inserts } = fakeAdmin({ insertError: { code: "23514" } });
    await expect(ensureLaCheieConnectionRow(admin, "org", "u")).rejects.toThrow(LACHEIE_CONNECTION_CREATE_ERROR);
    const log = inserts.find((i) => i.table === "portal_operation_logs")!;
    expect(log.row.success).toBe(false);
    expect(log.row.error_code).toBe("23514");
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("statusurile scrise în portal_connections", () => {
  it("dezactivarea La Cheie scrie disconnected", () => {
    const src = readFileSync("src/lib/portals/lacheie.functions.ts", "utf8");
    expect(src).toContain('status: "disconnected", activated: false');
    expect(src).not.toContain('status: "disabled"');
  });
  it("toate valorile sunt în lista permisă", () => {
    const bad: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      const re = /from\("portal_connections"\)([\s\S]{0,700}?)(?:;\s*\n|\.from\()/g;
      for (const m of src.matchAll(re)) {
        const body = m[1]!;
        if (!/\.(insert|update|upsert)\(/.test(body)) continue;
        for (const s of body.matchAll(/\bstatus:\s*"([a-z_]+)"/g)) {
          if (!(PORTAL_CONNECTION_STATUSES as readonly string[]).includes(s[1]!)) bad.push(`${file}: ${s[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
