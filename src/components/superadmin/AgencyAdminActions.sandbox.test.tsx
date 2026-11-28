// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgencyHeaderActions, AgencySubscriptionControls } from "./AgencyAdminActions";
import { SANDBOX_AGENCY_ID } from "@/lib/partner-api/sandbox-identity";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("@tanstack/react-start", async (original) => ({ ...await original<typeof import("@tanstack/react-start")>(), useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQuery: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-session", () => ({ useCurrentUser: () => ({ data: { userId: "admin", profile: { organization_id: null } } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/account-deletion.functions", () => ({ listSuperadminOrganizationIds: vi.fn() }));
vi.mock("@/lib/superadmin-users.functions", () => ({ listPlatformUsers: vi.fn() }));
vi.mock("@/lib/registration-approval.functions", () => ({ approveRegistrationRequest: vi.fn() }));
vi.mock("@/lib/ai/features/features.functions", () => ({ setOrganizationAiEnabled: vi.fn() }));
vi.mock("@/components/superadmin/AgencyDetailsDialog", () => ({ AgencyDetailsDialog: () => null }));
vi.mock("@/components/superadmin/SubscriptionPicker", () => ({ SubscriptionPicker: () => null }));
vi.mock("@/components/superadmin/PropertyImportDialog", () => ({ PropertyImportDialog: () => null }));
vi.mock("@/components/superadmin/UserDeletionDialog", () => ({ OrganizationDeletionDialog: () => null }));
vi.mock("@/components/app/ConfirmDialog", () => ({ ConfirmDialog: () => null }));

const org = (id: string) => ({
  id, name: "Agenție", plan: "basic", status: "active", archived_at: null,
  subscription_term: null, subscription_expires_at: null,
}) as never;

async function render(component: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(component));
  return { container, root };
}
async function unmount(container: HTMLDivElement, root: ReturnType<typeof createRoot>) {
  await act(async () => root.unmount());
  container.remove();
}

it("sandboxul nu are butoane de arhivare sau ștergere, păstrând celelalte acțiuni", async () => {
  const { container, root } = await render(<AgencyHeaderActions org={org(SANDBOX_AGENCY_ID)} />);
  try {
    expect(container.textContent).toContain("Editează datele");
    expect(container.textContent).not.toContain("Arhivează");
    expect(container.textContent).not.toContain("Reactivează");
    expect(container.textContent).not.toContain("Șterge");
  } finally { await unmount(container, root); }
});

it("o agenție obișnuită păstrează butoanele de arhivare și ștergere", async () => {
  const { container, root } = await render(<AgencyHeaderActions org={org("00000000-0000-4000-8000-000000000002")} />);
  try {
    expect(container.textContent).toContain("Arhivează");
    expect(container.textContent).toContain("Șterge");
  } finally { await unmount(container, root); }
});

it("starea sandboxului nu poate fi schimbată din formular", async () => {
  const { container, root } = await render(<AgencySubscriptionControls org={org(SANDBOX_AGENCY_ID)} />);
  try {
    expect(container.querySelector('button[aria-label="Starea agenției"]')?.hasAttribute("disabled")).toBe(true);
  } finally { await unmount(container, root); }
});
