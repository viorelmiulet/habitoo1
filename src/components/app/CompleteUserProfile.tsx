import { UserRound } from "lucide-react";
import type { CurrentUser } from "@/hooks/use-session";
import { ProfileEditForm } from "@/components/app/ProfileEditForm";

/** Ecranul obligatoriu „Completează-ți profilul”: nume complet și telefon mobil. */
export function CompleteUserProfile({ user }: { user: CurrentUser }) {
  const p = user.profile;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="panel w-full max-w-lg space-y-5 p-6">
        <div className="flex items-start gap-3">
          <UserRound className="mt-1 size-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Completează-ți profilul</h1>
            <p className="text-sm text-muted-foreground">
              Numele și telefonul tău apar pe portaluri, la anunțurile de care răspunzi. Completează-le ca
              să poți lucra în Habitoo.
            </p>
          </div>
        </div>
        <ProfileEditForm
          profile={{
            id: user.userId,
            full_name: p?.full_name ?? null,
            phone: p?.phone ?? null,
            job_title: p?.job_title ?? null,
            avatar_url: p?.avatar_url ?? null,
            email: user.email ?? null,
          }}
          submitLabel="Salvează și continuă"
        />
      </div>
    </div>
  );
}
