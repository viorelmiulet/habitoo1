import { afterEach, expect, it, vi } from "vitest";
import { imobiliareRequest } from "../src/lib/portals/imobiliare/client.server";
import { relayFetch } from "../src/lib/portals/relay.server";
import { republishIsStalled } from "../src/lib/portals/publication-resilience";
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each([false,true])("Imobiliare hangs: TIMEOUT at 15 seconds (relay=%s)", async (relayed) => {
  vi.useFakeTimers();
  vi.stubEnv("PORTAL_RELAY_KEY",relayed?"fixture-key":"");
  const f=vi.fn(()=>new Promise<Response>(()=>{})); vi.stubGlobal("fetch",f);
  // No real health writes: mock only the durable transport recorder.
  const request=imobiliareRequest({method:"GET",path:"/api/v3/me",connectionKey:crypto.randomUUID()});
  await vi.advanceTimersByTimeAsync(14999); expect(f).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  const out=await request;
  expect(out).toMatchObject({ok:false,attempts:1,durationMs:15000,classification:{code:"TIMEOUT",message:"Imobiliare.ro nu a răspuns în 15 secunde",action:"stop"}});
});
vi.mock("../src/lib/portals/relay-health.server",()=>({recordRelayResponse:vi.fn(async()=>{})}));
it("deadline also bounds a stalled Imobiliare response body",async()=>{
  vi.useFakeTimers();vi.stubEnv("PORTAL_RELAY_KEY","");
  vi.stubGlobal("fetch",vi.fn(async()=>({text:()=>new Promise(()=>{})})));
  const req=imobiliareRequest({method:"GET",path:"/api/v3/me",connectionKey:crypto.randomUUID(),timeoutMs:90000});
  await vi.advanceTimersByTimeAsync(15000);
  expect((await req).classification?.code).toBe("TIMEOUT");
});
it("relay times out without exposing keys even with ignored abort",async()=>{
  vi.useFakeTimers();
  const req=relayFetch("vdi","https://vdi.ro/api",{},vi.fn(()=>new Promise(()=>{})),{key:"private-fixture"});
  const observed=req.catch(e=>e);
  await vi.advanceTimersByTimeAsync(15000);
  const err=await observed; expect(err.name).toBe("AbortError");expect(err.message).not.toContain("private-fixture");
});
it("stalled batch requires both 30-minute age and 10-minute absence of completions",()=>{
  const now=Date.UTC(2026,10,8,15); const ago=(min:number)=>new Date(now-min*60000).toISOString();
  expect(republishIsStalled(ago(31),ago(11),now)).toBe(true);
  expect(republishIsStalled(ago(30),ago(11),now)).toBe(false);
  expect(republishIsStalled(ago(31),ago(10),now)).toBe(false);
  expect(republishIsStalled(ago(31),null,now)).toBe(true);
});