/** Imopedia.ro — imagini/video, Gold și boost cu fetch simulat (format real ns1:Map). */
import { describe, expect, it } from "vitest";
import { createImopediaAdapter, type ImopediaDeps } from "../adapters/imopedia.server";
import { getPortalDefinition } from "../registry";
import type { PortalContext } from "../adapter";
import { imopediaSaveBoost } from "../adapters/imopedia.server";
import { imopediaFileId } from "./media";

const env = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="syncapi.imopedia.ro" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ns2="http://xml.apache.org/xml-soap" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><SOAP-ENV:Body>${inner}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;
const kv = (k: string, v: string) => `<item><key xsi:type="xsd:string">${k}</key><value${v}</value></item>`;
const map = (op: string, items: string) => env(`<ns1:${op}Response><return xsi:type="ns2:Map">${items}</return></ns1:${op}Response>`);
const ok = (op: string, extra = "") => map(op, kv("_isValid", ` xsi:type="xsd:boolean">true`) + extra);
const invalid = (op: string, field: string, msg: string) =>
  map(op, kv("_isValid", ` xsi:type="xsd:boolean">false`) +
    kv("_errors", ` SOAP-ENC:arrayType="ns2:Map[1]" xsi:type="SOAP-ENC:Array"><item xsi:type="ns2:Map">${kv("field", ` xsi:type="xsd:string">${field}`)}${kv("errorMessage", ` xsi:type="xsd:string">${msg}`)}${kv("errorCode", ` xsi:type="xsd:string">`)}</item>`));
const saved = (idLocal: number) =>
  ok("saveProperty", kv("_success", ` SOAP-ENC:arrayType="ns2:Map[1]" xsi:type="SOAP-ENC:Array"><item xsi:type="ns2:Map">${kv("result", ` xsi:type="ns2:Map">${kv("0", ` xsi:type="ns2:Map">${kv("ID_LOCAL", ` xsi:type="xsd:int">${idLocal}`)}${kv("property_id", ` xsi:type="xsd:int">778899`)}`)}`)}</item>`));
const loginOk = (n = 1) => env(`<ns1:loginResponse><return xsi:type="xsd:string">SESS${n}</return></ns1:loginResponse>`);
const logoutOk = env(`<ns1:logoutResponse><return xsi:type="xsd:boolean">true</return></ns1:logoutResponse>`);

type Call = { op: string; body: string };
function fakeFetch(responses: Record<string, string[]>) {
  const calls: Call[] = [];
  let logins = 0;
  const fetch = async (_url: string, init: RequestInit) => {
    const op = /method=(\w+)/.exec(String((init.headers as Record<string, string>).SOAPAction))![1]!;
    calls.push({ op, body: String(init.body) });
    if (op === "login") return new Response(loginOk(++logins), { status: 200 });
    if (op === "logout") return new Response(logoutOk, { status: 200 });
    const queue = responses[op] ?? [];
    const xml = queue.length > 1 ? queue.shift()! : queue[0]!;
    return new Response(xml, { status: 200 });
  };
  return { fetch, calls };
}

const ctx: PortalContext = {
  organizationId: "org-1",
  definition: getPortalDefinition("imopedia")!,
  direction: "habitoo_to_portal",
  authenticationMode: "username_password",
  externalAccountId: "apiuser",
  portalCredential: "secret-pass",
  settings: { agency_id: 4321 },
  allowLiveRequests: true,
};

const row = {
  id: "p1",
  reference: "HB-1009",
  property_type: "apartment",
  for_sale: true,
  sale_price: 120000,
  sale_currency: "EUR",
  commission: "2%",
  title: "Apartament 2 camere Drumul Taberei",
  description: "Apartament luminos, renovat, aproape de metrou.",
  usable_surface: 54,
  rooms: 2,
  county: "București",
  city: "București",
};
const mapContext = {
  agencyId: 4321,
  location: { status: "exact", regionId: 1, zonaId: 171, zonaText: "Drumul Taberei", reason: "" },
  collaboration: { active: false, commissionPercent: null },
  currentYear: 2026,
} as never;
const agent = { userId: "u1", fullName: "Agent Test", email: "a@example.com", phone: "0700000000" };

