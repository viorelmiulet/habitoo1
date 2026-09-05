import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Building2, CalendarClock, Search, UserRound, Target, Flame } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

type Result =
  | { kind: "property"; id: string; label: string; meta: string }
  | { kind: "contact"; id: string; label: string; meta: string }
  | { kind: "lead"; id: string; label: string; meta: string }
  | { kind: "request"; id: string; label: string; meta: string }
  | { kind: "activity"; id: string; label: string; meta: string };

async function search(term: string): Promise<Result[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const [props, contacts, leads, requests, activities] = await Promise.all([
    supabase
      .from("properties")
      .select("id,title,reference,city,district,external_id,address")
      .or(`title.ilike.${like},reference.ilike.${like},city.ilike.${like},address.ilike.${like},external_id.ilike.${like}`)
      .limit(5),
    supabase
      .from("contacts")
      .select("id,first_name,last_name,phone,email,type")
      .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(5),
    supabase
      .from("leads")
      .select("id,name,phone,stage,email")
      .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(5),
    supabase.from("requests").select("id,title,kind").ilike("title", like).limit(5),
    supabase.from("activities").select("id,title,kind,starts_at").ilike("title", like).limit(5),
  ]);

  const results: Result[] = [];
  for (const p of props.data ?? [])
    results.push({
      kind: "property",
      id: p.id,
      label: p.title,
      meta: [p.reference, p.city, p.district].filter(Boolean).join(" · "),
    });
  for (const c of contacts.data ?? [])
    results.push({
      kind: "contact",
      id: c.id,
      label: `${c.first_name} ${c.last_name}`.trim(),
      meta: [c.phone, c.email].filter(Boolean).join(" · "),
    });
  for (const l of leads.data ?? [])
    results.push({ kind: "lead", id: l.id, label: l.name, meta: [l.phone, l.email].filter(Boolean).join(" · ") });
  for (const r of requests.data ?? [])
    results.push({ kind: "request", id: r.id, label: r.title, meta: r.kind });
  for (const a of activities.data ?? [])
    results.push({ kind: "activity", id: a.id, label: a.title, meta: a.kind });
  return results;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => search(debounced),
    enabled: open && debounced.trim().length >= 2,
  });

  const go = (r: Result) => {
    setOpen(false);
    setTerm("");
    if (r.kind === "property") navigate({ to: "/app/properties/$id", params: { id: r.id } });
    else if (r.kind === "contact") navigate({ to: "/app/contacts/$id", params: { id: r.id } });
    else if (r.kind === "lead") navigate({ to: "/app/leads" });
    else if (r.kind === "activity") navigate({ to: "/app/activities" });
    else navigate({ to: "/app/requests" });
  };

  const groups: Array<{ kind: Result["kind"]; title: string; icon: typeof Building2 }> = [
    { kind: "property", title: "Proprietăți", icon: Building2 },
    { kind: "contact", title: "Contacte", icon: UserRound },
    { kind: "lead", title: "Lead-uri", icon: Flame },
    { kind: "request", title: "Cereri", icon: Target },
    { kind: "activity", title: "Activități", icon: CalendarClock },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Search className="size-4" />
        <span className="min-w-0 truncate">Caută proprietăți, contacte, telefoane, ID-uri…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Caută în toată agenția…"
        />
        <CommandList>
          {term.trim().length < 2 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Scrie minim 2 caractere. Funcționează și cu numere de telefon sau ID-uri externe.
            </div>
          ) : isFetching && results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Se caută…</div>
          ) : (
            <CommandEmpty>Niciun rezultat.</CommandEmpty>
          )}
          {groups.map(({ kind, title, icon: Icon }) => {
            const items = results.filter((r) => r.kind === kind);
            if (items.length === 0) return null;
            return (
              <CommandGroup key={kind} heading={title}>
                {items.map((r) => (
                  <CommandItem key={`${r.kind}-${r.id}`} value={`${r.label} ${r.meta} ${r.id}`} onSelect={() => go(r)}>
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="truncate">{r.label}</span>
                    {r.meta ? (
                      <span className="ml-auto truncate text-xs text-muted-foreground">{r.meta}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
