import { createIsomorphicFn } from "@tanstack/react-start";
import { scopedFeedDefinitions } from "./feed-registry-scope.server";
import type { PortalDefinition } from "./portals/registry";
let browserDefinitions: PortalDefinition[] = [];
/** Browser metadata only; server definitions are isolated in request-scoped storage. */
export function setBrowserFeedDefinitions(definitions: PortalDefinition[]) { browserDefinitions = definitions; }
export const feedDefinitions = createIsomorphicFn()
  .client(() => browserDefinitions)
  .server(() => scopedFeedDefinitions());