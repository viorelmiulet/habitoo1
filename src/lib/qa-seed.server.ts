// Server-only: seeding, reset and cleanup of the dedicated DEMO / QA agency.
// Never import from client code – the *.server.ts suffix keeps it out of browser bundles.
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/integrations/supabase/types";
import { scoreMatch } from "@/lib/matching";

type Admin = SupabaseClient<Database>;

export const QA_ORG_SLUG = "realflow-qa-demo";
export const QA_ORG_NAME = "RealFlow QA Demo";
export const QA_SEED_VERSION = "2026.01";
export const DEMO_EMAIL_DOMAIN = "demo.realflow-crm.test";
const MEDIA_BUCKET = "property-media";
const DOCS_BUCKET = "crm-documents";
const DEMO_LIBRARY_PREFIX = "demo-library";

export type DemoRole = "agency_admin" | "agent";
export type DemoUserSpec = {
  key: "admin" | "mihai" | "elena" | "radu";
  email: string;
  full_name: string;
  job_title: string;
  phone: string;
  role: DemoRole;
};

export const DEMO_USERS: DemoUserSpec[] = [
  {
    key: "admin",
    email: `andreea.marinescu@${DEMO_EMAIL_DOMAIN}`,
    full_name: "Andreea Marinescu",
    job_title: "Director agenție",
    phone: "0740100200",
    role: "agency_admin",
  },
  {
    key: "mihai",
    email: `mihai.constantin@${DEMO_EMAIL_DOMAIN}`,
    full_name: "Mihai Constantin",
    job_title: "Agent senior",
    phone: "0741200300",
    role: "agent",
  },
  {
    key: "elena",
    email: `elena.dobre@${DEMO_EMAIL_DOMAIN}`,
    full_name: "Elena Dobre",
    job_title: "Agent imobiliar",
    phone: "0742300400",
    role: "agent",
  },
  {
    key: "radu",
    email: `radu.stancu@${DEMO_EMAIL_DOMAIN}`,
    full_name: "Radu Stancu",
    job_title: "Agent junior",
    phone: "0743400500",
    role: "agent",
  },
];

export type DemoCredential = {
  email: string;
  full_name: string;
  role: DemoRole;
  password: string | null;
  created: boolean;
};

export type QaCounts = {
  users: number;
  contacts: number;
  properties: number;
  property_images: number;
  requests: number;
  leads: number;
  lead_events: number;
  activities: number;
  upcoming_events: number;
  goals: number;
  notifications: number;
};

