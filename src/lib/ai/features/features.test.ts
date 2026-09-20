import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AI_FEATURE_KEYS,
  aiFeatureDisabledMessage,
  emptyAiFeatureMap,
  isAiFeatureKey,
} from "./keys";
import { agencyNav } from "@/components/app/AppSidebar";
import { AI_NAV_FEATURE, filterAiNavigation } from "@/components/app/sidebar-navigation";

describe("funcțiile AI per agenție", () => {
  it("sunt oprite implicit", () => {
    const map = emptyAiFeatureMap();
    for (const key of AI_FEATURE_KEYS) expect(map[key]).toBe(false);
  });

  it("acceptă doar cheile cunoscute", () => {
    expect(isAiFeatureKey("ai_crm")).toBe(true);
    expect(isAiFeatureKey("altceva")).toBe(false);
  });

  it("explică în română lipsa activării", () => {
    expect(aiFeatureDisabledMessage("ai_media")).toContain("nu este activată pentru agenția ta");
  });
});

describe("citirea fail-closed", () => {
  it("returnează oprit când lipsește organizația sau apare o eroare", () => {
    const source = readFileSync("src/lib/ai/features/features.server.ts", "utf8");
    expect(source).toContain("if (!organizationId) return map;");
    expect(source).toContain("if (error || !data) return map;");
  });
});

describe("meniul lateral", () => {
  const disabled = emptyAiFeatureMap();

  it("ascunde intrările AI oprite și grupul rămas gol", () => {
    const groups = filterAiNavigation(agencyNav, disabled);
    const paths = groups.flatMap((group) => group.items.map((item) => String(item.to)));
    for (const path of Object.keys(AI_NAV_FEATURE)) expect(paths).not.toContain(path);
    expect(groups.some((group) => group.title === "Asistent AI")).toBe(false);
    expect(paths).toContain("/app/properties");
  });

  it("afișează doar funcțiile activate", () => {
    const groups = filterAiNavigation(agencyNav, { ...disabled, ai_crm: true });
    const aiGroup = groups.find((group) => group.title === "Asistent AI");
    expect(aiGroup?.items.map((item) => String(item.to))).toEqual(["/app/ai-crm"]);
  });
});

describe("gărzile din punctele de intrare", () => {
  const files: [string, string][] = [
    ["src/lib/ai/ai.functions.ts", "ai_assistant"],
    ["src/lib/ai/agents/crm/crm.functions.ts", "ai_crm"],
    ["src/lib/ai/agents/manager/manager.functions.ts", "ai_manager"],
    ["src/lib/ai/agents/marketing/marketing.functions.ts", "ai_marketing"],
  ];

  it.each(files)("%s verifică funcția înainte de a rula agentul", (path, key) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain(`const AI_FEATURE: AiFeatureKey = "${key}"`);
    expect(source).toContain("aiFeatureBlocked(actor.organizationId)");
  });

  it("Studio AI verifică funcția înainte de a porni o generare", () => {
    const source = readFileSync("src/lib/ai/media/media.functions.ts", "utf8");
    expect(source).toContain('const AI_FEATURE: AiFeatureKey = "ai_media"');
    expect(source).toContain("resolveMediaOrganization(context)");
  });

  it("ACP verifică funcția înainte de a genera interpretarea", () => {
    const source = readFileSync("src/lib/acp/ai.functions.ts", "utf8");
    expect(source).toContain('isAiFeatureEnabled(organizationId, "acp_ai")');
    expect(source).toContain('aiFeatureDisabledMessage("acp_ai")');
  });

  it("doar superadminul poate schimba funcțiile, cu audit", () => {
    const source = readFileSync("src/lib/ai/features/features.functions.ts", "utf8");
    expect(source).toContain("assertSuperadmin(context)");
    expect(source).toContain('action: "organization.ai_feature_changed"');
  });
});
