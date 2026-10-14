import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { publicHead } from "@/components/marketing/public-head";
import { getMetaDeletionStatus } from "@/lib/meta/meta.functions";

const TITLE = "Ștergerea datelor Facebook și Instagram — Habitoo";
const DESCRIPTION =
  "Cum ștergi din Habitoo datele paginilor de Facebook și ale conturilor de Instagram Business conectate, și cum verifici starea unei cereri de ștergere.";

export const Route = createFileRoute("/stergere-date")({
  validateSearch: (s) => z.object({ cod: z.string().optional() }).parse(s),
  head: () => {
    const h = publicHead({ path: "/stergere-date", title: TITLE, description: DESCRIPTION });
    h.meta.push({ name: "robots", content: "noindex, follow" });
    return h;
  },
  component: DeletionPage,
});

function Status({ code }: { code: string }) {
  const load = useServerFn(getMetaDeletionStatus);
  const valid = /^[0-9a-f]{24}$/.test(code);
  const q = useQuery({ queryKey: ["meta-deletion", code], queryFn: () => load({ data: { code } }), enabled: valid });
  if (!valid) return <p>Codul de confirmare nu este valid.</p>;
  if (q.isLoading) return <p>Se verifică cererea…</p>;
  if (q.isError || !q.data) return <p>Nu am putut verifica cererea. Încearcă din nou.</p>;
  if (!q.data.found) return <p>Nu am găsit nicio cerere cu acest cod.</p>;
  const d = new Date(q.data.completedAt ?? q.data.createdAt).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" });
  return q.data.status === "completed" ? (
    <p>
      Cererea <strong>{code}</strong> a fost finalizată pe {d}. Tokenurile și datele paginilor și conturilor de
      Instagram legate de contul tău de Facebook au fost șterse din Habitoo.
    </p>
  ) : (
    <p>Cererea <strong>{code}</strong> a fost primită pe {d} și este în curs de procesare.</p>
  );
}

function DeletionPage() {
  const { cod } = Route.useSearch();
  const sections: LegalSection[] = [
    ...(cod ? [{ title: "Starea cererii", body: <Status code={cod} /> }] : []),
    {
      title: "Ce date păstrăm",
      body: (
        <p>
          Când o agenție conectează Facebook și Instagram, Habitoo păstrează numele și poza paginilor, conturile de
          Instagram Business legate, cine a făcut conectarea și când, precum și accesul (criptat) necesar pentru a
          posta în numele agenției.
        </p>
      ),
    },
    {
      title: "Cum ștergi datele",
      body: (
        <ol className="list-decimal space-y-1 pl-5">
          <li>Din Habitoo: Setări → Promovare → „Deconectează”. Accesul se șterge imediat.</li>
          <li>
            Din Facebook: Setări și confidențialitate → Setări → Aplicații și site-uri web → Habitoo → Elimină. Poți
            bifa și ștergerea activității; Habitoo șterge atunci toate datele salvate și îți dă un cod de confirmare.
          </li>
          <li>
            Sau scrie-ne la <a href="mailto:contact@habitoo.ro">contact@habitoo.ro</a>.
          </li>
        </ol>
      ),
    },
  ];
  return (
    <LegalPage
      eyebrow="Date Facebook și Instagram"
      title="Ștergerea datelor Facebook și Instagram"
      intro="Poți cere oricând ștergerea datelor paginilor și conturilor tale conectate la Habitoo."
      sections={sections}
    />
  );
}