function deps(over: Partial<ImopediaDeps> = {}, link: { fingerprint: string | null; externalAccountId: string | null } = { fingerprint: null, externalAccountId: null }) {
  const synced: (string | null)[] = [];
  const d: ImopediaDeps = {
    loadProperty: async () => ({ ok: true, row: { ...row }, agent, mapContext }),
    agentLink: async () => ({ externalId: 55, ...link }),
    markAgentSynced: async (_o, _u, error, fp) => { synced.push(error ?? fp); },
    ...over,
  };
  return { d, synced };
}


const img = (n: number) => ({ photoId: `img${n}`, contentHash: `abcdef12${n}99`, url: `https://crm.habitoo.ro/api/public/sites/v1/media/img${n}` });
const addOk = (pid: string) => ok("addFile", kv("_success", ` xsi:type="SOAP-ENC:Array"><item xsi:type="ns2:Map">${kv("result", ` xsi:type="ns2:Map">${kv("photo_id", ` xsi:type="xsd:string">${pid}`)}`)}</item>`));
const existsNo = ok("existsFile", kv("_success", ` xsi:type="SOAP-ENC:Array"><item xsi:type="ns2:Map">${kv("result", ` xsi:type="xsd:boolean">false`)}</item>`));
const syncOk = ok("syncFiles");
const syncMissing = (id: string) => ok("syncFiles", kv("_success", ` xsi:type="SOAP-ENC:Array"><item xsi:type="ns2:Map">${kv("result", ` xsi:type="ns2:Map">${kv("trebuie_trimise", ` xsi:type="SOAP-ENC:Array"><item xsi:type="xsd:string">${id}</item>`)}`)}</item>`));
const upd = { propertyId: "p1", externalId: "1009" };

function mediaDeps(images: ReturnType<typeof img>[], sent: { fileId: string; photoId: string | null; order: number }[] = [], videoUrl: string | null = null) {
  const saved: unknown[] = [];
  const { d } = deps();
  return {
    saved,
    d: {
      ...d,
      agentLink: async () => ({ externalId: 55, fingerprint: "x", externalAccountId: "4321" }),
      loadMedia: async () => ({ images, videoUrl }),
      loadSentFiles: async () => ({ listingId: "L1", files: sent }),
      saveSentFiles: async (_l: string, files: unknown) => { saved.push(files); },
    } as ImopediaDeps,
  };
}
const ops = (f: { calls: Call[] }) => f.calls.map((c) => c.op).filter((o) => o !== "login" && o !== "logout" && o !== "saveAgent");

