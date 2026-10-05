export type SettingsTab =
  | "profile"
  | "access"
  | "agency"
  | "branding"
  | "team"
  | "portals"
  | "promotion"
  | "integrations"
  | "ai";

export const SETTINGS_TABS: readonly SettingsTab[] = [
  "profile",
  "access",
  "agency",
  "branding",
  "team",
  "portals",
  "promotion",
  "integrations",
  "ai",
];

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  profile: "Profil",
  access: "Acces",
  agency: "Agenție",
  branding: "Branding",
  team: "Echipă",
  portals: "Portaluri",
  promotion: "Promovare",
  integrations: "Integrări",
  ai: "AI",
};

export type SettingsTabGroup = { title: string; tabs: SettingsTab[] };

/** Agentul vede doar „Contul meu"; managerul vede și grupa „Agenția". */
export function settingsTabGroups(
  user:
    | { role?: string | null; isAdmin?: boolean; isSuperadmin?: boolean; organization?: { ai_enabled?: boolean | null } | null }
    | null
    | undefined,
): SettingsTabGroup[] {
  const groups: SettingsTabGroup[] = [{ title: "Contul meu", tabs: ["profile", "access"] }];
  if (!user?.isAdmin) return groups;
  const agency: SettingsTab[] = [];
  if (user.role === "agency_admin") agency.push("agency");
  agency.push("branding", "team", "portals", "promotion", "integrations");
  // Fila AI apare doar când superadminul a activat AI pentru agenție.
  if (user.isSuperadmin || user.organization?.ai_enabled === true) agency.push("ai");
  groups.push({ title: "Agenția", tabs: agency });
  return groups;
}

export function visibleSettingsTabs(user: Parameters<typeof settingsTabGroups>[0]): SettingsTab[] {
  return settingsTabGroups(user).flatMap((g) => g.tabs);
}
