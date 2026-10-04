/**
 * Detaliile extinse ale unei cereri de înscriere agenție (SuperAdmin, doar
 * citire): cererea, firma din ANAF/organizație, organizația creată și
 * contactul utilizatorului. Câmpurile goale apar ca „—”.
 */
import { Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/format";
import { PLAN_LABELS, normalizePlan } from "@/lib/plans";
import { SUBSCRIPTION_TERM_LABELS } from "@/lib/subscription";
import { COMPANY_STATUS_LABEL } from "@/lib/company-lookup";
import type { RegistrationRequestDetails } from "@/lib/registration-request-details.functions";

const DASH = "—";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value ?? DASH}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

const requestStatusLabels: Record<string, string> = {
  pending: "În așteptare",
  approved: "Aprobată",
  rejected: "Respinsă",
};

const orgStatusLabels: Record<string, string> = {
  active: "Activă",
  trial: "Trial",
  suspended: "Suspendată",
  pending_approval: "În așteptare",
  cancelled: "Anulată",
};

export function RegistrationRequestDetails({ details }: { details: RegistrationRequestDetails }) {
  const { request: r, company: c, organization: o, contact } = details;
  const companyStatusLabel = c.companyStatus
    ? ((COMPANY_STATUS_LABEL as Record<string, string>)[c.companyStatus] ?? c.companyStatus)
    : null;
  const companyStatusText = companyStatusLabel
    ? c.companyStatus === "inactiva" && c.companyStatusSince
      ? `${companyStatusLabel} (din ${formatDate(c.companyStatusSince)})`
      : companyStatusLabel
    : null;

  return (
    <div className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
      <Section title="Cerere">
        <Field label="Nume agenție" value={r.agencyName} />
        <Field label="Persoană de contact" value={r.fullName} />
        <Field label="Email" value={r.email} />
        <Field label="Telefon" value={r.phone} />
        <Field label="Plan cerut" value={PLAN_LABELS[normalizePlan(r.requestedPlan)]} />
        <Field
          label="Termen cerut"
          value={
            SUBSCRIPTION_TERM_LABELS[r.requestedTerm as keyof typeof SUBSCRIPTION_TERM_LABELS] ??
            r.requestedTerm
          }
        />
        <Field label="Data cererii" value={formatDate(r.createdAt)} />
        <Field label="Status" value={requestStatusLabels[r.status] ?? r.status} />
        <Field label="Verificată de" value={r.reviewedByName} />
        <Field label="Verificată la" value={r.reviewedAt ? formatDate(r.reviewedAt) : null} />
        <Field label="Motivul respingerii" value={r.rejectionReason} />
      </Section>

      <Section title="Firmă (ANAF și organizație)">
        <Field label="Denumire legală" value={c.legalName} />
        <Field label="CUI" value={c.cui} />
        <Field label="Nr. Registrul Comerțului" value={c.tradeRegistryNumber} />
        <Field label="Adresa sediului social" value={c.registeredAddress} />
        <Field label="Oraș" value={c.city} />
        <Field label="Județ" value={c.county} />
        <Field label="Cod poștal" value={c.postalCode} />
        <Field label="Starea firmei" value={companyStatusText} />
        <Field
          label="Ultima verificare ANAF"
          value={c.companyVerifiedAt ? formatDate(c.companyVerifiedAt) : null}
        />
      </Section>

      <Section title="Organizație creată">
        {o ? (
          <>
            <Field label="Status" value={orgStatusLabels[o.status] ?? o.status} />
            <Field label="Plan" value={PLAN_LABELS[normalizePlan(o.plan)]} />
            <Field label="Perioadă de probă" value={o.isTrial ? "Da" : "Nu"} />
            <Field
              label="Început abonament"
              value={o.subscriptionStartedAt ? formatDate(o.subscriptionStartedAt) : null}
            />
            <Field
              label="Expirare abonament"
              value={o.subscriptionExpiresAt ? formatDate(o.subscriptionExpiresAt) : null}
            />
            <Field label="Colaborare" value={o.collaborationEnabled ? "Activată" : "Dezactivată"} />
            <Field label="Utilizatori" value={String(o.userCount)} />
            <Field label="Proprietăți" value={String(o.propertyCount)} />
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <Link
                to="/superadmin/agencies"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Deschide agenția „{o.name}” în SuperAdmin
              </Link>
            </div>
          </>
        ) : (
          <Field label="Organizație" value="Nu a fost creată încă" />
        )}
      </Section>

      <Section title="Contact utilizator">
        <Field label="Email de logare" value={contact.loginEmail} />
        <Field
          label="Metoda de înregistrare"
          value={
            contact.provider === "google"
              ? "Google"
              : contact.provider === "email"
                ? "Email și parolă"
                : null
          }
        />
      </Section>
    </div>
  );
}
