import { describe, expect, it } from "vitest";
import { compactListSearch, listStateKey, readListState, validateListSearch } from "./list-state";

describe("persistent applied list state", () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null };
  it("retains MAP county, prices, rooms, page 2 and scroll after a fresh read", () => {
    const search = { judet: "București", pretMin: 10000, pretMax: 150000, camere: "2,3", pagina: 2, perPagina: 50 };
    memory.set(listStateKey("agent-a", "map-habitoo"), JSON.stringify({ search, scroll: 2000 }));
    expect(readListState(storage, "agent-a", "map-habitoo")).toEqual({ search, scroll: 2000 });
  });
  it("never shares filters between different agents on the same computer", () => {
    expect(readListState(storage, "agent-b", "map-habitoo")).toBeNull();
  });
  it("keeps MAP Facebook independent of MAP Habitoo", () => {
    expect(readListState(storage, "agent-a", "map-facebook")).toBeNull();
  });
  it("clearing a list leaves a new visit without saved filters", () => {
    memory.set(listStateKey("agent-a", "properties"), JSON.stringify({ search: { page: 2, rooms: "3" }, scroll: 900 }));
    memory.delete(listStateKey("agent-a", "properties"));
    expect(readListState(storage, "agent-a", "properties")).toBeNull();
  });
  it("does not persist create-dialog or property/contract prefill actions", () => {
    expect(compactListSearch({ q: "Militari", new: true, nou: true, contract: "id", proprietate: "id", page: undefined })).toEqual({ q: "Militari" });
  });
  it("retains typed filters and pagination while rejecting foreign fields", () => {
    expect(validateListSearch({ q: "", page: 0, mine: false }, { q: "client", page: 2, mine: true, secret: "x" })).toEqual({ q: "client", page: 2, mine: true });
  });
  it("handles invalid browser storage without crashing the list", () => {
    expect(readListState({ getItem: () => "{broken" }, "agent-a", "properties")).toBeNull();
    expect(readListState({ getItem: () => '{"search":null}' }, "agent-a", "properties")).toBeNull();
  });
  it("compares browser-back URLs independently of query parameter order", () => {
    expect(JSON.stringify(compactListSearch({ q: "HB", perPagina: 15, page: 2 }))).toBe(JSON.stringify(compactListSearch({ page: 2, q: "HB", perPagina: 15 })));
  });
});