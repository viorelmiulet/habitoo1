import { useEffect, useState, type ReactNode } from "react";
import { Check, Code2, Copy, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiSpec, operations, requestExample, responseExample, schemaRows, schemaType, type Schema, type Operation } from "@/lib/developer-docs";

const sections = [
  ["introducere", "Introducere"], ["pornire", "Pornire rapidă"], ["onboarding", "Onboarding și chei"],
  ["autentificare", "Autentificare"], ["index", "Indexul agențiilor"], ["anunturi", "Feedul de anunțuri"],
  ["agenti", "Agenți și agenție"], ["poze", "Poze"], ["xml", "Feed XML (Kyero v3)"],
  ["leaduri", "Trimiterea lead-urilor"], ["vizionari", "Vizualizări"], ["erori", "Erori și coduri de răspuns"],
  ["limite", "Limite de cereri"], ["practici", "Bune practici"], ["istoric", "Istoric versiuni"], ["contact-tehnic", "Contact tehnic"],
] as const;

function CodeBlock({ text, label }: {text: string; label: string}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => { if (state === "idle") return; const t = setTimeout(() => setState("idle"), 2500); return () => clearTimeout(t); }, [state]);
  return <div className="my-4 min-w-0 max-w-full overflow-hidden rounded-lg bg-navy text-on-navy">
    <div className="flex items-center justify-between gap-2 border-b border-navy-foreground/20 px-4 py-2">
      <span className="min-w-0 text-xs text-navy-foreground">{label}</span>
      <Button variant="ghost" size="sm" className="shrink-0 text-on-navy hover:bg-sidebar-accent hover:text-on-navy" aria-label={`Copiază ${label}`} onClick={async () => {
        try { await navigator.clipboard.writeText(text); setState("copied"); } catch { setState("failed"); }
      }}>{state === "copied" ? <Check /> : <Copy />} {state === "copied" ? "Copiat" : "Copiază"}</Button>
    </div>
    <pre tabIndex={0} className="max-h-[420px] max-w-full overflow-auto p-4 text-xs leading-6 sm:text-sm"><code>{text}</code></pre>
    {state === "failed" && <p role="status" className="px-4 pb-3 text-xs text-navy-foreground">Copierea nu este disponibilă. Selectează codul pentru a-l copia.</p>}
  </div>;
}
function Description({schema}: {schema: Schema}) {
  const constraints = [schema.enum ? `Valori: ${schema.enum.map(String).join(", ")}.` : "", schema.const !== undefined ? `Valoare fixă: ${String(schema.const)}.` : "",
    schema.default !== undefined ? `Implicit: ${String(schema.default)}.` : "", schema.minimum !== undefined ? `Minim: ${schema.minimum}.` : "",
    schema.maximum !== undefined ? `Maxim: ${schema.maximum}.` : "", schema.maxLength !== undefined ? `Maximum ${schema.maxLength} caractere.` : "", schema.format ? `Format: ${schema.format}.` : ""];
  return <>{schema.description} {constraints.filter(Boolean).join(" ")}</>;
}
function FieldTable({schema}: {schema: Schema}) {
  const rows = schemaRows(schema);
  if (!rows.length) return null;
  const reserved = rows.filter(row => row.schema.type === "null");
  const fields = rows.filter(row => row.schema.type !== "null");
  return <div className="my-4 max-w-full">{reserved.length > 0 && !schema.description?.includes("Câmpuri rezervate pentru compatibilitate") && <p className="mb-4 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">Câmpuri rezervate pentru compatibilitate, întotdeauna <code>null</code>: {reserved.map(row => row.name).join(", ")}.</p>}<table className="w-full table-fixed text-left text-xs leading-5 sm:text-sm">
    <thead className="border-y bg-muted text-muted-foreground"><tr><th className="w-[35%] px-2 py-3 font-semibold">Câmp / tip</th><th className="px-2 py-3 font-semibold">Descriere</th></tr></thead>
    <tbody>{fields.map((row, i) => <tr key={`${row.name}-${i}`} className="border-b border-border align-top">
      <td className="break-words px-2 py-3 [overflow-wrap:anywhere]"><code className="font-semibold text-navy">{row.name}</code><div className="mt-1 text-muted-foreground">{schemaType(row.schema)}</div><div className="text-[11px] text-gold-dark">{row.required ? "Obligatoriu / prezent" : "Opțional"}</div></td>
      <td className="break-words px-2 py-3 text-muted-foreground [overflow-wrap:anywhere]"><Description schema={row.schema} /></td>
    </tr>)}</tbody>
  </table></div>;
}
function Endpoint({path, method, operation}: {path: string; method: string; operation: Operation}) {
  const response = responseExample(operation);
  return <article className="min-w-0 border-t border-border pt-7 first:border-0 first:pt-0">
    <h3 className="text-lg font-bold text-navy">{operation.summary}</h3>
    <div className="mt-3 flex items-start gap-3 rounded-md bg-muted px-3 py-3 text-sm"><span className={`shrink-0 font-bold ${method === "post" ? "text-gold-dark" : "text-success"}`}>{method.toUpperCase()}</span><code className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{path}</code></div>
    <p className="mt-4 leading-7 text-muted-foreground">{operation.description}</p>
    <p className="mt-3 text-sm font-semibold">{operation["x-authentication"]?.description ?? (operation.security?.length ? `Bearer pe agenție · Scop: ${operation["x-required-scopes"] ?? "conform tokenului"}` : "Fără token")}</p>
    {(operation.parameters?.length ?? 0) > 0 ? <table className="mt-4 w-full table-fixed text-left text-xs leading-5 sm:text-sm"><thead className="border-y bg-muted"><tr><th className="w-[35%] p-2">Parametru</th><th className="p-2">Descriere</th></tr></thead><tbody>{operation.parameters?.map(p => <tr key={`${p.in}-${p.name}`} className="border-b align-top"><td className="p-2 [overflow-wrap:anywhere]"><code className="font-semibold">{p.name}</code><div className="text-muted-foreground">{p.in} · {schemaType(p.schema)}</div><div className="text-gold-dark">{p.required ? "Obligatoriu" : "Opțional"}</div></td><td className="p-2 text-muted-foreground [overflow-wrap:anywhere]">{p.description} <Description schema={p.schema} /></td></tr>)}</tbody></table> : <p className="mt-3 text-sm text-muted-foreground">Fără parametri în cale sau query.</p>}
    {operation.requestBody?.content["application/json"]?.schema && <><h4 className="mt-6 font-semibold">Corpul cererii</h4><FieldTable schema={operation.requestBody.content["application/json"].schema} /></>}
    <CodeBlock text={requestExample(path, method, operation)} label={`curl · ${method.toUpperCase()} ${path}`} />
    <CodeBlock text={response.body} label={`Răspuns ${response.code} · ${response.format}`} />
    {response.schema && <details className="my-4"><summary className="cursor-pointer py-3 font-semibold text-navy">Schema completă a răspunsului</summary><FieldTable schema={response.schema} /></details>}
    <h4 className="mt-5 font-semibold">Coduri de răspuns</h4>
    <table className="mt-2 w-full table-fixed text-left text-sm"><tbody>{Object.entries(operation.responses).map(([code, value]) => <tr key={code} className="border-b align-top"><th className="w-16 p-2 font-mono text-navy">{code}</th><td className="p-2 leading-6 text-muted-foreground [overflow-wrap:anywhere]">{value.description}</td></tr>)}</tbody></table>
  </article>;
}
function Section({id, title, children}: {id: string; title: string; children: ReactNode}) {
  return <section id={id} className="min-w-0 scroll-mt-36 border-b border-border py-10 last:border-0 lg:scroll-mt-24"><h2 className="mb-5 text-2xl font-bold text-navy">{title}</h2><div className="min-w-0 space-y-5 leading-7">{children}</div></section>;
}
function Endpoints({match}: {match: (path: string) => boolean}) {
  return <div className="space-y-10">{operations.filter(o => match(o.path)).map(o => <Endpoint key={o.path + o.method} {...o} />)}</div>;
}
function AuthenticationDocs() {
  const auth = apiSpec["x-developer-guide"].authentication;
  return <>
    <h3 className="text-xl font-bold text-navy">Cheia de index</h3>
    <p>{auth.index.description}</p>
    <CodeBlock text={auth.index.example} label="curl · Cheia de index în URL" />
    <p className="text-sm text-muted-foreground">{auth.index.storage}</p>
    <h3 className="pt-4 text-xl font-bold text-navy">Tokenul agenției (<code>feed.token</code>)</h3>
    <p>{auth.agency.description}</p>
    <CodeBlock text={auth.agency.example} label="curl · Authorization: Bearer" />
    <h4 className="font-semibold">Metode acceptate pentru compatibilitate</h4>
    <p className="text-sm text-muted-foreground">{auth.agency.compatibilityNote}</p>
    <table className="w-full table-fixed text-left text-xs leading-6 sm:text-sm">
      <thead className="border-y bg-muted"><tr><th className="w-[38%] p-2">Metodă / nume exact</th><th className="p-2">Exemplu și utilizare</th></tr></thead>
      <tbody>{auth.compatibility.map(method => <tr key={method.scheme} className="border-b align-top">
        <td className="break-words p-2 [overflow-wrap:anywhere]"><span className="font-semibold">{method.label}</span></td>
        <td className="break-words p-2 text-muted-foreground [overflow-wrap:anywhere]"><code className="text-navy">{method.example}</code><p className="mt-2">{method.description}</p></td>
      </tr>)}</tbody>
    </table>
    <h3 className="pt-4 text-xl font-bold text-navy">Feedul XML</h3>
    <p>{auth.xml.description}</p>
    <CodeBlock text={auth.xml.example} label="curl · XML cu parametrul token" />
    <p className="text-sm text-muted-foreground">{auth.xml.compatibilityNote}</p>
    <p className="border-l-2 border-gold pl-4 text-sm">{auth.responseNote}</p>
  </>;
}
export function DeveloperDocs() {
  const [active, setActive] = useState("introducere");
  useEffect(() => {
    const update = () => {
      let current: string = "introducere";
      for (const [id] of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 155) current = id;
      }
      setActive(current);
    };
    window.addEventListener("scroll", update, {passive: true});
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);
  const guide = apiSpec["x-developer-guide"];
  const index = operations.find(o => o.path.includes("/index/"));
  const feed = operations.find(o => o.path.endsWith("/properties"));
  const jump = (id: string) => {setActive(id); document.getElementById(id)?.scrollIntoView({behavior: "instant", block: "start"}); history.replaceState(null, "", `#${id}`);};
  return <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div className="sticky top-16 z-30 -mx-4 border-b bg-background px-4 py-3 lg:hidden">
      <Select value={active} onValueChange={jump}><SelectTrigger aria-label="Secțiunea documentației" className="h-11 bg-card"><SelectValue /></SelectTrigger><SelectContent>{sections.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="grid min-w-0 gap-10 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-14">
      <aside className="hidden lg:block"><nav aria-label="Cuprins documentație API" className="sticky top-24 max-h-[calc(100vh-110px)] overflow-y-auto py-6">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-gold-dark"><Code2 className="size-4" /> Documentație API</div>
        {sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setActive(id)} aria-current={active === id ? "location" : undefined} className={`block border-l-2 px-4 py-2 text-sm transition-colors ${active === id ? "border-gold bg-gold-tint font-semibold text-navy" : "border-border text-muted-foreground hover:border-gold hover:text-navy"}`}>{label}</a>)}
        <p className="mt-6 px-4 text-xs text-muted-foreground">API v{apiSpec.info.version} · OpenAPI 3.1</p>
      </nav></aside>
      <div className="min-w-0 pb-12">
        <header className="border-b border-border py-10 sm:py-14">
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-gold-dark"><Code2 className="size-5" /> Habitoo / Dezvoltatori</p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight text-navy sm:text-4xl">API Habitoo pentru portaluri imobiliare</h1>
          <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">Anunțuri, agenți, fotografii și lead-uri. Un contract comun pentru agențiile care aleg portalul tău.</p>
          <div className="mt-7 flex flex-wrap items-center gap-4"><Button asChild><a href="/dezvoltatori/openapi.json" target="_blank" rel="noopener noreferrer"><Download /> Descarcă OpenAPI</a></Button><span className="text-xs text-muted-foreground">Versiunea {apiSpec.info.version}</span></div>
        </header>
        <Section id="introducere" title="Introducere"><p>{guide.introduction}</p><p className="text-sm text-muted-foreground">Exemplele sunt ilustrative, generate din scheme; toate identitățile și cheile sunt fictive. API-ul nu este apelat din această pagină.</p></Section>
        <Section id="pornire" title="Pornire rapidă">{guide.quickStart.map((text, i) => <div key={text}><h3 className="flex gap-3 text-base font-semibold"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold-tint text-gold-dark">{i+1}</span>{text}</h3>{i === 0 && index && <CodeBlock text={requestExample(index.path, index.method, index.operation)} label="1 · Citește indexul" />}{i === 1 && feed && <CodeBlock text={`# FEED_BASE este valoarea feed.base_url din index\nFEED_BASE="${apiSpec.servers[0]?.url}/api/public/sites/v1"\n${requestExample(feed.path, feed.method, feed.operation)}`} label="2 · Citește prima pagină" />}{i === 2 && feed && <CodeBlock text={responseExample(feed.operation).body} label="3 · Exemplu de inventar JSON" />}</div>)}</Section>
        <Section id="onboarding" title="Onboarding și chei">{guide.onboarding.map(p => <p key={p}>{p}</p>)}</Section>
        <Section id="autentificare" title="Autentificare"><AuthenticationDocs /></Section>
        <Section id="index" title="Indexul agențiilor"><Endpoints match={p => p.includes("/index/")} /></Section>
        <Section id="anunturi" title="Feedul de anunțuri"><p>{guide.recommendations[0]}</p><p>{guide.recommendations[3]}</p><Endpoints match={p => p.includes("/properties")} /><h3 className="pt-4 text-xl font-bold">Toate câmpurile anunțului</h3><p className="text-sm text-muted-foreground">{apiSpec.components.schemas.FeedProperty?.description}</p><FieldTable schema={apiSpec.components.schemas.FeedProperty ?? {}} /></Section>
        <Section id="agenti" title="Agenți și agenție"><Endpoints match={p => p.endsWith("/agents") || p.endsWith("/agency")} /></Section>
        <Section id="poze" title="Poze"><p>{guide.recommendations[2]}</p><Endpoints match={p => p.includes("/media/")} /></Section>
        <Section id="xml" title="Feed XML (Kyero v3)"><Endpoints match={p => p.endsWith("feed.xml")} /></Section>
        <Section id="leaduri" title="Trimiterea lead-urilor"><Endpoints match={p => p.endsWith("/contacts")} /></Section>
        <Section id="vizionari" title="Vizualizări"><p className="border-l-2 border-gold pl-4 font-semibold">În acest API, „visits” înseamnă vizualizări ale anunțurilor, nu programări de vizionare.</p><Endpoints match={p => p.endsWith("/visits")} /></Section>
        <Section id="erori" title="Erori și coduri de răspuns"><p>Codurile posibile sunt listate la fiecare endpoint. Erorile JSON urmează exemplul de mai jos; unele răspunsuri au corp gol sau text simplu, conform codului și formatului documentat la fiecare endpoint.</p><CodeBlock text={JSON.stringify({error: "Invalid or revoked API token.", api_version: apiSpec.components.schemas.Error?.properties?.api_version?.const}, null, 2)} label="Exemplu de eroare JSON · 401" /><h3 className="font-semibold">Particularități și limite pentru integrare</h3><ul className="list-disc space-y-3 pl-5 text-sm text-muted-foreground">{apiSpec["x-code-ambiguities"].map(p => <li key={p}>{p}</li>)}</ul></Section>
        <Section id="limite" title="Limite de cereri"><p>{apiSpec.info.description}</p></Section>
        <Section id="practici" title="Bune practici"><ul className="list-disc space-y-4 pl-5">{guide.recommendations.map(p => <li key={p}>{p}</li>)}</ul></Section>
        <Section id="istoric" title="Istoric versiuni">{guide.history.map(v => <div key={v.version}><h3 className="font-semibold">v{v.version} <span className="ml-3 text-sm font-normal text-muted-foreground">{v.date}</span></h3><p className="mt-2">{v.description}</p></div>)}</Section>
        <Section id="contact-tehnic" title="Contact tehnic"><p>Pentru acces pilot, rotirea cheilor și întrebări de integrare:</p><Button asChild variant="outline"><a href={`mailto:${guide.contact}`}>{guide.contact} <ExternalLink /></a></Button></Section>
      </div>
    </div>
  </div>;
}