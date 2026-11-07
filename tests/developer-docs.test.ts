import { describe, expect, it } from "vitest";
import { apiSpec, operations, requestExample, responseExample, schemaRows } from "../src/lib/developer-docs";

describe("Documentation generated from the public OpenAPI", () => {
  it("includes every current operation including both visit methods", () => {
    expect(operations).toHaveLength(12);
    expect(operations.filter(o => o.path.endsWith("/visits")).map(o => o.method).sort()).toEqual(["get", "post"]);
  });
  it("includes every property field and the nested image fields from the contract", () => {
    const rows = schemaRows(apiSpec.components.schemas.FeedProperty ?? {});
    expect(rows.filter(r => !r.name.includes(".") && !r.name.includes("[]"))).toHaveLength(87);
    expect(rows.find(r => r.name === "images[].src")?.schema.type).toBe("string");
    expect(rows.find(r => r.name === "titlu.ro")?.required).toBe(true);
  });
  it("generates index requests with a fictional index key, not an agency bearer", () => {
    const endpoint = operations.find(o => o.path.includes("/index/"));
    if (!endpoint) throw new Error("Missing index");
    const example = requestExample(endpoint.path, endpoint.method, endpoint.operation);
    expect(example).toContain("/clickimob/index/hbxx_EXEMPLU_INDEX_FICTIV");
    expect(example).not.toContain("Authorization");
  });
  it("generates agency requests using the discovered base and fictional bearer", () => {
    const endpoint = operations.find(o => o.path.endsWith("/properties"));
    if (!endpoint) throw new Error("Missing properties");
    const request = requestExample(endpoint.path, endpoint.method, endpoint.operation);
    expect(request).toContain("$FEED_BASE/properties?page=1&per_page=50");
    expect(request).toContain("Authorization: Bearer hbxx_EXEMPLU_AGENTIE.SEMNATURA_FICTIVA");
    const body = JSON.parse(responseExample(endpoint.operation).body);
    expect(body.data[0].idstr).toBe("HB-900001");
    expect(body.api_version).toBe("habitoo-site-feed/1.0");
  });
  it("uses the exact lead example and XML response from OpenAPI", () => {
    const contact = operations.find(o => o.path.endsWith("/contacts"));
    const xml = operations.find(o => o.path.endsWith("feed.xml"));
    if (!contact || !xml) throw new Error("Missing contact/XML");
    const body = contact.operation.requestBody?.content["application/json"]?.example;
    expect(requestExample(contact.path, contact.method, contact.operation)).toContain(JSON.stringify(body, null, 2));
    expect(responseExample(xml.operation).body).toBe(xml.operation.responses["200"]?.content?.["application/xml"]?.example);
  });
  it("treats media as a redirect with no bearer and no invented JSON response", () => {
    const endpoint = operations.find(o => o.path === "/api/public/sites/v1/media/{id}");
    if (!endpoint) throw new Error("Missing media");
    const example = requestExample(endpoint.path, endpoint.method, endpoint.operation);
    expect(example).toContain("curl -L");
    expect(example).toContain("w=800&h=600&fit=contain");
    expect(example).not.toContain("Authorization");
    expect(responseExample(endpoint.operation).code).toBe("302");
    expect(responseExample(endpoint.operation).format).toBe("HTTP");
  });
  it("keeps the onboarding contact and three steps in the public source", () => {
    expect(apiSpec["x-developer-guide"].contact).toBe("contact@habitoo.ro");
    expect(apiSpec["x-developer-guide"].quickStart).toHaveLength(3);
    const index = operations.find(o => o.path.includes("/index/"));
    if (!index) throw new Error("Missing index");
    const body = JSON.parse(responseExample(index.operation).body);
    expect(body.agencies[0].feed.base_url).toBe("https://www.habitoo.ro/api/public/sites/v1");
    expect(body.agencies[0].feed.token).toBe("hbxx_EXEMPLU_AGENTIE.SEMNATURA_FICTIVA");
  });
});