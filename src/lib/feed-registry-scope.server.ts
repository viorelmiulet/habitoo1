import { AsyncLocalStorage } from "node:async_hooks";
import type { PortalDefinition } from "./portals/registry";
const storage = new AsyncLocalStorage<PortalDefinition[]>();
export const scopedFeedDefinitions = () => storage.getStore() ?? [];
export function withFeedDefinitions<T>(definitions: PortalDefinition[], work: () => T): T {
  return storage.run(definitions, work);
}