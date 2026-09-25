import { describe, expect, it } from "vitest";
import { makeFakeDb } from "./fake-db";
import { purgeThreads, restoreThreads, trashThreads } from "@/lib/mail-trash.server";
import { MAIL_DENIED, requireMailSuperadmin } from "@/lib/mail-authz.server";

type Thread = { id: string; status: string; previous_status: string | null; trashed_at: string | null };

/** In-memory mailbox mirroring the email_threads_* SQL functions. */
function world(initial: Thread[], opts: { moveFails?: string; rpcFails?: boolean } = {}) {
  const threads = new Map(initial.map((t) => [t.id, { ...t }]));
  const messages = new Map<string, string[]>([
    ["t1", ["m1", "m2"]],
    ["t2", ["m3"]],
  ]);
  const attachments = new Map<string, string>([
    ["m1", "inbound/m1/a.pdf"],
    ["m3", "inbound/m3/b.png"],
  ]);
  const files = new Set(attachments.values());
  const audit: unknown[] = [];

  const idsOf = (ops: { method: string; args: unknown[] }[]) =>
    (ops.find((o) => o.method === "in")?.args[1] ?? []) as string[];

  const db = makeFakeDb({
    handler: (table, ops) => {
      const ids = idsOf(ops);
      if (table === "email_threads") {
        return {
          data: ids
            .filter((id) => threads.has(id))
            .map((id) => ({ ...threads.get(id), message_count: messages.get(id)?.length ?? 0 })),
          error: null,
        };
      }
      if (table === "email_messages") {
        const rows = ids.flatMap((t) => (messages.get(t) ?? []).map((id) => ({ id })));
        return { data: rows, error: null, count: rows.length };
      }
      if (table === "email_attachments") {
        return {
          data: ids.filter((m) => attachments.has(m)).map((m) => ({ storage_path: attachments.get(m) })),
          error: null,
        };
      }
      return { data: null, error: null };
    },
    move: (from, to) => {
      if (opts.moveFails && from === opts.moveFails) return { error: { message: "boom" } };
      if (!files.delete(from)) return { error: { message: "missing" } };
      files.add(to);
      return { error: null };
    },
    remove: (paths) => {
      paths.forEach((p) => files.delete(p));
      return { data: null, error: null };
    },
    rpc: (name, args) => {
      const a = args as { _thread_ids: string[]; _actor?: string };
      if (name === "email_threads_trash") {
        let n = 0;
        for (const id of a._thread_ids) {
          const t = threads.get(id);
          if (t && t.status !== "trash") {
            t.previous_status = t.status;
            t.status = "trash";
            t.trashed_at = "now";
            n++;
          }
        }
        return { data: n, error: null };
      }
      if (name === "email_threads_restore") {
        let n = 0;
        for (const id of a._thread_ids) {
          const t = threads.get(id);
          if (t && t.status === "trash") {
            t.status = t.previous_status ?? "open";
            t.previous_status = null;
            t.trashed_at = null;
            n++;
          }
        }
        return { data: n, error: null };
      }
      if (name === "email_threads_purge") {
        if (opts.rpcFails) return { data: null, error: { message: "db down" } };
        if (a._thread_ids.some((id) => threads.get(id)?.status !== "trash")) {
          return { data: null, error: { message: "thread_not_in_trash" } };
        }
        let msgs = 0;
        const paths: string[] = [];
        for (const id of a._thread_ids) {
          for (const m of messages.get(id) ?? []) {
            msgs++;
            const p = attachments.get(m);
            if (p) paths.push(p);
            attachments.delete(m);
          }
          audit.push({ actor: a._actor, entity_id: id });
          messages.delete(id);
          threads.delete(id);
        }
        return { data: { threads: a._thread_ids.length, messages: msgs, paths }, error: null };
      }
      return { data: null, error: null };
    },
  });
  return { db: db as never, threads, messages, attachments, files, audit };
}

const t = (id: string, status: string): Thread => ({
  id,
  status,
  previous_status: null,
  trashed_at: null,
});

describe("Coș: mutare și restaurare", () => {
  it("arhivată → Coș → restaurată ca arhivată", async () => {
    const w = world([t("t1", "archived")]);
    expect((await trashThreads(w.db, ["t1"])).count).toBe(1);
    expect(w.threads.get("t1")).toMatchObject({ status: "trash", previous_status: "archived" });
    expect(w.threads.get("t1")!.trashed_at).not.toBeNull();
    await restoreThreads(w.db, ["t1"]);
    expect(w.threads.get("t1")).toMatchObject({ status: "archived", trashed_at: null });
  });

  it("funcționează pe mai multe conversații odată; status anterior necunoscut → open", async () => {
    const w = world([t("t1", "open"), t("t2", "spam")]);
    expect((await trashThreads(w.db, ["t1", "t2"])).count).toBe(2);
    await restoreThreads(w.db, ["t1", "t2"]);
    expect(w.threads.get("t2")!.status).toBe("spam");
    const w2 = world([{ ...t("t1", "trash") }]);
    await restoreThreads(w2.db, ["t1"]);
    expect(w2.threads.get("t1")!.status).toBe("open");
  });
});

describe("Coș: ștergere definitivă", () => {
  it("refuză o conversație care nu e în Coș și nu atinge nimic", async () => {
    const w = world([t("t1", "archived")]);
    const res = await purgeThreads(w.db, ["t1"], "admin");
    expect(res.ok).toBe(false);
    expect(w.threads.has("t1")).toBe(true);
    expect(w.files.has("inbound/m1/a.pdf")).toBe(true);
  });

  it("șterge mesajele, conversația, atașamentele și scrie auditul", async () => {
    const w = world([t("t1", "trash"), t("t2", "trash")]);
    const res = await purgeThreads(w.db, ["t1", "t2"], "admin");
    expect(res).toMatchObject({ ok: true, threads: 2, messages: 3, attachments: 2 });
    expect(w.threads.size).toBe(0);
    expect(w.messages.size).toBe(0);
    expect(w.attachments.size).toBe(0);
    expect(w.files.size).toBe(0);
    expect(w.audit).toHaveLength(2);
  });

  it("eroare la Storage → nimic șters, fișierele puse la loc", async () => {
    const w = world([t("t1", "trash"), t("t2", "trash")], { moveFails: "inbound/m3/b.png" });
    const res = await purgeThreads(w.db, ["t1", "t2"], "admin");
    expect(res.ok).toBe(false);
    expect(w.threads.size).toBe(2);
    expect(w.messages.size).toBe(2);
    expect([...w.files].sort()).toEqual(["inbound/m1/a.pdf", "inbound/m3/b.png"]);
    expect(w.audit).toHaveLength(0);
  });

  it("eroare în baza de date → fișierele puse la loc", async () => {
    const w = world([t("t1", "trash")], { rpcFails: true });
    const res = await purgeThreads(w.db, ["t1"], "admin");
    expect(res.ok).toBe(false);
    expect(w.threads.has("t1")).toBe(true);
    expect(w.files.has("inbound/m1/a.pdf")).toBe(true);
  });
});

describe("Coș: securitate", () => {
  it("utilizator care nu e superadmin → refuzat înainte de clientul privilegiat", async () => {
    const context = { supabase: { rpc: async () => ({ data: false, error: null }) } };
    await expect(requireMailSuperadmin(context)).rejects.toThrow(MAIL_DENIED);
    const failing = { supabase: { rpc: async () => ({ data: null, error: { code: "x" } }) } };
    await expect(requireMailSuperadmin(failing)).rejects.toThrow(MAIL_DENIED);
  });
});