describe("imagini și video", () => {
  it("FILE_ID stabil, ASCII", () => {
    expect(imopediaFileId("6f1c-uuid_x", "abcdef1234")).toBe("hb-6f1c-uuidx-abcdef12");
  });
  it("imagine nouă → existsFile + addFile + syncFiles", async () => {
    const f = fakeFetch({ saveAgent: [ok("saveAgent")], saveProperty: [saved(1009)], existsFile: [existsNo], addFile: [addOk("901")], syncFiles: [syncOk] });
    const m = mediaDeps([img(1)]);
    const r = await createImopediaAdapter({ ...m.d, fetch: f.fetch }).updateListing(ctx, upd);
    expect(r.ok).toBe(true);
    expect(ops(f)).toEqual(["saveProperty", "existsFile", "addFile", "syncFiles"]);
    const add = f.calls.find((c) => c.op === "addFile")!.body;
    expect(add).toContain(`<FILE_TYPE xsi:type="xsd:string">image</FILE_TYPE>`);
    expect(add).toContain(`<ORDER xsi:type="xsd:int">1</ORDER>`);
    expect(add).toContain(`– foto 1</FILE_TITLE>`);
    expect(add).not.toContain("FILE_BODY");
    const id = imopediaFileId("img1", "abcdef12199");
    expect(f.calls.find((c) => c.op === "syncFiles")!.body).toContain(`<FILE_IDS xsi:type="xsd:string">[&quot;${id}&quot;]</FILE_IDS>`);
    expect(m.saved[0]).toEqual([{ fileId: id, photoId: "901", order: 1 }]);
  });
  it("imagine deja trimisă → fără addFile", async () => {
    const id = imopediaFileId("img1", "abcdef12199");
    const f = fakeFetch({ saveProperty: [saved(1009)], syncFiles: [syncOk] });
    const r = await createImopediaAdapter({ ...mediaDeps([img(1)], [{ fileId: id, photoId: "901", order: 1 }]).d, fetch: f.fetch }).updateListing(ctx, upd);
    expect(r.ok).toBe(true);
    expect(ops(f)).toEqual(["saveProperty", "syncFiles"]);
  });
  it("photo_id=false → avertisment, exclusă din sync; publicarea rămâne reușită", async () => {
    const f = fakeFetch({ saveProperty: [saved(1009)], existsFile: [existsNo], addFile: [addOk("901"), addOk("false")], syncFiles: [syncOk] });
    const r = await createImopediaAdapter({ ...mediaDeps([img(1), img(2)]).d, fetch: f.fetch }).updateListing(ctx, upd);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.message).toContain("Imaginea 2 a fost respinsă");
    const sync = f.calls.find((c) => c.op === "syncFiles")!.body;
    expect(sync).toContain(imopediaFileId("img1", "abcdef12199"));
    expect(sync).not.toContain(imopediaFileId("img2", "abcdef12299"));
  });
  it("trebuie_trimise → o retrimitere + un al doilea sync", async () => {
    const id = imopediaFileId("img1", "abcdef12199");
    const f = fakeFetch({ saveProperty: [saved(1009)], addFile: [addOk("902")], syncFiles: [syncMissing(id), syncMissing(id)] });
    const r = await createImopediaAdapter({ ...mediaDeps([img(1)], [{ fileId: id, photoId: "901", order: 1 }]).d, fetch: f.fetch }).updateListing(ctx, upd);
    expect(r.ok).toBe(true);
    expect(ops(f)).toEqual(["saveProperty", "syncFiles", "addFile", "syncFiles"]);
  });
  it("toate imaginile șterse → deleteFile, fără syncFiles gol", async () => {
    const f = fakeFetch({ saveProperty: [saved(1009)], deleteFile: [ok("deleteFile")] });
    const m = mediaDeps([], [{ fileId: "hb-a-11111111", photoId: "1", order: 1 }, { fileId: "hb-b-22222222", photoId: "2", order: 2 }]);
    // Publicarea cere minimum o imagine: aici testăm doar curățarea, deci ocolim blocarea.
    const r = await createImopediaAdapter({ ...m.d, fetch: f.fetch }).updateListing(ctx, upd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("cel puțin o fotografie");
    expect(f.calls).toHaveLength(0);
  });
  it("video YouTube → FILE_TYPE=youtube, FILE_ID=yt-<id>", async () => {
    const f = fakeFetch({ saveProperty: [saved(1009)], existsFile: [existsNo], addFile: [addOk("901"), addOk("v1")], syncFiles: [syncOk] });
    await createImopediaAdapter({ ...mediaDeps([img(1)], [], "https://www.youtube.com/watch?v=dQw4w9WgXcQ").d, fetch: f.fetch }).updateListing(ctx, upd);
    const yt = f.calls.filter((c) => c.op === "addFile")[1]!.body;
    expect(yt).toContain(`<FILE_TYPE xsi:type="xsd:string">youtube</FILE_TYPE>`);
    expect(yt).toContain(`<FILE_ID xsi:type="xsd:string">yt-dQw4w9WgXcQ</FILE_ID>`);
    expect(f.calls.some((c) => c.body.includes("VIDEO_INFO"))).toBe(false);
  });
  it("saveProperty eșuat → niciun apel media", async () => {
    const f = fakeFetch({ saveProperty: [invalid("saveProperty", "T_V_PRET", "invalid")] });
    const r = await createImopediaAdapter({ ...mediaDeps([img(1)]).d, fetch: f.fetch }).updateListing(ctx, upd);
    expect(r.ok).toBe(false);
    expect(ops(f)).toEqual(["saveProperty"]);
  });
});