export type QaStatus = {
  organization: Pick<
    Tables<"organizations">,
    | "id"
    | "name"
    | "slug"
    | "status"
    | "plan"
    | "is_demo"
    | "demo_seeded_at"
    | "demo_seed_version"
    | "created_at"
    | "max_users"
    | "max_properties"
  > | null;
  counts: QaCounts | null;
  users: { id: string; email: string | null; full_name: string; role: DemoRole | "unknown"; job_title: string | null }[];
  library_photos: number;
  seed_version: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(prefix: string, error: { message: string } | null): never {
  throw new Error(`${prefix}: ${error?.message ?? "eroare necunoscută"}`);
}

function at(base: Date, hour: number, minute = 0) {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const NOW = () => new Date();
function ago(days: number, hour = 10, minute = 0) {
  const d = NOW();
  d.setDate(d.getDate() - days);
  return at(d, hour, minute);
}
function ahead(days: number, hour = 10, minute = 0) {
  const d = NOW();
  d.setDate(d.getDate() + days);
  return at(d, hour, minute);
}
/** O dată din luna curentă (pentru ca obiectivele/rapoartele lunare să aibă valori). */
function thisMonth(daysAgo: number, hour = 10) {
  const candidate = ago(daysAgo, hour);
  const start = NOW();
  start.setDate(1);
  start.setHours(8, 0, 0, 0);
  return candidate < start ? start : candidate;
}
const iso = (d: Date) => d.toISOString();
const monthStart = () => {
  const d = NOW();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `Demo-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

async function countFor(admin: Admin, table: keyof Database["public"]["Tables"], orgId: string, extra?: (q: any) => any) {
  let q: any = admin.from(table as never).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) fail(`Numărare ${String(table)}`, error);
  return count ?? 0;
}

async function removeStorageFolder(admin: Admin, bucket: string, prefix: string, depth = 0) {
  if (depth > 4) return;
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;
  const files = data.filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`);
  const folders = data.filter((e) => e.id === null).map((e) => `${prefix}/${e.name}`);
  if (files.length) await admin.storage.from(bucket).remove(files);
  for (const f of folders) await removeStorageFolder(admin, bucket, f, depth + 1);
}

export async function writeQaAudit(
  admin: Admin,
  params: { actorId: string; action: string; orgId: string | null; values?: Record<string, unknown> },
) {
  // Platform-level entry (organization_id NULL) so it survives reset / purge of the demo org.
  const { error } = await admin.from("audit_logs").insert({
    organization_id: null,
    actor_id: params.actorId,
    action: params.action,
    entity: "organizations",
    entity_id: params.orgId,
    new_values: { ...(params.values ?? {}), organization_id: params.orgId, at: iso(NOW()) } as never,
    created_by: params.actorId,
  });
  if (error) console.error("[qa] audit insert failed:", error.message);
}

// ---------------------------------------------------------------------------
// Organization + users
// ---------------------------------------------------------------------------

export async function findQaOrganization(admin: Admin) {
  const { data, error } = await admin
    .from("organizations")
    .select("id,name,slug,status,plan,is_demo,demo_seeded_at,demo_seed_version,created_at,max_users,max_properties")
    .eq("is_demo", true)
    .eq("slug", QA_ORG_SLUG)
    .maybeSingle();
  if (error) fail("Căutare agenție QA", error);
  return data;
}

export async function assertDemoOrganization(admin: Admin, orgId: string) {
  const { data, error } = await admin.from("organizations").select("id,is_demo,name").eq("id", orgId).maybeSingle();
  if (error) fail("Verificare agenție", error);
  if (!data) throw new Error("Agenția nu există.");
  if (data.is_demo !== true) {
    throw new Error(`Refuzat: agenția „${data.name}” NU este marcată DEMO/QA. Operațiunile destructive sunt permise doar pe agenția demo.`);
  }
  return data;
}

export async function createQaOrganization(admin: Admin, actorId: string) {
  const existing = await findQaOrganization(admin);
  if (existing) return existing;
  const { data, error } = await admin
    .from("organizations")
    .insert({
      name: QA_ORG_NAME,
      slug: QA_ORG_SLUG,
      city: "București",
      phone: "0311234567",
      email: `office@${DEMO_EMAIL_DOMAIN}`,
      plan: "growth",
      status: "active",
      max_users: 10,
      max_properties: 500,
      is_demo: true,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id,name,slug,status,plan,is_demo,demo_seeded_at,demo_seed_version,created_at,max_users,max_properties")
    .single();
  if (error) fail("Creare agenție QA", error);
  return data;
}

async function findAuthUserByEmail(admin: Admin, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail("Listare utilizatori", error);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Creează (sau reutilizează) conturile demo prin Auth Admin API și le atașează agenției QA. */
export async function ensureDemoUsers(
  admin: Admin,
  orgId: string,
  opts: { rotatePasswords: boolean },
): Promise<{ ids: Record<DemoUserSpec["key"], string>; credentials: DemoCredential[] }> {
  const ids = {} as Record<DemoUserSpec["key"], string>;
  const credentials: DemoCredential[] = [];

  for (const spec of DEMO_USERS) {
    let userId: string | null = null;
    let password: string | null = null;
    let created = false;

    const { data: profile } = await admin.from("profiles").select("id").eq("email", spec.email).maybeSingle();
    if (profile) {
      const { data: byId } = await admin.auth.admin.getUserById(profile.id);
      if (byId?.user) userId = byId.user.id;
    }
    if (!userId) {
      const existing = await findAuthUserByEmail(admin, spec.email);
      if (existing) userId = existing.id;
    }
    if (!userId) {
      password = generatePassword();
      const { data, error } = await admin.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: spec.full_name, demo: true },
        app_metadata: { demo: true },
      });
      if (error || !data.user) fail(`Creare utilizator demo ${spec.email}`, error);
      userId = data.user.id;
      created = true;
    } else if (opts.rotatePasswords) {
      password = generatePassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) fail(`Resetare parolă ${spec.email}`, error);
    }

    const { error: pErr } = await admin.from("profiles").upsert(
      {
        id: userId,
        organization_id: orgId,
        full_name: spec.full_name,
        email: spec.email,
        phone: spec.phone,
        job_title: spec.job_title,
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (pErr) fail(`Profil demo ${spec.email}`, pErr);

    // Curăță rolurile vechi ale contului demo (ex. dintr-o agenție QA anterioară) și setează rolul corect.
    await admin.from("user_roles").delete().eq("user_id", userId).neq("role", "superadmin");
    const { error: rErr } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, organization_id: orgId, role: spec.role }, { onConflict: "user_id,role" });
    if (rErr) fail(`Rol demo ${spec.email}`, rErr);

    ids[spec.key] = userId;
    credentials.push({ email: spec.email, full_name: spec.full_name, role: spec.role, password, created });
  }

  return { ids, credentials };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function collectQaStatus(admin: Admin): Promise<QaStatus> {
  const org = await findQaOrganization(admin);
  const { data: lib } = await admin.storage.from(MEDIA_BUCKET).list(DEMO_LIBRARY_PREFIX, { limit: 100 });
  const library_photos = (lib ?? []).filter((f) => f.id !== null).length;

  if (!org) return { organization: null, counts: null, users: [], library_photos, seed_version: QA_SEED_VERSION };

  const nowIso = iso(NOW());
  const [users, contacts, properties, property_images, requests, leads, lead_events, activities, upcoming, goals, notifications] =
    await Promise.all([
      countFor(admin, "profiles", org.id),
      countFor(admin, "contacts", org.id),
      countFor(admin, "properties", org.id),
      countFor(admin, "property_images", org.id),
      countFor(admin, "requests", org.id),
      countFor(admin, "leads", org.id),
      countFor(admin, "lead_events", org.id),
      countFor(admin, "activities", org.id),
      countFor(admin, "activities", org.id, (q) => q.gte("starts_at", nowIso).eq("status", "planned")),
      countFor(admin, "goals", org.id),
      countFor(admin, "notifications", org.id),
    ]);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,email,full_name,job_title")
    .eq("organization_id", org.id)
    .order("created_at");
  const profileIds = (profiles ?? []).map((p) => p.id);
  const { data: roles } = profileIds.length
    ? await admin.from("user_roles").select("user_id,role").in("user_id", profileIds)
    : { data: [] as { user_id: string; role: string }[] };

  return {
    organization: org,
    counts: {
      users,
      contacts,
      properties,
      property_images,
      requests,
      leads,
      lead_events,
      activities,
      upcoming_events: upcoming,
      goals,
      notifications,
    },
    users: (profiles ?? []).map((p) => {
      const r = (roles ?? []).find((x) => x.user_id === p.id)?.role;
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        job_title: p.job_title,
        role: r === "agency_admin" || r === "agent" ? r : "unknown",
      };
    }),
    library_photos,
    seed_version: QA_SEED_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Reset / purge
// ---------------------------------------------------------------------------

export async function resetQaData(admin: Admin, orgId: string) {
  await assertDemoOrganization(admin, orgId);
  const { data, error } = await admin.rpc("qa_reset_demo_organization", { _org: orgId });
  if (error) fail("Resetare date demo", error);
  await removeStorageFolder(admin, MEDIA_BUCKET, orgId);
  await removeStorageFolder(admin, DOCS_BUCKET, orgId);
  return (data ?? {}) as Record<string, number>;
}

export async function purgeQaOrganization(admin: Admin, orgId: string) {
  await assertDemoOrganization(admin, orgId);
  const { data: superadmins } = await admin.from("user_roles").select("user_id").eq("role", "superadmin");
  const protectedIds = new Set((superadmins ?? []).map((r) => r.user_id));

  const { data: userIds, error } = await admin.rpc("qa_purge_demo_organization", { _org: orgId });
  if (error) fail("Curățare agenție QA", error);

  await removeStorageFolder(admin, MEDIA_BUCKET, orgId);
  await removeStorageFolder(admin, DOCS_BUCKET, orgId);

  let deletedUsers = 0;
  for (const id of userIds ?? []) {
    if (protectedIds.has(id)) continue;
    const { data: u } = await admin.auth.admin.getUserById(id);
    const isDemo = u?.user?.email?.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`) || u?.user?.app_metadata?.demo === true;
    if (!isDemo) continue; // niciodată nu ștergem conturi care nu sunt demo
    const { error: dErr } = await admin.auth.admin.deleteUser(id);
    if (!dErr) deletedUsers++;
  }
  return { deletedUsers, userIds: userIds ?? [] };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export type SeedSummary = {
  counts: QaCounts & { favorites: number; matches_over_60: number };
  scenarios: {
    A: { property_reference: string; property_id: string; photos: number; leads: number; requests: number };
    B: { lead_name: string; lead_id: string; stage: string };
    C: { contact_name: string; contact_id: string };
    D: { request_title: string; request_id: string; top: { reference: string; score: number }[] };
  };
};

type Ids = Record<DemoUserSpec["key"], string>;

export async function seedQaData(admin: Admin, orgId: string, users: Ids, actorId: string): Promise<SeedSummary> {
  await assertDemoOrganization(admin, orgId);
  const org = orgId;
  const A = { admin: users.admin, mihai: users.mihai, elena: users.elena, radu: users.radu };
  const nowIso = iso(NOW());

  // ---------------- Contacts ----------------
  const cid = () => randomUUID();
  const C = {
    ion: cid(),
    cristina: cid(),
    vasile: cid(),
    gabriela: cid(),
    dan: cid(),
    alexandra: cid(),
    bogdan: cid(),
    ioana: cid(),
    stefan: cid(),
    diana: cid(),
    andrei: cid(),
    marius: cid(),
    simona: cid(),
    lucian: cid(),
  };
  const contacts: TablesInsert<"contacts">[] = [
    { id: C.ion, organization_id: org, type: "owner", first_name: "Ion", last_name: "Georgescu", phone: "0721234567", whatsapp: "0721234567", email: "ion.georgescu@example.com", source: "Recomandare", tags: ["proprietar", "vânzare"], notes: "Vinde apartamentul din Aviației și închiriază casa din Otopeni. Preferă discuții telefonice după ora 17.", gdpr_consent: true, assigned_to: A.mihai, created_by: A.admin, created_at: iso(ago(95)) },
    { id: C.cristina, organization_id: org, type: "owner", first_name: "Cristina", last_name: "Munteanu", phone: "0722345678", email: "cristina.munteanu@example.com", source: "Site agenție", tags: ["proprietar"], gdpr_consent: true, assigned_to: A.elena, created_by: A.admin, created_at: iso(ago(120)) },
    { id: C.vasile, organization_id: org, type: "owner", first_name: "Vasile", last_name: "Popa", phone: "0723456789", email: "vasile.popa@example.com", source: "OLX", tags: ["proprietar", "negociabil"], notes: "Deschis la reducere de preț dacă tranzacția se face rapid.", gdpr_consent: true, assigned_to: A.radu, created_by: A.admin, created_at: iso(ago(80)) },
    { id: C.gabriela, organization_id: org, type: "owner", first_name: "Gabriela", last_name: "Stan", phone: "0724567890", email: "gabriela.stan@example.com", source: "Recomandare", tags: ["proprietar", "exclusivitate"], gdpr_consent: true, assigned_to: A.mihai, created_by: A.admin, created_at: iso(ago(60)) },
    { id: C.dan, organization_id: org, type: "owner", first_name: "Dan", last_name: "Enache", phone: "0725678901", email: "dan.enache@example.com", source: "Imobiliare.ro", tags: ["proprietar"], gdpr_consent: true, assigned_to: A.elena, created_by: A.admin, created_at: iso(ago(150)) },
    { id: C.alexandra, organization_id: org, type: "buyer", first_name: "Alexandra", last_name: "Nistor", phone: "0731112233", whatsapp: "0731112233", email: "alexandra.nistor@example.com", company: null, source: "Site agenție", tags: ["cumpărător", "vânzător", "prioritar"], notes: "Vinde apartamentul cu 2 camere din Pipera și caută 3 camere în zona de nord. Buget confirmat cu banca.", gdpr_consent: true, assigned_to: A.mihai, created_by: A.mihai, created_at: iso(ago(40)) },
    { id: C.bogdan, organization_id: org, type: "buyer", first_name: "Bogdan", last_name: "Ilie", phone: "0732223344", whatsapp: "0732223344", email: "bogdan.ilie@example.com", source: "Imobiliare.ro", tags: ["cumpărător", "credit"], notes: "Pre-aprobare credit 140.000 EUR.", gdpr_consent: true, assigned_to: A.mihai, created_by: A.mihai, created_at: iso(ago(12)) },
    { id: C.ioana, organization_id: org, type: "buyer", first_name: "Ioana", last_name: "Vlad", phone: "0733334455", email: "ioana.vlad@example.com", source: "Facebook", tags: ["cumpărător"], gdpr_consent: true, assigned_to: A.radu, created_by: A.radu, created_at: iso(ago(25)) },
    { id: C.stefan, organization_id: org, type: "buyer", first_name: "Ștefan", last_name: "Rusu", phone: "0734445566", email: "stefan.rusu@example.com", source: "Recomandare", tags: ["cumpărător", "casă"], gdpr_consent: true, assigned_to: A.elena, created_by: A.elena, created_at: iso(ago(35)) },
    { id: C.diana, organization_id: org, type: "tenant", first_name: "Diana", last_name: "Petrescu", phone: "0735556677", email: "diana.petrescu@example.com", source: "OLX", tags: ["chiriaș"], gdpr_consent: true, assigned_to: A.elena, created_by: A.elena, created_at: iso(ago(18)) },
    { id: C.andrei, organization_id: org, type: "tenant", first_name: "Andrei", last_name: "Lungu", phone: "0736667788", email: "andrei.lungu@example.com", company: "Softline SRL", source: "Storia", tags: ["chiriaș", "corporate"], gdpr_consent: true, assigned_to: A.radu, created_by: A.radu, created_at: iso(ago(20)) },
    { id: C.marius, organization_id: org, type: "investor", first_name: "Marius", last_name: "Toma", phone: "0737778899", email: "marius.toma@example.com", company: "MT Invest SRL", source: "Recomandare", tags: ["investitor", "randament"], notes: "Caută randament brut peste 6%.", gdpr_consent: true, assigned_to: A.mihai, created_by: A.admin, created_at: iso(ago(70)) },
    { id: C.simona, organization_id: org, type: "investor", first_name: "Simona", last_name: "Crăciun", phone: "0738889900", email: "simona.craciun@example.com", source: "Site agenție", tags: ["investitor"], gdpr_consent: true, assigned_to: A.mihai, created_by: A.admin, created_at: iso(ago(50)) },
    { id: C.lucian, organization_id: org, type: "partner", first_name: "Lucian", last_name: "Barbu", phone: "0739990011", email: "lucian.barbu@example.com", company: "Barbu Imob", source: "Colaborare", tags: ["partener", "colaborare"], gdpr_consent: true, assigned_to: A.admin, created_by: A.admin, created_at: iso(ago(200)) },
  ];
  {
    const { error } = await admin.from("contacts").insert(contacts, { defaultToNull: false });
    if (error) fail("Inserare contacte", error);
  }

  // ---------------- Properties ----------------
  const pid = () => randomUUID();
  const P = {
    aviatiei: pid(), tineretului: pid(), taberei: pid(), militari: pid(), corbeanca: pid(), titan: pid(), pipera: pid(),
    cluj: pid(), floreasca: pid(), timisoara: pid(), otopeni: pid(), unirii: pid(), berceni: pid(), crangasi: pid(),
  };
  const base = { organization_id: org, currency: "EUR" } as const;
  const properties: TablesInsert<"properties">[] = [
    { id: P.aviatiei, ...base, reference: "RF-1001", title: "Apartament 3 camere, Aviației – Parc Herăstrău", description: "Apartament decomandat, luminos, în bloc din 2019 cu lift și parcare subterană. Finisaje premium, două băi, balcon generos cu vedere spre parc. Centrală proprie, aer condiționat în fiecare cameră.", property_type: "apartment", transaction_kind: "sale", status: "active", price: 165000, negotiable: true, surface: 82, usable_surface: 78, built_surface: 90, rooms: 3, bedrooms: 2, bathrooms: 2, floor: 3, building_floors: 8, build_year: 2019, layout: "decomandat", furnishing: "Nemobilat", heating: "Centrală proprie", parking: "Loc subteran", balcony: true, features: ["Balcon", "Parcare", "Lift", "Aer condiționat", "Centrală proprie"], utilities: ["Apă", "Canalizare", "Gaz", "Curent", "Internet"], address: "Str. Aviator Popișteanu 12, Aviației", city: "București", county: "București", district: "Sector 1", street: "Aviator Popișteanu", street_number: "12", lat: 44.4872, lng: 26.0934, owner_contact_id: C.ion, assigned_to: A.mihai, source: "Proprietar", commission: "2% + TVA", tags: ["premium", "vedere parc"], publish_status: "published", published_at: iso(ago(28)), last_activity_at: iso(ago(1)), created_by: A.mihai, created_at: iso(ago(30)) },
    { id: P.tineretului, ...base, reference: "RF-1002", title: "Garsonieră mobilată, Tineretului – metrou", description: "Garsonieră complet mobilată și utilată, la 5 minute de metrou Tineretului. Ideală pentru o persoană sau cuplu. Disponibilă imediat.", property_type: "studio", transaction_kind: "rent", status: "active", price: 450, surface: 34, rooms: 1, bedrooms: 1, bathrooms: 1, floor: 2, building_floors: 4, build_year: 1985, furnishing: "Mobilat complet", heating: "Termoficare", balcony: true, features: ["Mobilat", "Balcon", "Aer condiționat"], utilities: ["Apă", "Curent", "Internet"], address: "Bd. Tineretului 25, Tineretului", city: "București", county: "București", district: "Sector 4", lat: 44.4029, lng: 26.1052, owner_contact_id: C.cristina, assigned_to: A.elena, source: "OLX", commission: "50% din chirie", publish_status: "published", published_at: iso(ago(14)), last_activity_at: iso(ago(2)), created_by: A.elena, created_at: iso(ago(15)) },
    { id: P.taberei, ...base, reference: "RF-1003", title: "Apartament 2 camere, Drumul Taberei – Parc Moghioroș", description: "Apartament semidecomandat, renovat în 2021, la 3 minute de metrou Râul Doamnei. Bloc reabilitat termic.", property_type: "apartment", transaction_kind: "sale", status: "active", price: 89000, negotiable: true, surface: 54, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 4, building_floors: 10, build_year: 1978, layout: "semidecomandat", heating: "Termoficare", balcony: true, features: ["Balcon", "Lift"], utilities: ["Apă", "Gaz", "Curent"], address: "Str. Brașov 18, Drumul Taberei", city: "București", county: "București", district: "Sector 6", lat: 44.4178, lng: 26.0245, owner_contact_id: C.vasile, assigned_to: A.radu, source: "OLX", commission: "2%", publish_status: "published", published_at: iso(ago(40)), last_activity_at: iso(ago(6)), created_by: A.radu, created_at: iso(ago(45)) },
    { id: P.militari, ...base, reference: "RF-1004", title: "Apartament 2 camere decomandat, Militari Residence", description: "Apartament în ansamblu rezidențial nou, cu loc de parcare inclus, centrală proprie și balcon închis. Zonă liniștită, aproape de Auchan Militari.", property_type: "apartment", transaction_kind: "sale", status: "active", price: 96500, surface: 58, usable_surface: 55, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 2, building_floors: 8, build_year: 2020, layout: "decomandat", heating: "Centrală proprie", parking: "Loc exterior inclus", balcony: true, features: ["Balcon", "Parcare", "Lift", "Centrală proprie"], utilities: ["Apă", "Canalizare", "Gaz", "Curent", "Internet"], address: "Str. Rezervelor 60, Militari", city: "București", county: "Ilfov", district: "Militari", lat: 44.4342, lng: 25.9911, owner_contact_id: C.gabriela, assigned_to: A.mihai, source: "Recomandare", commission: "2%", publish_status: "published", published_at: iso(ago(20)), last_activity_at: iso(ago(5)), created_by: A.mihai, created_at: iso(ago(22)) },
    { id: P.corbeanca, ...base, reference: "RF-1005", title: "Casă individuală P+1, Corbeanca – Paradisul Verde", description: "Casă modernă pe teren de 520 mp, 5 camere, 3 băi, terasă acoperită, garaj dublu. Finisaje de calitate, panouri solare, sistem de irigații.", property_type: "house", transaction_kind: "sale", status: "active", price: 289000, negotiable: true, surface: 180, built_surface: 210, land_surface: 520, rooms: 5, bedrooms: 3, bathrooms: 3, floor: 0, building_floors: 2, build_year: 2017, heating: "Centrală proprie", parking: "Garaj dublu", balcony: false, features: ["Grădină", "Parcare", "Terasă", "Centrală proprie"], utilities: ["Apă", "Canalizare", "Gaz", "Curent", "Internet"], address: "Str. Salcâmilor 7, Corbeanca", city: "Corbeanca", county: "Ilfov", district: "Paradisul Verde", lat: 44.6182, lng: 26.0463, owner_contact_id: C.dan, assigned_to: A.elena, source: "Site agenție", commission: "3%", tags: ["casă", "exclusivitate"], publish_status: "published", published_at: iso(ago(55)), last_activity_at: iso(ago(4)), created_by: A.elena, created_at: iso(ago(60)) },
    { id: P.titan, ...base, reference: "RF-1006", title: "Apartament 3 camere, Titan – Parc IOR", description: "Apartament decomandat lângă Parcul IOR, etaj 6/10, două balcoane, bloc reabilitat. Rezervat, în curs de finalizare.", property_type: "apartment", transaction_kind: "sale", status: "reserved", price: 128000, surface: 70, rooms: 3, bedrooms: 2, bathrooms: 1, floor: 6, building_floors: 10, build_year: 1982, layout: "decomandat", heating: "Termoficare", balcony: true, features: ["Balcon", "Lift"], utilities: ["Apă", "Gaz", "Curent"], address: "Bd. Nicolae Grigorescu 41, Titan", city: "București", county: "București", district: "Sector 3", lat: 44.4226, lng: 26.1489, owner_contact_id: C.gabriela, assigned_to: A.radu, source: "Imobiliare.ro", commission: "2%", publish_status: "published", published_at: iso(ago(70)), last_activity_at: iso(ago(2)), created_by: A.radu, created_at: iso(ago(75)) },
    { id: P.pipera, ...base, reference: "RF-1007", title: "Apartament 2 camere, Pipera – Iancu Nicolae", description: "Apartament în complex cu pază, piscină și loc de joacă. Etaj 1, grădină proprie de 25 mp. În negociere.", property_type: "apartment", transaction_kind: "sale", status: "negotiation", price: 112000, negotiable: true, surface: 60, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 1, building_floors: 5, build_year: 2016, layout: "decomandat", heating: "Centrală proprie", parking: "Loc exterior", balcony: true, features: ["Balcon", "Parcare", "Grădină", "Centrală proprie"], utilities: ["Apă", "Canalizare", "Gaz", "Curent", "Internet"], address: "Str. Erou Iancu Nicolae 103, Pipera", city: "București", county: "Ilfov", district: "Pipera", lat: 44.5063, lng: 26.1148, owner_contact_id: C.alexandra, assigned_to: A.mihai, source: "Proprietar", commission: "2%", publish_status: "published", published_at: iso(ago(38)), last_activity_at: iso(ago(1)), created_by: A.mihai, created_at: iso(ago(40)) },
    { id: P.cluj, ...base, reference: "RF-1008", title: "Apartament 3 camere, Cluj-Napoca – Gheorgheni", description: "Apartament finisat modern, etaj 3/4, parcare, aproape de Iulius Mall. Vândut.", property_type: "apartment", transaction_kind: "sale", status: "sold", price: 145000, surface: 76, rooms: 3, bedrooms: 2, bathrooms: 2, floor: 3, building_floors: 4, build_year: 2012, layout: "decomandat", heating: "Centrală proprie", parking: "Loc exterior", balcony: true, features: ["Balcon", "Parcare", "Centrală proprie"], utilities: ["Apă", "Gaz", "Curent", "Internet"], address: "Str. Albac 5, Gheorgheni", city: "Cluj-Napoca", county: "Cluj", district: "Gheorgheni", lat: 46.7712, lng: 23.6236, owner_contact_id: C.cristina, assigned_to: A.elena, source: "Storia", commission: "2%", publish_status: "draft", last_activity_at: iso(ago(15)), created_by: A.elena, created_at: iso(ago(120)) },
    { id: P.floreasca, ...base, reference: "RF-1009", title: "Apartament 2 camere mobilat, Floreasca – Lac", description: "Apartament mobilat modern, parcare subterană, vedere spre lac. Închiriat pe 12 luni.", property_type: "apartment", transaction_kind: "rent", status: "rented", price: 750, surface: 55, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 5, building_floors: 8, build_year: 2015, furnishing: "Mobilat complet", heating: "Centrală proprie", parking: "Loc subteran", balcony: true, features: ["Mobilat", "Parcare", "Lift", "Aer condiționat"], utilities: ["Apă", "Gaz", "Curent", "Internet"], address: "Str. Glinka 9, Floreasca", city: "București", county: "București", district: "Sector 2", lat: 44.4667, lng: 26.1027, owner_contact_id: C.dan, assigned_to: A.radu, source: "Imobiliare.ro", commission: "1 chirie", publish_status: "draft", last_activity_at: iso(ago(9)), created_by: A.radu, created_at: iso(ago(90)) },
    { id: P.timisoara, ...base, reference: "RF-1010", title: "Garsonieră, Timișoara – Complex Studențesc", description: "Garsonieră la etaj 7/10, ideală pentru investiție (închiriere studenți). Anunț expirat, de reînnoit.", property_type: "studio", transaction_kind: "sale", status: "expired", price: 62000, surface: 30, rooms: 1, bedrooms: 1, bathrooms: 1, floor: 7, building_floors: 10, build_year: 1975, heating: "Termoficare", balcony: false, features: ["Lift"], utilities: ["Apă", "Curent"], address: "Aleea Studenților 3, Complex Studențesc", city: "Timișoara", county: "Timiș", district: "Complex Studențesc", lat: 45.7471, lng: 21.2402, owner_contact_id: C.vasile, assigned_to: A.mihai, source: "OLX", commission: "2%", publish_status: "draft", last_activity_at: iso(ago(45)), created_by: A.mihai, created_at: iso(ago(140)) },
    { id: P.otopeni, ...base, reference: "RF-1011", title: "Casă cu grădină, Otopeni – zona centrală", description: "Casă mobilată, 4 camere, curte de 400 mp, garaj. Ideală pentru familie sau chirie corporate.", property_type: "house", transaction_kind: "rent", status: "active", price: 1400, surface: 160, built_surface: 180, land_surface: 400, rooms: 4, bedrooms: 3, bathrooms: 2, floor: 0, building_floors: 2, build_year: 2010, furnishing: "Mobilat", heating: "Centrală proprie", parking: "Garaj", balcony: false, features: ["Grădină", "Parcare", "Terasă", "Mobilat"], utilities: ["Apă", "Canalizare", "Gaz", "Curent", "Internet"], address: "Str. Ardealului 22, Otopeni", city: "Otopeni", county: "Ilfov", district: "Centru", lat: 44.5504, lng: 26.0722, owner_contact_id: C.ion, assigned_to: A.elena, source: "Recomandare", commission: "1 chirie", publish_status: "published", published_at: iso(ago(9)), last_activity_at: iso(ago(3)), created_by: A.elena, created_at: iso(ago(10)) },
    { id: P.unirii, ...base, reference: "RF-1012", title: "Apartament 3 camere, Unirii – Fântâni", description: "Apartament spațios, mobilat și utilat, vedere spre fântânile de la Unirii. Pretabil corporate.", property_type: "apartment", transaction_kind: "rent", status: "active", price: 900, surface: 85, rooms: 3, bedrooms: 2, bathrooms: 2, floor: 4, building_floors: 8, build_year: 1990, furnishing: "Mobilat complet", heating: "Termoficare", balcony: true, features: ["Mobilat", "Lift", "Aer condiționat", "Balcon"], utilities: ["Apă", "Gaz", "Curent", "Internet"], address: "Bd. Unirii 15, Unirii", city: "București", county: "București", district: "Sector 3", lat: 44.4268, lng: 26.1044, owner_contact_id: C.cristina, assigned_to: A.radu, source: "Storia", commission: "1 chirie", publish_status: "published", published_at: iso(ago(17)), last_activity_at: iso(ago(5)), created_by: A.radu, created_at: iso(ago(18)) },
    { id: P.berceni, ...base, reference: "RF-1013", title: "Apartament 2 camere, Berceni – metrou Dimitrie Leonida", description: "Apartament de renovat, etaj 3/4, la 2 minute de metrou. Preț atractiv, în pregătire pentru publicare.", property_type: "apartment", transaction_kind: "sale", status: "draft", price: 74500, negotiable: true, surface: 50, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 3, building_floors: 4, build_year: 1972, layout: "semidecomandat", heating: "Termoficare", balcony: true, features: ["Balcon"], utilities: ["Apă", "Gaz", "Curent"], address: "Str. Luică 40, Berceni", city: "București", county: "București", district: "Sector 4", lat: 44.3856, lng: 26.1215, owner_contact_id: C.dan, assigned_to: A.mihai, source: "Proprietar", commission: "2%", publish_status: "draft", created_by: A.mihai, created_at: iso(ago(3)) },
    { id: P.crangasi, ...base, reference: "RF-1014", title: "Apartament 3 camere, Crângași – Lacul Morii", description: "Apartament decomandat cu vedere spre Lacul Morii, două balcoane, loc de parcare ADP. Bloc 1986, reabilitat.", property_type: "apartment", transaction_kind: "sale", status: "active", price: 118000, negotiable: false, surface: 74, rooms: 3, bedrooms: 2, bathrooms: 1, floor: 2, building_floors: 8, build_year: 1986, layout: "decomandat", heating: "Termoficare", parking: "Loc ADP", balcony: true, features: ["Balcon", "Lift", "Parcare"], utilities: ["Apă", "Gaz", "Curent", "Internet"], address: "Calea Crângași 30, Crângași", city: "București", county: "București", district: "Sector 6", lat: 44.4519, lng: 26.0398, owner_contact_id: C.vasile, assigned_to: A.elena, source: "Imobiliare.ro", commission: "2%", publish_status: "published", published_at: iso(ago(6)), last_activity_at: iso(ago(1)), created_by: A.elena, created_at: iso(ago(7)) },
  ];
  {
    const { error } = await admin.from("properties").insert(properties, { defaultToNull: false });
    if (error) fail("Inserare proprietăți", error);
  }

  // ---------------- Photos (copied from the generated demo library) ----------------
  const library = ["01-living.jpg", "02-kitchen.jpg", "03-bedroom.jpg", "04-bathroom.jpg", "05-building.jpg", "06-house.jpg", "07-balcony.jpg", "08-studio.jpg"];
  const altFor: Record<string, string> = {
    "01-living.jpg": "Living", "02-kitchen.jpg": "Bucătărie", "03-bedroom.jpg": "Dormitor", "04-bathroom.jpg": "Baie",
    "05-building.jpg": "Exterior bloc", "06-house.jpg": "Exterior casă", "07-balcony.jpg": "Balcon", "08-studio.jpg": "Cameră de zi",
  };
  const photoPlan: [string, string[]][] = [
    [P.aviatiei, ["05-building.jpg", "01-living.jpg", "02-kitchen.jpg", "03-bedroom.jpg", "04-bathroom.jpg", "07-balcony.jpg"]],
    [P.tineretului, ["08-studio.jpg", "02-kitchen.jpg", "04-bathroom.jpg"]],
    [P.taberei, ["01-living.jpg", "03-bedroom.jpg"]],
    [P.militari, ["05-building.jpg", "01-living.jpg", "02-kitchen.jpg"]],
    [P.corbeanca, ["06-house.jpg", "01-living.jpg", "02-kitchen.jpg", "03-bedroom.jpg"]],
    [P.titan, ["01-living.jpg", "04-bathroom.jpg"]],
    [P.pipera, ["05-building.jpg", "03-bedroom.jpg", "07-balcony.jpg"]],
    [P.otopeni, ["06-house.jpg", "02-kitchen.jpg"]],
    [P.unirii, ["01-living.jpg", "03-bedroom.jpg", "07-balcony.jpg"]],
    [P.crangasi, ["07-balcony.jpg", "01-living.jpg"]],
    [P.cluj, ["02-kitchen.jpg"]],
  ];
  const images: TablesInsert<"property_images">[] = [];
  let photosForA = 0;
  for (const [propertyId, files] of photoPlan) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (!library.includes(file)) continue;
      const dest = `${org}/${propertyId}/${String(i + 1).padStart(2, "0")}-${file}`;
      const { error } = await admin.storage.from(MEDIA_BUCKET).copy(`${DEMO_LIBRARY_PREFIX}/${file}`, dest);
      if (error) {
        // Fallback: SVG placeholder generat local (fără drepturi de autor).
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="100%" height="100%" fill="#e8e4dc"/><text x="50%" y="50%" font-family="sans-serif" font-size="42" fill="#6b6257" text-anchor="middle">${altFor[file] ?? "Foto demo"} · DEMO</text></svg>`;
        const up = await admin.storage.from(MEDIA_BUCKET).upload(dest.replace(/\.jpg$/, ".svg"), Buffer.from(svg), { contentType: "image/svg+xml", upsert: true });
        if (up.error) continue;
        images.push({ organization_id: org, property_id: propertyId, url: dest.replace(/\.jpg$/, ".svg"), storage_path: dest.replace(/\.jpg$/, ".svg"), position: i, is_primary: i === 0, include_in_publish: true, alt: altFor[file] ?? null, width: 1024, height: 768, created_by: A.admin });
      } else {
        images.push({ organization_id: org, property_id: propertyId, url: dest, storage_path: dest, position: i, is_primary: i === 0, include_in_publish: true, alt: altFor[file] ?? null, width: 1024, height: 768, created_by: A.admin });
      }
      if (propertyId === P.aviatiei) photosForA++;
    }
  }
  if (images.length) {
    const { error } = await admin.from("property_images").insert(images, { defaultToNull: false });
    if (error) fail("Inserare fotografii", error);
  }

  // ---------------- Requests ----------------
  const rid = () => randomUUID();
  const R = { bogdan: rid(), ioana: rid(), alexandra: rid(), diana: rid(), andrei: rid(), marius: rid(), stefan: rid() };
  const requests: TablesInsert<"requests">[] = [
    { id: R.bogdan, organization_id: org, contact_id: C.bogdan, kind: "buy", title: "3 camere, zona de nord (Aviației / Băneasa), până la 170.000 EUR", property_type: "apartment", budget_min: 130000, budget_max: 170000, currency: "EUR", cities: ["București"], areas: ["Aviației", "Băneasa", "Floreasca"], rooms_min: 3, rooms_max: 3, surface_min: 70, floor_preference: "Etaj intermediar", features: ["Parcare", "Balcon"], wants_parking: true, wants_balcony: true, priority: "high", status: "active", source: "Imobiliare.ro", notes: "Pre-aprobare credit. Vrea să se mute până la toamnă.", assigned_to: A.mihai, created_by: A.mihai, created_at: iso(ago(11)) },
    { id: R.ioana, organization_id: org, contact_id: C.ioana, kind: "buy", title: "2–3 camere, Sector 6 (Militari / Drumul Taberei / Crângași), până la 110.000 EUR", property_type: "apartment", budget_min: 80000, budget_max: 110000, currency: "EUR", cities: ["București"], areas: ["Militari", "Drumul Taberei", "Crângași"], rooms_min: 2, rooms_max: 3, surface_min: 55, features: ["Balcon", "Parcare", "Centrală proprie"], wants_balcony: true, wants_parking: true, priority: "normal", status: "active", source: "Facebook", notes: "Prima locuință, flexibilă pe zonă în vestul orașului.", assigned_to: A.radu, created_by: A.radu, created_at: iso(ago(24)) },
    { id: R.alexandra, organization_id: org, contact_id: C.alexandra, kind: "buy", title: "3 camere, nord (Aviației / Pipera / Floreasca), 140–175k EUR, cu parcare", property_type: "apartment", budget_min: 140000, budget_max: 175000, currency: "EUR", cities: ["București"], areas: ["Aviației", "Pipera", "Floreasca"], rooms_min: 3, rooms_max: 4, surface_min: 75, features: ["Parcare", "Lift"], wants_parking: true, priority: "high", status: "active", source: "Site agenție", notes: "Condiționată de vânzarea apartamentului din Pipera (RF-1007).", assigned_to: A.mihai, created_by: A.mihai, created_at: iso(ago(38)) },
    { id: R.diana, organization_id: org, contact_id: C.diana, kind: "rent", title: "Garsonieră / 2 camere mobilată, sud–centru, max 550 EUR", property_type: "studio", budget_min: 350, budget_max: 550, currency: "EUR", cities: ["București"], areas: ["Tineretului", "Unirii", "Timpuri Noi"], rooms_min: 1, rooms_max: 2, furnished: true, pets_allowed: false, term: "12 luni", features: ["Mobilat"], priority: "normal", status: "active", source: "OLX", assigned_to: A.elena, created_by: A.elena, created_at: iso(ago(17)) },
    { id: R.andrei, organization_id: org, contact_id: C.andrei, kind: "rent", title: "3 camere mobilat, centru, până la 1.000 EUR (corporate)", property_type: "apartment", budget_min: 700, budget_max: 1000, currency: "EUR", cities: ["București"], areas: ["Unirii", "Universitate", "Floreasca"], rooms_min: 2, rooms_max: 3, surface_min: 65, furnished: true, pets_allowed: true, term: "24 luni", features: ["Mobilat", "Aer condiționat"], priority: "high", status: "active", source: "Storia", notes: "Contract pe firmă, plata în avans pe 3 luni.", assigned_to: A.radu, created_by: A.radu, created_at: iso(ago(19)) },
    { id: R.marius, organization_id: org, contact_id: C.marius, kind: "invest", title: "Investiție: 1–2 camere de închiriat, sub 95.000 EUR", property_type: "apartment", budget_min: 60000, budget_max: 95000, currency: "EUR", cities: ["București", "Cluj-Napoca"], areas: ["Drumul Taberei", "Berceni", "Militari"], rooms_min: 1, rooms_max: 2, features: [], priority: "normal", status: "active", source: "Recomandare", notes: "Randament brut țintit peste 6%. Poate cumpăra două unități.", assigned_to: A.mihai, created_by: A.admin, created_at: iso(ago(60)) },
    { id: R.stefan, organization_id: org, contact_id: C.stefan, kind: "buy", title: "Casă P+1 cu grădină, Ilfov nord, 250–300k EUR", property_type: "house", budget_min: 250000, budget_max: 300000, currency: "EUR", cities: ["Corbeanca", "Otopeni", "Balotești"], areas: ["Corbeanca", "Otopeni", "Balotești"], rooms_min: 4, rooms_max: 6, surface_min: 150, features: ["Grădină", "Parcare"], wants_parking: true, priority: "high", status: "active", source: "Recomandare", assigned_to: A.elena, created_by: A.elena, created_at: iso(ago(33)) },
  ];
  {
    const { error } = await admin.from("requests").insert(requests, { defaultToNull: false });
    if (error) fail("Inserare cereri", error);
  }

  // ---------------- Leads ----------------
  const lid = () => randomUUID();
  const L = {
    cosmin: lid(), laura: lid(), bogdan: lid(), diana: lid(), ioana: lid(), marius: lid(), alexandra: lid(), andrei: lid(),
    stefan: lid(), simona: lid(), voicu: lid(), neagu: lid(), popescu: lid(), sava: lid(), iancu: lid(),
  };
  type LeadSeed = TablesInsert<"leads"> & { id: string; created_at: string; stage: Database["public"]["Enums"]["lead_stage"] };
  const leads: LeadSeed[] = [
    { id: L.cosmin, organization_id: org, name: "Cosmin Dragomir", phone: "0745000111", email: "cosmin.dragomir@example.com", source: "OLX", campaign: "OLX – garsoniere", stage: "new", score: 30, property_id: P.tineretului, assigned_to: A.elena, created_by: A.elena, last_interaction_at: null, next_followup_at: iso(ahead(1, 9, 30)), created_at: iso(ago(0, 8)) },
    { id: L.laura, organization_id: org, name: "Laura Mihai", phone: "0745000222", email: "laura.mihai@example.com", source: "Imobiliare.ro", stage: "new", score: 40, property_id: P.crangasi, assigned_to: A.radu, created_by: A.radu, last_interaction_at: null, next_followup_at: iso(ago(1, 15)), created_at: iso(ago(2, 11)) },
    { id: L.bogdan, organization_id: org, contact_id: C.bogdan, name: "Bogdan Ilie", phone: "0732223344", email: "bogdan.ilie@example.com", source: "Imobiliare.ro", campaign: "Listare RF-1001", stage: "contacted", score: 55, property_id: P.aviatiei, request_id: R.bogdan, assigned_to: A.mihai, created_by: A.mihai, last_interaction_at: iso(ago(1, 17)), next_followup_at: iso(ahead(1, 11)), notes: "Vrea vizionare în weekend. Interesat și de RF-1014 ca alternativă.", created_at: iso(ago(12, 9)) },
    { id: L.diana, organization_id: org, contact_id: C.diana, name: "Diana Petrescu", phone: "0735556677", email: "diana.petrescu@example.com", source: "OLX", stage: "contacted", score: 50, property_id: P.tineretului, request_id: R.diana, assigned_to: A.elena, created_by: A.elena, last_interaction_at: iso(ago(3, 12)), next_followup_at: iso(ahead(2, 10)), created_at: iso(ago(17, 10)) },
    { id: L.ioana, organization_id: org, contact_id: C.ioana, name: "Ioana Vlad", phone: "0733334455", email: "ioana.vlad@example.com", source: "Facebook", campaign: "FB – prima locuință", stage: "qualified", score: 68, property_id: P.militari, request_id: R.ioana, assigned_to: A.radu, created_by: A.radu, last_interaction_at: iso(ago(2, 14)), next_followup_at: iso(ahead(3, 17, 30)), created_at: iso(ago(24, 9)) },
    { id: L.marius, organization_id: org, contact_id: C.marius, name: "Marius Toma", phone: "0737778899", email: "marius.toma@example.com", source: "Recomandare", stage: "qualified", score: 62, property_id: P.taberei, request_id: R.marius, assigned_to: A.mihai, created_by: A.admin, last_interaction_at: iso(ago(7, 11)), next_followup_at: iso(ahead(5, 10)), created_at: iso(ago(58, 9)) },
    { id: L.alexandra, organization_id: org, contact_id: C.alexandra, name: "Alexandra Nistor", phone: "0731112233", email: "alexandra.nistor@example.com", source: "Site agenție", stage: "viewing", score: 78, property_id: P.aviatiei, request_id: R.alexandra, assigned_to: A.mihai, created_by: A.mihai, last_interaction_at: iso(ago(3, 12)), next_followup_at: iso(ahead(5, 16)), notes: "A vizionat RF-1001, i-a plăcut mult. Așteaptă oferta finală după vânzarea RF-1007.", created_at: iso(ago(36, 9)) },
    { id: L.andrei, organization_id: org, contact_id: C.andrei, name: "Andrei Lungu", phone: "0736667788", email: "andrei.lungu@example.com", source: "Storia", stage: "viewing", score: 70, property_id: P.unirii, request_id: R.andrei, assigned_to: A.radu, created_by: A.radu, last_interaction_at: iso(ago(5, 18)), next_followup_at: iso(ahead(8, 13)), created_at: iso(ago(19, 9)) },
    { id: L.stefan, organization_id: org, contact_id: C.stefan, name: "Ștefan Rusu", phone: "0734445566", email: "stefan.rusu@example.com", source: "Recomandare", stage: "offer", score: 82, value: 275000, property_id: P.corbeanca, request_id: R.stefan, assigned_to: A.elena, created_by: A.elena, last_interaction_at: iso(ago(4, 10)), next_followup_at: iso(ahead(2, 12)), notes: "Ofertă 275.000 EUR trimisă proprietarului.", created_at: iso(ago(32, 9)) },
    { id: L.simona, organization_id: org, contact_id: C.simona, name: "Simona Crăciun", phone: "0738889900", email: "simona.craciun@example.com", source: "Site agenție", stage: "negotiation", score: 85, value: 108000, property_id: P.pipera, assigned_to: A.mihai, created_by: A.mihai, last_interaction_at: iso(ago(1, 16)), next_followup_at: iso(ahead(4, 14)), notes: "Negociere între 106.000 și 110.000 EUR.", created_at: iso(ago(28, 9)) },
    { id: L.voicu, organization_id: org, name: "Familia Voicu", phone: "0746000333", email: "familia.voicu@example.com", source: "Imobiliare.ro", stage: "transaction", score: 92, value: 126000, property_id: P.titan, assigned_to: A.radu, created_by: A.radu, last_interaction_at: iso(ago(2, 11)), next_followup_at: iso(ahead(3, 9)), notes: "Precontract semnat, notar programat.", created_at: iso(ago(48, 9)) },
    { id: L.neagu, organization_id: org, name: "Adrian Neagu", phone: "0746000444", email: "adrian.neagu@example.com", source: "Storia", stage: "won", score: 100, value: 143000, property_id: P.cluj, assigned_to: A.elena, created_by: A.elena, last_interaction_at: iso(thisMonth(6, 12)), next_followup_at: null, notes: "Tranzacție finalizată la notar.", created_at: iso(thisMonth(12, 9)) },
    { id: L.popescu, organization_id: org, name: "Familia Popescu", phone: "0746000555", email: "familia.popescu@example.com", source: "Imobiliare.ro", stage: "won", score: 100, value: 750, property_id: P.floreasca, assigned_to: A.radu, created_by: A.radu, last_interaction_at: iso(thisMonth(9, 12)), next_followup_at: null, notes: "Contract de închiriere semnat pe 12 luni.", created_at: iso(thisMonth(14, 9)) },
    { id: L.sava, organization_id: org, name: "Florin Sava", phone: "0746000666", email: "florin.sava@example.com", source: "OLX", stage: "lost", score: 20, property_id: P.taberei, assigned_to: A.elena, created_by: A.elena, last_interaction_at: iso(ago(20, 10)), next_followup_at: null, lost_reason: "A cumpărat prin altă agenție", created_at: iso(ago(30, 9)) },
    { id: L.iancu, organization_id: org, name: "Carmen Iancu", phone: "0746000777", email: "carmen.iancu@example.com", source: "Facebook", stage: "lost", score: 15, property_id: P.timisoara, assigned_to: A.mihai, created_by: A.mihai, last_interaction_at: iso(ago(40, 10)), next_followup_at: null, lost_reason: "Buget insuficient", created_at: iso(ago(52, 9)) },
  ];
  {
    const { error } = await admin.from("leads").insert(leads.map((l) => ({ ...l, stale: false })), { defaultToNull: false });
    if (error) fail("Inserare lead-uri", error);
  }

  // ---------------- Lead history ----------------
  const chain: Database["public"]["Enums"]["lead_stage"][] = ["new", "contacted", "qualified", "viewing", "offer", "negotiation", "transaction", "won"];
  const stageNotes: Record<string, string> = {
    new: "Lead creat",
    contacted: "Prim contact telefonic",
    qualified: "Buget și criterii confirmate",
    viewing: "Vizionare programată/efectuată",
    offer: "Ofertă transmisă",
    negotiation: "Negociere preț",
    transaction: "Precontract semnat",
    won: "Tranzacție finalizată",
    lost: "Lead pierdut",
  };
  const events: TablesInsert<"lead_events">[] = [];
  for (const lead of leads) {
    const path = lead.stage === "lost" ? (["new", "contacted", "lost"] as const) : chain.slice(0, chain.indexOf(lead.stage) + 1);
    const start = new Date(lead.created_at).getTime();
    const end = Math.min(NOW().getTime() - 60_000, lead.last_interaction_at ? new Date(lead.last_interaction_at).getTime() : NOW().getTime() - 60_000);
    const steps = Math.max(1, path.length - 1);
    path.forEach((stage, i) => {
      const t = i === 0 ? start : Math.min(end, start + ((end - start) * i) / steps);
      events.push({
        organization_id: org,
        lead_id: lead.id,
        from_stage: i === 0 ? null : (path[i - 1] as Database["public"]["Enums"]["lead_stage"]),
        to_stage: stage as Database["public"]["Enums"]["lead_stage"],
        note: stage === "lost" ? `${stageNotes.lost}: ${lead.lost_reason ?? ""}` : stageNotes[stage] ?? null,
        actor_id: lead.assigned_to ?? A.admin,
        created_at: iso(new Date(t)),
      });
    });
  }
  {
    const { error } = await admin.from("lead_events").insert(events, { defaultToNull: false });
    if (error) fail("Inserare istoric lead-uri", error);
  }

  // ---------------- Activities ----------------
  type Act = TablesInsert<"activities">;
  const done = (a: Omit<Act, "organization_id" | "done" | "status">): Act => ({ ...a, organization_id: org, done: true, status: "done" });
  const planned = (a: Omit<Act, "organization_id" | "done" | "status">): Act => ({ ...a, organization_id: org, done: false, status: "planned" });
  const activities: Act[] = [
    // Efectuate
    done({ kind: "call", title: "Apel calificare – Bogdan Ilie", description: "Buget confirmat 130–170k, dorește 3 camere în nord.", starts_at: iso(ago(2, 10)), duration_minutes: 15, contact_id: C.bogdan, lead_id: L.bogdan, property_id: P.aviatiei, request_id: R.bogdan, assigned_to: A.mihai, created_by: A.mihai }),
    done({ kind: "call", title: "WhatsApp: fotografii RF-1001 trimise – Bogdan Ilie", description: "Canal: WhatsApp. A confirmat interesul pentru vizionare.", starts_at: iso(ago(1, 17)), duration_minutes: 5, contact_id: C.bogdan, lead_id: L.bogdan, property_id: P.aviatiei, assigned_to: A.mihai, created_by: A.mihai }),
    done({ kind: "viewing", title: "Vizionare RF-1001 Aviației – Alexandra Nistor", description: "Feedback foarte bun; întrebări despre parcare și taxe.", starts_at: iso(ago(3, 12)), ends_at: iso(ago(3, 13)), duration_minutes: 60, contact_id: C.alexandra, lead_id: L.alexandra, property_id: P.aviatiei, request_id: R.alexandra, assigned_to: A.mihai, created_by: A.mihai }),
    done({ kind: "email", title: "Email ofertă – Casa Corbeanca", description: "Ofertă 275.000 EUR trimisă proprietarului Dan Enache.", starts_at: iso(ago(4, 10)), duration_minutes: 20, contact_id: C.stefan, lead_id: L.stefan, property_id: P.corbeanca, assigned_to: A.elena, created_by: A.elena }),
    done({ kind: "meeting", title: "Întâlnire semnare precontract – Titan", description: "Precontract semnat cu Familia Voicu; avans 10%.", starts_at: iso(ago(2, 14)), ends_at: iso(ago(2, 15, 30)), duration_minutes: 90, lead_id: L.voicu, property_id: P.titan, assigned_to: A.radu, created_by: A.radu }),
    done({ kind: "call", title: "Apel proprietar – reducere preț Drumul Taberei", description: "Vasile Popa acceptă 87.000 EUR pentru tranzacție rapidă.", starts_at: iso(ago(6, 11)), duration_minutes: 12, contact_id: C.vasile, property_id: P.taberei, assigned_to: A.radu, created_by: A.radu }),
    done({ kind: "task", title: "Actualizare descriere și fotografii – Militari", starts_at: iso(ago(5, 9)), duration_minutes: 30, property_id: P.militari, assigned_to: A.mihai, created_by: A.mihai }),
    done({ kind: "note", title: "Notă: Marius Toma preferă etaje joase", description: "Evită etajele peste 4 fără lift. Interesat de două unități.", starts_at: iso(ago(7, 11)), duration_minutes: 5, contact_id: C.marius, lead_id: L.marius, request_id: R.marius, assigned_to: A.mihai, created_by: A.mihai }),
    done({ kind: "viewing", title: "Vizionare garsonieră Tineretului – Diana Petrescu", description: "I-a plăcut, dar vrea să mai vadă o variantă la Unirii.", starts_at: iso(ago(8, 18)), ends_at: iso(ago(8, 18, 30)), duration_minutes: 30, contact_id: C.diana, lead_id: L.diana, property_id: P.tineretului, request_id: R.diana, assigned_to: A.elena, created_by: A.elena }),
    done({ kind: "followup", title: "Follow-up Florin Sava", description: "A cumpărat prin altă agenție. Lead închis.", starts_at: iso(ago(20, 10)), duration_minutes: 10, lead_id: L.sava, property_id: P.taberei, assigned_to: A.elena, created_by: A.elena }),
    done({ kind: "call", title: "Apel Adrian Neagu – confirmare finalizare Cluj", starts_at: iso(thisMonth(6, 12)), duration_minutes: 10, lead_id: L.neagu, property_id: P.cluj, assigned_to: A.elena, created_by: A.elena }),
    done({ kind: "viewing", title: "Vizionare RF-1012 Unirii – Andrei Lungu", description: "Firma dorește contract pe 24 luni.", starts_at: iso(ago(5, 18)), ends_at: iso(ago(5, 19)), duration_minutes: 60, contact_id: C.andrei, lead_id: L.andrei, property_id: P.unirii, request_id: R.andrei, assigned_to: A.radu, created_by: A.radu }),
    done({ kind: "call", title: "WhatsApp: documente proprietate Pipera – Alexandra Nistor", description: "Canal: WhatsApp. Extras CF și certificat energetic primite.", starts_at: iso(ago(10, 15)), duration_minutes: 10, contact_id: C.alexandra, property_id: P.pipera, assigned_to: A.mihai, created_by: A.mihai }),
    done({ kind: "email", title: "Email selecție proprietăți – Ioana Vlad", description: "Trimise RF-1003, RF-1004, RF-1014.", starts_at: iso(ago(4, 9, 30)), duration_minutes: 15, contact_id: C.ioana, lead_id: L.ioana, request_id: R.ioana, assigned_to: A.radu, created_by: A.radu }),
    done({ kind: "meeting", title: "Întâlnire proprietar Gabriela Stan – contract exclusivitate", starts_at: iso(ago(21, 10)), ends_at: iso(ago(21, 11)), duration_minutes: 60, contact_id: C.gabriela, property_id: P.militari, assigned_to: A.mihai, created_by: A.mihai }),
    done({ kind: "viewing", title: "Vizionare casă Corbeanca – Ștefan Rusu", description: "A doua vizionare, cu familia.", starts_at: iso(thisMonth(8, 11)), ends_at: iso(thisMonth(8, 12)), duration_minutes: 60, contact_id: C.stefan, lead_id: L.stefan, property_id: P.corbeanca, assigned_to: A.elena, created_by: A.elena }),
    { organization_id: org, kind: "viewing", title: "Vizionare Crângași – Laura Mihai (anulată)", description: "Clienta a anulat cu o zi înainte.", starts_at: iso(ago(1, 12)), duration_minutes: 45, lead_id: L.laura, property_id: P.crangasi, assigned_to: A.elena, created_by: A.elena, done: false, status: "cancelled" },
    // Restante
    planned({ kind: "followup", title: "Follow-up restant – Laura Mihai", description: "Reprogramare vizionare Crângași.", starts_at: iso(ago(1, 15)), duration_minutes: 10, lead_id: L.laura, property_id: P.crangasi, assigned_to: A.radu, created_by: A.radu }),
    // Planificate (calendar)
    planned({ kind: "viewing", title: "Vizionare RF-1001 Aviației – Bogdan Ilie", description: "Întâlnire la intrarea în bloc. Cheile la proprietar.", starts_at: iso(ahead(1, 11)), ends_at: iso(ahead(1, 12)), duration_minutes: 60, contact_id: C.bogdan, lead_id: L.bogdan, property_id: P.aviatiei, request_id: R.bogdan, assigned_to: A.mihai, created_by: A.mihai }),
    planned({ kind: "followup", title: "Follow-up Cosmin Dragomir (OLX)", starts_at: iso(ahead(1, 9, 30)), duration_minutes: 10, lead_id: L.cosmin, property_id: P.tineretului, assigned_to: A.elena, created_by: A.elena }),
    planned({ kind: "call", title: "Apel calificare – Laura Mihai", starts_at: iso(ahead(1, 15)), duration_minutes: 15, lead_id: L.laura, property_id: P.crangasi, assigned_to: A.radu, created_by: A.radu }),
    planned({ kind: "meeting", title: "Întâlnire proprietar Ion Georgescu – strategie preț", description: "Discuție despre ajustarea prețului la RF-1001 dacă nu apare ofertă în 2 săptămâni.", starts_at: iso(ahead(2, 10)), ends_at: iso(ahead(2, 11)), duration_minutes: 60, contact_id: C.ion, property_id: P.aviatiei, assigned_to: A.mihai, created_by: A.mihai }),
    planned({ kind: "viewing", title: "Vizionare casă Corbeanca – Ștefan Rusu (finală)", starts_at: iso(ahead(2, 12)), ends_at: iso(ahead(2, 13)), duration_minutes: 60, contact_id: C.stefan, lead_id: L.stefan, property_id: P.corbeanca, request_id: R.stefan, assigned_to: A.elena, created_by: A.elena }),
    planned({ kind: "task", title: "Pregătire dosar notar – Titan", description: "Extras CF actualizat, certificat fiscal, adeverință asociație.", starts_at: iso(ahead(3, 9)), duration_minutes: 45, lead_id: L.voicu, property_id: P.titan, assigned_to: A.radu, created_by: A.radu }),
    planned({ kind: "viewing", title: "Vizionare Militari Residence – Ioana Vlad", starts_at: iso(ahead(3, 17, 30)), ends_at: iso(ahead(3, 18, 15)), duration_minutes: 45, contact_id: C.ioana, lead_id: L.ioana, property_id: P.militari, request_id: R.ioana, assigned_to: A.radu, created_by: A.radu }),
    planned({ kind: "meeting", title: "Negociere finală Pipera – Simona Crăciun", starts_at: iso(ahead(4, 14)), ends_at: iso(ahead(4, 15)), duration_minutes: 60, contact_id: C.simona, lead_id: L.simona, property_id: P.pipera, assigned_to: A.mihai, created_by: A.mihai }),
    planned({ kind: "email", title: "Trimite selecție investiții – Marius Toma", starts_at: iso(ahead(5, 10)), duration_minutes: 20, contact_id: C.marius, lead_id: L.marius, request_id: R.marius, assigned_to: A.mihai, created_by: A.mihai }),
    planned({ kind: "followup", title: "Follow-up Alexandra Nistor după vizionare", starts_at: iso(ahead(5, 16)), duration_minutes: 15, contact_id: C.alexandra, lead_id: L.alexandra, property_id: P.aviatiei, assigned_to: A.mihai, created_by: A.mihai }),
    planned({ kind: "task", title: "Reînnoire anunț expirat – Timișoara", starts_at: iso(ahead(6, 9)), duration_minutes: 20, property_id: P.timisoara, assigned_to: A.mihai, created_by: A.mihai }),
    planned({ kind: "viewing", title: "Vizionare Otopeni – chiriaș corporate", starts_at: iso(ahead(7, 11)), ends_at: iso(ahead(7, 12)), duration_minutes: 60, property_id: P.otopeni, assigned_to: A.elena, created_by: A.elena }),
    planned({ kind: "meeting", title: "Ședință săptămânală echipă", description: "Pipeline, obiective lunare, proprietăți noi.", starts_at: iso(ahead(7, 9)), ends_at: iso(ahead(7, 10)), duration_minutes: 60, assigned_to: A.admin, created_by: A.admin }),
    planned({ kind: "call", title: "Apel decizie – Andrei Lungu", starts_at: iso(ahead(8, 13)), duration_minutes: 15, contact_id: C.andrei, lead_id: L.andrei, property_id: P.unirii, assigned_to: A.radu, created_by: A.radu }),
  ];
  {
    const { error } = await admin.from("activities").insert(activities, { defaultToNull: false });
    if (error) fail("Inserare activități", error);
  }

  // ---------------- Goals ----------------
  const period = monthStart();
  const goalRows: TablesInsert<"goals">[] = [];
  const goalPlan: [string | null, Record<string, [number, number]>][] = [
    [A.mihai, { leads: [15, 6], viewings: [10, 4], new_properties: [4, 3], transactions: [2, 1], commission: [6000, 2200] }],
    [A.elena, { leads: [12, 5], viewings: [8, 5], new_properties: [3, 2], transactions: [2, 1], commission: [5000, 2860] }],
    [A.radu, { leads: [10, 4], viewings: [8, 3], new_properties: [3, 1], transactions: [1, 1], commission: [3500, 750] }],
    [null, { leads: [40, 15], transactions: [5, 3], commission: [15000, 5810] }],
  ];
  for (const [userId, metrics] of goalPlan) {
    for (const [metric, [target, progress]] of Object.entries(metrics)) {
      goalRows.push({ organization_id: org, user_id: userId, period, metric, target, progress, created_by: A.admin });
    }
  }
  {
    const { error } = await admin.from("goals").insert(goalRows, { defaultToNull: false });
    if (error) fail("Inserare obiective", error);
  }

  // ---------------- Notifications ----------------
  const notifications: TablesInsert<"notifications">[] = [
    { organization_id: org, user_id: A.admin, type: "lead", title: "Lead nou din OLX", body: "Cosmin Dragomir a solicitat detalii pentru garsoniera din Tineretului (RF-1002).", link: "/app/leads", created_at: iso(ago(0, 8, 5)) },
    { organization_id: org, user_id: A.admin, type: "goal", title: "Obiectiv lunar: 3/5 tranzacții", body: "Echipa a atins 60% din ținta lunară de tranzacții.", link: "/app/goals", created_at: iso(ago(1, 9)) },
    { organization_id: org, user_id: A.mihai, type: "match", title: "Potrivire nouă: RF-1001 ↔ Bogdan Ilie", body: "Apartamentul din Aviației se potrivește cererii lui Bogdan Ilie (scor 90+).", link: "/app/matching", created_at: iso(ago(11, 10)) },
    { organization_id: org, user_id: A.mihai, type: "activity", title: "Vizionare mâine la 11:00", body: "RF-1001 Aviației cu Bogdan Ilie.", link: "/app/calendar", created_at: iso(ago(0, 7)) },
    { organization_id: org, user_id: A.elena, type: "lead", title: "Ofertă în așteptare – Casa Corbeanca", body: "Proprietarul nu a răspuns încă la oferta de 275.000 EUR.", link: "/app/leads", created_at: iso(ago(2, 9)) },
    { organization_id: org, user_id: A.radu, type: "followup", title: "Follow-up restant: Laura Mihai", body: "Follow-up-ul programat ieri nu a fost finalizat.", link: "/app/activities", created_at: iso(ago(0, 8)) },
    { organization_id: org, user_id: A.radu, type: "match", title: "3 potriviri pentru cererea Ioanei Vlad", body: "RF-1003, RF-1004 și RF-1014 se potrivesc criteriilor.", link: "/app/matching", created_at: iso(ago(3, 9)), read_at: iso(ago(2, 9)) },
  ];
  {
    const { error } = await admin.from("notifications").insert(notifications, { defaultToNull: false });
    if (error) fail("Inserare notificări", error);
  }

  // ---------------- Favorites ----------------
  const favorites: TablesInsert<"property_favorites">[] = [
    { organization_id: org, property_id: P.aviatiei, user_id: A.mihai },
    { organization_id: org, property_id: P.corbeanca, user_id: A.mihai },
    { organization_id: org, property_id: P.aviatiei, user_id: A.admin },
    { organization_id: org, property_id: P.unirii, user_id: A.radu },
  ];
  {
    const { error } = await admin.from("property_favorites").insert(favorites, { defaultToNull: false });
    if (error) fail("Inserare favorite", error);
  }

  // ---------------- Org-level audit trail (visible to the demo agency admin) ----------------
  await admin.from("audit_logs").insert([
    { organization_id: org, actor_id: actorId, action: "qa.seeded", entity: "organizations", entity_id: org, new_values: { version: QA_SEED_VERSION } as never, created_by: actorId },
    { organization_id: org, actor_id: A.mihai, action: "property.created", entity: "properties", entity_id: P.aviatiei, new_values: { reference: "RF-1001" } as never, created_at: iso(ago(30)) },
    { organization_id: org, actor_id: A.radu, action: "lead.stage_changed", entity: "leads", entity_id: L.voicu, old_values: { stage: "negotiation" } as never, new_values: { stage: "transaction" } as never, created_at: iso(ago(2, 15)) },
  ]);

  // ---------------- Mark seeded ----------------
  {
    const { error } = await admin
      .from("organizations")
      .update({ demo_seeded_at: nowIso, demo_seed_version: QA_SEED_VERSION, updated_by: actorId })
      .eq("id", org)
      .eq("is_demo", true);
    if (error) fail("Marcare seed", error);
  }

  // ---------------- Matching summary (computed with the real algorithm) ----------------
  const matchable = properties.filter((p) => ["active", "reserved", "negotiation"].includes(p.status ?? "active"));
  let matchesOver60 = 0;
  const reqRows = requests as unknown as Tables<"requests">[];
  const propRows = matchable as unknown as Tables<"properties">[];
  for (const r of reqRows) for (const p of propRows) if (scoreMatch(r, p).score >= 60) matchesOver60++;
  const dReq = reqRows.find((r) => r.id === R.ioana)!;
  const dTop = propRows
    .map((p) => ({ reference: p.reference ?? "", score: scoreMatch(dReq, p).score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    counts: {
      users: 4,
      contacts: contacts.length,
      properties: properties.length,
      property_images: images.length,
      requests: requests.length,
      leads: leads.length,
      lead_events: events.length,
      activities: activities.length,
      upcoming_events: activities.filter((a) => a.status === "planned" && !!a.starts_at && new Date(a.starts_at) > NOW()).length,
      goals: goalRows.length,
      notifications: notifications.length,
      favorites: favorites.length,
      matches_over_60: matchesOver60,
    },
    scenarios: {
      A: { property_reference: "RF-1001", property_id: P.aviatiei, photos: photosForA, leads: 2, requests: 2 },
      B: { lead_name: "Bogdan Ilie", lead_id: L.bogdan, stage: "contacted" },
      C: { contact_name: "Alexandra Nistor", contact_id: C.alexandra },
      D: { request_title: dReq.title, request_id: R.ioana, top: dTop },
    },
  };
}
