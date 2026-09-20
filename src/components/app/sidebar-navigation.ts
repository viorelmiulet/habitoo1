import type { NavGroup, NavItem } from "./AppSidebar";

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
