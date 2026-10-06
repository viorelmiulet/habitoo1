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
- Property status sold/rented/archived enqueues `portal_status_withdraw_items` (armed cron) withdrawing via `applyPortalSelectionForOrg` enabled:false; no auto-republish. Why: same path as manual deselect, with retries.
- Property deletion is soft: only RPCs `delete_property`/`restore_property` touch `deleted_at` (guard trigger + RLS hide deleted rows from non-superadmins); portal withdrawals reuse `enqueueStatusWithdrawals` with reason `deleted`. Why: only superadmin restores or hard-deletes, and restore never republishes.
- Lead deletion is soft: only RPCs `delete_lead`/`restore_lead` touch `leads.deleted_at` (guard trigger + RLS hide deleted rows from non-superadmins; admin-client reads filter `deleted_at`). Why: only superadmin restores or hard-deletes.
- Account/agency deletion and cross-agency reassignment run only through `account_deletion_jobs` (worker in `src/lib/account-deletion.server.ts`, cron armed on enqueue). Why: portal withdrawals and storage moves must finish before rows change or disappear.
- `properties.assigned_to` changes only via `reassignProperties` (manager/superadmin; trigger `guard_property_reassign`). Why: reassignment stays manager-only with slot checks.
- Public prices and structured offers read display prices; billing and seat limits stay separate. Why: billing stays separate.
- Collaboration auto-activation lives only in the DB (insert trigger `properties_auto_collaboration`, RPC `collaboration_auto_activate`), copying the agency default commission only when none is explicit; `collaboration_opted_out` is never overridden. Why: one rule for all inserts.
- Imospot email uses `notifyImospotForRequest`; `provider_notified_at` prevents duplicates. Why: one send.
- Company data comes from ANAF only via `src/lib/company-lookup.ts` (pure, injected fetch) with 24h `company_lookup_cache`; org sync fills empty fields only. Why: ANAF rate limit; user edits win.
- `HomeHeader` on homepage + blog (`PublicLayout homeHeader`); else `PublicHeader`. Why: isolate fixed overlay.
- Public agency pages: `/agentii` lists only eligible agencies with `public_profile_enabled` (RPC `public_partner_agencies`: name/logo/slug); `/agentii/$slug` profile via `public_agency_profile`/`public_agency_agents`; agent phone only with `public_show_phone`; logo via `/api/public/partner-logo/$id`. Why: opt-in per org; only opted-in data leaves the DB.
- Social property posters are rendered client-side from existing signed media and downloaded as PNG; per-agent display preferences stay in localStorage. Why: no social publishing or generated-media persistence is needed.
