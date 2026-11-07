import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  mapPropertyToFeed,
  mapImage,
  mapAgent,
  type PropertyRow,
  type PropertyImageRow,
  type ProfileRow,
} from "../src/lib/site-feed/mapper";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const spec = JSON.parse(read("public/dezvoltatori/openapi.json"));
const source = (path: string) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
const nameOf = (node: ts.Node | undefined) =>
  node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;

// Independent inventory: a removed route fails even if documentation is also edited.
const portals = ["clickimob", "imobli", "locuit", "imobiliareplus", "imove", "bazaruldecase"];
const routes = [
  ...portals.map((portal) => ({
    file: `src/routes/api/public/feed/${portal}/[index]/$indexKey.ts`,
    route: `/api/public/feed/${portal}/index/$indexKey`,
    documented: "/api/public/feed/{portal}/index/{indexKey}",
    methods: ["GET"],
  })),
  ...[
    ["properties.ts", "properties", ["GET"]],
    ["properties.$id.ts", "properties/$id", ["GET"]],
    ["agents.ts", "agents", ["GET"]],
    ["agency.ts", "agency", ["GET"]],
    ["media.$id.ts", "media/$id", ["GET"]],
    ["media.agent.$id.ts", "media/agent/$id", ["GET"]],
    ["media.agency.$id.ts", "media/agency/$id", ["GET"]],
    ["contacts.ts", "contacts", ["POST"]],
    ["visits.ts", "visits", ["GET", "POST"]],
  ].map(([file, path, methods]) => ({
    file: `src/routes/api/public/sites/v1/${file}`,
    route: `/api/public/sites/v1/${path}`,
    documented: `/api/public/sites/v1/${String(path).replace("$id", "{id}")}`,
    methods: methods as string[],
  })),
  {
    file: "src/routes/api/public/portal/v1/bazaruldecase.feed[.]xml.ts",
    route: "/api/public/portal/v1/bazaruldecase/feed.xml",
    documented: "/api/public/portal/v1/bazaruldecase/feed.xml",
    methods: ["GET"],
  },
];

function routeContract(path: string) {
  const paths: string[] = [];
  const methods: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && nameOf(node.expression) === "createFileRoute") {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) paths.push(arg.text);
    }
    if (ts.isPropertyAssignment(node) && nameOf(node.name) === "handlers" && ts.isObjectLiteralExpression(node.initializer)) {
      for (const prop of node.initializer.properties) {
        const name = nameOf(prop.name);
        if (name) methods.push(name);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source(path));
  return { paths, methods };
}

function assertObjectFields(value: unknown, schema: any, path: string) {
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    const target = spec.components.schemas[name];
    expect(target, `Missing schema ${name}`).toBeDefined();
    return assertObjectFields(value, target, path);
  }
  if (schema.properties && value && typeof value === "object" && !Array.isArray(value)) {
    expect(Object.keys(value).sort(), path).toEqual(Object.keys(schema.properties).sort());
    expect(schema.required.slice().sort(), `${path}: emitted fields must be required`).toEqual(Object.keys(value).sort());
    for (const [key, item] of Object.entries(value)) assertObjectFields(item, schema.properties[key], `${path}.${key}`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => assertObjectFields(item, schema.items, `${path}[${i}]`));
  }
  if (schema.enum) expect(schema.enum, path).toContain(value);
  if (schema.const !== undefined) expect(value, path).toBe(schema.const);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    expect(types.includes(actual) || (actual === "number" && types.includes("integer") && Number.isInteger(value)), `${path}: ${actual}`).toBe(true);
  }
}

