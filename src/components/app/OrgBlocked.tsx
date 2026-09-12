import { Archive, Clock, ShieldOff, XCircle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import type { OrgBlockReason } from "@/lib/org-access";
import { clearAuthenticatedSession } from "@/lib/sign-out";

/** Text dedicat pentru fiecare motiv de blocare, cu indicația cui să se adreseze. */
const BLOCKED: Record<
  OrgBlockReason,
  { title: string; body: string; contact: string; icon: typeof Clock }
> = {
  pending_approval: {
    title: "Agenția așteaptă aprobarea",
    body: "Cererea de înscriere a agenției tale este în verificare. Accesul se activează imediat după validare.",
    contact: "Dacă durează mai mult decât te așteptai, scrie-ne la contact@habitoo.ro.",
    icon: Clock,
  },
  suspended: {
    title: "Accesul agenției este suspendat",
    body: "Contul agenției tale este suspendat temporar, așa că modulele CRM nu sunt disponibile momentan. Datele rămân salvate.",
    contact:
      "Pentru reactivare, discută cu administratorul agenției tale sau scrie-ne la contact@habitoo.ro.",
    icon: ShieldOff,
  },
  cancelled: {
    title: "Abonamentul agenției a fost anulat",
    body: "Contul agenției tale a fost anulat, iar accesul la aplicație este oprit. Datele rămân disponibile pentru reactivare.",
    contact: "Pentru reluarea colaborării, scrie-ne la contact@habitoo.ro.",
    icon: XCircle,
  },
  expired: {
    title: "Abonamentul agenției a expirat",
    body: "Abonamentul agenției tale a expirat. Contactează administratorul platformei.",
    contact:
      "Pentru reînnoire, discută cu administratorul agenției tale sau scrie-ne la contact@habitoo.ro.",
    icon: XCircle,
  },
  archived: {
    title: "Agenția a fost arhivată",
    body: "Contul agenției tale a fost arhivat. Arhivarea oprește accesul, dar nu șterge nimic.",
    contact:
      "Dacă e o greșeală, administratorul agenției sau echipa Habitoo (contact@habitoo.ro) poate reactiva contul.",
    icon: Archive,
  },
};


/** Ecran dedicat pentru membrii unei agenții suspendate, anulate sau arhivate. */
export function OrgBlocked({ reason }: { reason: OrgBlockReason }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const info = BLOCKED[reason];
  const Icon = info.icon;

  const signOut = async () => {
    await clearAuthenticatedSession(queryClient);
    await navigate({ to: "/login", replace: true });
  };

  return (
    <AuthShell title={info.title} subtitle={info.body}>
      <div className="space-y-5 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="size-6" />
        </span>
        <p className="text-sm text-muted-foreground">{info.contact}</p>
        <Button variant="outline" className="w-full" onClick={signOut}>
          Deconectare
        </Button>
      </div>
    </AuthShell>
  );
}
