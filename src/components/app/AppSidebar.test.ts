import { describe, expect, it } from "vitest";
import source from "./AppSidebar?raw";
import { activeNavigationPath, agencyNav, openStateKey } from "./AppSidebar";

describe("navigarea laterală", () => {
  it("alege un singur rând activ, inclusiv pentru rutele imbricate", () => {
    expect(activeNavigationPath("/app/properties/new", agencyNav)).toBe("/app/properties/new");
    expect(activeNavigationPath("/app/acp", agencyNav)).toBe("/app/acp");
  });

  it("separă starea grupurilor pentru fiecare utilizator", () => {
    expect(openStateKey("user-a")).toBe("habitoo.sidebar.groups.user-a");
    expect(openStateKey("user-b")).not.toBe(openStateKey("user-a"));
  });

  it("păstrează accesibilitatea, persistența și ținta tactilă de 44px", () => {
    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("min-h-11");
    expect(source).toContain("window.localStorage.setItem(openStateKey(user?.userId)");
  });
});
