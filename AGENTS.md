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

- Properstar index: agency presence tracked in `properstar_index_state` (7-day Deleted grace after deactivation); agency links signed HMAC-SHA256(OfficeId, PROPERSTAR_INDEX_KEY). Why: Properstar pulls one index URL, deactivation has no reliable timestamp elsewhere.

- Property status sold/rented/archived enqueues `portal_status_withdraw_items` (cron worker armed on enqueue) that withdraws via `applyPortalSelectionForOrg` enabled:false with reason status_sold/status_rented/archived; no auto-republish. Why: same path as manual deselect, non-blocking with retries.

- ClickImob index: JSON index at /api/public/feed/clickimob/index/{CLICKIMOB_INDEX_KEY}.json reuses Properstar index rules; state in `portal_index_state` (portal column), agencies with per-agency ClickImob connection excluded. Why: parallel to per-agency keys without duplicate listings, Properstar untouched.

- Property deletion is soft: only RPCs `delete_property`/`restore_property` touch `deleted_at` (guard trigger + RLS hide deleted rows from non-superadmins); portal withdrawals reuse `enqueueStatusWithdrawals` with reason `deleted`. Why: only superadmin restores or hard-deletes, and restore never republishes.

- Lead deletion is soft: only RPCs `delete_lead`/`restore_lead` touch `leads.deleted_at` (guard trigger + RLS hide deleted rows from non-superadmins; admin-client reads filter `deleted_at`). Why: only superadmin restores or hard-deletes.

- Bulk portal changes use durable `portal_bulk_jobs`/`portal_bulk_items`, processed by an armed cron through `applyPortalSelectionForOrg`; UI requests never call adapters directly. Why: jobs survive navigation, preserve portal rules, retries, audit, feed cache and real withdrawals.
- Account/agency deletion and cross-agency reassignment run only through `account_deletion_jobs` (worker in `src/lib/account-deletion.server.ts`, cron armed on enqueue). Why: portal withdrawals and storage moves must finish before rows change or disappear.

- Changing `properties.assigned_to` is allowed only for agency_admin/superadmin (trigger `guard_property_reassign`; service role and self-claim of unassigned listings exempt) and goes through `reassignProperties` in `src/lib/property-agent.functions.ts`. Why: RLS lets any member update other fields, but reassignment must stay manager-only and keep the slot trigger in force.