describe("D1 — public portal OpenAPI contract", () => {
  it("retains every requested route and HTTP method in code and documentation", () => {
    for (const route of routes) {
      const actual = routeContract(route.file);
      expect(actual.paths, route.file).toContain(route.route);
      for (const method of route.methods) {
        expect(actual.methods, route.file).toContain(method);
        expect(spec.paths[route.documented]?.[method.toLowerCase()], `${route.documented} ${method}`).toBeDefined();
      }
    }
    expect(Object.keys(spec.paths).sort()).toEqual([...new Set(routes.map((r) => r.documented))].sort());
  });

  it("matches INDEX_PORTALS without presenting Properstar as the JSON index model", () => {
    let actual: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && nameOf(node.name) === "INDEX_PORTALS" && node.initializer) {
        const initializer = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (ts.isObjectLiteralExpression(initializer)) actual = initializer.properties.map((p) => nameOf(p.name) ?? "");
      }
      ts.forEachChild(node, visit);
    }
    visit(source("src/lib/portals/clickimob/index-feed.ts"));
    const parameter = spec.paths["/api/public/feed/{portal}/index/{indexKey}"].get.parameters.find((p: any) => p.name === "portal");
    expect(actual.sort()).toEqual(portals.slice().sort());
    expect(parameter.schema.enum.slice().sort()).toEqual(actual);
  });

  it("fails when any documented property field disappears from the real mapper", () => {
    const property = {
      id: "11111111-1111-4111-8111-111111111111", reference: "HB-900001",
      title: "Proprietate fictivă", property_type: "apartment", transaction_kind: "sale",
      status: "active", publish_status: "published", price: 100000, currency: "EUR",
      for_sale: true, for_rent: false, lat: null, lng: null,
    } as unknown as PropertyRow;
    const mapped = mapPropertyToFeed(property, {
      baseUrl: "https://www.habitoo.ro", publicSiteUrl: "https://www.habitoo.ro",
    });
    assertObjectFields(mapped, spec.components.schemas.FeedProperty, "FeedProperty");
    expect(Object.keys(mapped)).toHaveLength(87);
    expect(mapped.idstr).toBe("HB-900001");
    expect(mapped.devanzare).toBe(true);
    expect(mapped.deinchiriere).toBe(false);
    expect(mapped.pretvanzare).toBe(100000);
    expect(mapped.monedavanzare).toBe("EUR");
  });

  it("retains nested image and agent fields from the real mappers", () => {
    const image = { id: "22222222-2222-4222-8222-222222222222", is_primary: true } as unknown as PropertyImageRow;
    assertObjectFields(mapImage(image, "https://www.habitoo.ro"), spec.components.schemas.FeedImage, "FeedImage");
    const profile = { id: "33333333-3333-4333-8333-333333333333", full_name: "Agent fictiv", is_active: true } as unknown as ProfileRow;
    assertObjectFields(mapAgent(profile, "https://www.habitoo.ro"), spec.components.schemas.FeedAgent, "FeedAgent");
  });

  it("uses OpenAPI 3.1 and resolves every local schema/security reference", () => {
    expect(spec.openapi).toBe("3.1.0");
    function visit(node: any) {
      if (!node || typeof node !== "object") return;
      if (node.$ref) {
        expect(node.$ref.startsWith("#/components/schemas/")).toBe(true);
        expect(spec.components.schemas[node.$ref.split("/").pop()]).toBeDefined();
      }
      if (node.security) for (const requirement of node.security) for (const key of Object.keys(requirement)) expect(spec.components.securitySchemes[key]).toBeDefined();
      for (const item of Object.values(node)) visit(item);
    }
    visit(spec);
    expect(spec.paths["/api/public/sites/v1/visits"].post.responses["404"].content["application/json"].schema.$ref).toBe("#/components/schemas/VisitResult");
  });

  it("keeps the specified public address and fictitious credentials only", () => {
    expect(spec.servers[0].url).toBe("https://www.habitoo.ro");
    const text = JSON.stringify(spec);
    expect(text).not.toMatch(/supabase\.co|localhost|id-preview|project--|crm\.habitoo\.ro|sb_(?:secret|publishable)_/);
    expect(text).not.toMatch(/(?:hbci_|hbim_|hblo_|hbip_|hbmv_|hbbc_|hbt_)\w+\.[a-zA-Z0-9_-]+/);
    expect(text).toContain("hbxx_EXEMPLU");
  });
});