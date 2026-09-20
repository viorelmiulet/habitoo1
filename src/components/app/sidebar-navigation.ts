import type { NavGroup, NavItem } from "./AppSidebar";
import type { AiFeatureKey, AiFeatureMap } from "@/lib/ai/features/keys";

export function itemIsActive(pathname: string, item: NavItem) {
  const target = String(item.to);
  return item.exact
    ? pathname === target
    : pathname === target || pathname.startsWith(`${target}/`);
}

export function activeNavigationPath(pathname: string, groups: NavGroup[]) {
  return groups
    .flatMap((group) => group.items)
    .filter((item) => itemIsActive(pathname, item))
    .sort((left, right) => String(right.to).length - String(left.to).length)[0]?.to;
}

export function sidebarOpenStateKey(userId?: string) {
  return `habitoo.sidebar.groups.${userId ?? "anonymous"}`;
}

/** Ruta fiecărei funcții AI activabile per agenție. */
export const AI_NAV_FEATURE: Record<string, AiFeatureKey> = {
  "/app/ai-manager": "ai_manager",
  "/app/ai-crm": "ai_crm",
  "/app/ai-marketing": "ai_marketing",
  "/app/ai": "ai_assistant",
  "/app/ai-media": "ai_media",
};

/**
 * Ascunde intrările AI neactivate pentru agenție; un grup rămas gol dispare.
 * Restul navigației nu este atins.
 */
export function filterAiNavigation(groups: NavGroup[], features: AiFeatureMap): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const key = AI_NAV_FEATURE[String(item.to)];
        return !key || features[key] === true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
