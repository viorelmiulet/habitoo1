<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->
- Properstar index tracks agency presence with 7-day deletion grace; links use HMAC-SHA256. Why: one index URL; deactivation has no timestamp elsewhere.
- Property status sold/rented/archived enqueues `portal_status_withdraw_items` (armed cron) withdrawing via `applyPortalSelectionForOrg` enabled:false; no auto-republish. Why: same path as manual deselect, with retries.
- ClickImob index: JSON index at /api/public/feed/clickimob/index/{CLICKIMOB_INDEX_KEY}.json reuses Properstar index rules; state in `portal_index_state` (portal column), agencies with per-agency ClickImob connection excluded. Why: no duplicate listings.
- Property deletion is soft: only RPCs `delete_property`/`restore_property` touch `deleted_at` (guard trigger + RLS hide deleted rows from non-superadmins); portal withdrawals reuse `enqueueStatusWithdrawals` with reason `deleted`. Why: only superadmin restores or hard-deletes, and restore never republishes.
- Lead deletion is soft: only RPCs `delete_lead`/`restore_lead` touch `leads.deleted_at` (guard trigger + RLS hide deleted rows from non-superadmins; admin-client reads filter `deleted_at`). Why: only superadmin restores or hard-deletes.
- Bulk portal changes use durable `portal_bulk_jobs`/`portal_bulk_items`, processed by an armed cron through `applyPortalSelectionForOrg`; UI requests never call adapters directly. Why: jobs survive navigation and keep portal rules, retries and audit.
- Account/agency deletion and cross-agency reassignment run only through `account_deletion_jobs` (worker in `src/lib/account-deletion.server.ts`, cron armed on enqueue). Why: portal withdrawals and storage moves must finish before rows change or disappear.
- Changing `properties.assigned_to` is allowed only for agency_admin/superadmin (trigger `guard_property_reassign`; service role and self-claim of unassigned listings exempt) and goes through `reassignProperties` in `src/lib/property-agent.functions.ts`. Why: RLS lets any member update other fields, but reassignment must stay manager-only and keep the slot trigger in force.
- Portal connection status shown in the UI has exactly three values (connected/error/disconnected), computed only by `portalDisplayStatus` in `src/lib/portals/registry.ts`; raw DB values never reach the UI. Why: one rule.
- Facebook Catalog card state (connected/error/disconnected) is computed only by `facebookCatalogState` in `src/lib/facebook-catalog-status.ts`; card counts reuse `loadFacebookCatalogInput` + `buildFacebookCatalogCsv`. Why: one rule for the feed and the card, no token ever returned.
- Agency self-service portal activation goes through `selfActivatePortalForSession` (src/lib/portal-activation.functions.ts), which reuses `applyPortalActivationForOrg` and `runLaCheieAgencyActivation`; mode comes only from `PortalDefinition.activation`. New organizations get ClickImob activated by DB trigger `t_org_auto_clickimob` (never fails creation). Why: every org-creation path inserts into organizations.
- Facebook Catalog uses a dedicated `site_feed_tokens` row (`scope = facebook_catalog`, value in `token_encrypted` via `encryptPortalCredential`) accepted only when `allowFacebookCatalogToken` is set (catalog route); site-token functions filter `scope = site`. Why: catalog URL stays copyable without exposing site tokens.
- Facebook Catalog opt-ins use `portal_publications` key `facebook_catalog` without slots. Admins always manage them; agents manage only owned listings when the organization setting allows it. Why: feed inclusion requires an authorized explicit choice.
- Promotion catalogs are registered separately from listing portals and are merged only into the agency Settings portal list. Why: Catalog Facebook must look like a portal without entering portal publication, slot, activation, or withdrawal flows.
- Table `agent_portal_preferences` is kept but unused by code: Publicare never preselects portals. Why: "Portalurile mele" was removed; data preserved.
- Property publication cards share checkbox state and query only the assigned agent's slots; the server checks publication. Why: no duplicate state.
- Public prices and structured offers read display prices; billing and seat limits stay separate. Why: billing stays separate.
- Public portal grids share registry data. Why: sync.
- Failure alerts use stable IDs per org, listing, portal, error and user. Why: no duplicates.
- Collaboration auto-activation lives only in the DB (insert trigger `properties_auto_collaboration`, RPC `collaboration_auto_activate`), copying the agency default commission only when none is explicit; `collaboration_opted_out` is never overridden. Why: one rule for all inserts.
- Imospot email uses `notifyImospotForRequest`; `provider_notified_at` prevents duplicates. Why: one send.
- Company data comes from ANAF only via `src/lib/company-lookup.ts` (pure, injected fetch) with 24h `company_lookup_cache`; org sync fills empty fields only. Why: ANAF rate limit; user edits win.
- Homepage-only navigation uses `HomeHeader`; other public pages keep `PublicHeader`. Why: isolate its overlay behavior.