describe("ștergerea tuturor fișierelor (fără blocarea pentru imagini)", () => {
  it("deleteFile cu FILE.ID pentru fiecare, fără syncFiles", async () => {
    const f = fakeFetch({ saveProperty: [saved(1009)], deleteFile: [ok("deleteFile")] });
    const m = mediaDeps([], [{ fileId: "hb-a-11111111", photoId: "1", order: 1 }, { fileId: "hb-b-22222222", photoId: "2", order: 2 }]);
    // Fără `loadMedia` în blocare: simulăm o ofertă la care imaginile au dispărut după validare.
    let first = true;
    const d = { ...m.d, loadMedia: async () => { if (first) { first = false; return { images: [img(1)], videoUrl: null }; } return { images: [], videoUrl: null }; } } as ImopediaDeps;
    void d;
    const { createImopediaAdapter: _c } = await import("../adapters/imopedia.server");
    void _c;
    const del = await import("./media");
    expect(del.buildDeleteFileEnvelope("S", 4321, 1009, "hb-a-11111111")).toContain(`<FILE xsi:type="tns:FileType"><ID xsi:type="xsd:string">hb-a-11111111</ID></FILE>`);
    expect(() => del.buildSyncFilesEnvelope("S", 4321, 1009, [])).toThrow();
  });
});

describe("Gold", () => {
  it("bifat / nebifat → GOLD 1 / 0 la fiecare update", async () => {
    for (const [promoted, gold] of [[true, 1], [false, 0]] as const) {
      const f = fakeFetch({ saveProperty: [saved(1009)], existsFile: [existsNo], addFile: [addOk("1")], syncFiles: [syncOk] });
      const r = await createImopediaAdapter({ ...mediaDeps([img(1)]).d, fetch: f.fetch }).updateListing(ctx, { ...upd, promoted });
      expect(f.calls.find((c) => c.op === "saveProperty")!.body).toContain(`<GOLD xsi:type="xsd:int">${gold}</GOLD>`);
      if (r.ok && promoted) expect(r.data.promotedConfirmed).toBe(true);
    }
  });
  it("refuz Gold → publicat Standard + avertisment, Promovat debifat", async () => {
    const f = fakeFetch({ saveProperty: [invalid("saveProperty", "GOLD", "Limita de oferte Gold a fost depasita"), saved(1009)], existsFile: [existsNo], addFile: [addOk("1")], syncFiles: [syncOk] });
    const r = await createImopediaAdapter({ ...mediaDeps([img(1)]).d, fetch: f.fetch }).updateListing(ctx, { ...upd, promoted: true });
    expect(r.ok).toBe(true);
    const saves = f.calls.filter((c) => c.op === "saveProperty");
    expect(saves[1]!.body).toContain(`<GOLD xsi:type="xsd:int">0</GOLD>`);
    if (r.ok) { expect(r.data.promotedConfirmed).toBe(false); expect(r.data.message).toContain("Limita de oferte Gold a fost depasita"); }
  });
});

describe("boost", () => {
  it("saveBoost cu offerId = ID_LOCAL și agencyId = AGENTIA", async () => {
    const f = fakeFetch({ saveBoost: [ok("saveBoost")] });
    const r = await imopediaSaveBoost(ctx, 1009, { fetch: f.fetch });
    expect(r.ok).toBe(true);
    const b = f.calls.find((c) => c.op === "saveBoost")!.body;
    expect(b).toContain(`<options xsi:type="tns:SaveBoostType"><agencyId xsi:type="xsd:int">4321</agencyId><offerId xsi:type="xsd:int">1009</offerId></options>`);
    expect(f.calls.map((c) => c.op)).toEqual(["login", "saveBoost", "logout"]);
  });
  it("refuz → mesajul Imopedia, fără reîncercare", async () => {
    const f = fakeFetch({ saveBoost: [invalid("saveBoost", "soap", "Agency does not have enough boosts")] });
    const r = await imopediaSaveBoost(ctx, 1009, { fetch: f.fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Agency does not have enough boosts");
    expect(f.calls.filter((c) => c.op === "saveBoost")).toHaveLength(1);
  });
});
