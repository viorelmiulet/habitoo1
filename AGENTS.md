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
- `properties.assigned_to` changes only through `reassignPropertiesCore` via authenticated wrappers (manager/superadmin; trigger `guard_property_reassign`); successful moves enqueue active-pair contact updates. Why: single and bulk edits share role, slot, audit and synchronization rules.
- Public offers use display prices; billing/seats stay separate. Subscription requests follow src/lib/AGENTS.md. Why: one renewal flow.
- Collaboration auto-activation lives only in the DB (insert trigger `properties_auto_collaboration`, RPC `collaboration_auto_activate`), copying the agency default commission only when none is explicit; `collaboration_opted_out` is never overridden. Why: one rule for all inserts.
- `HomeHeader` on homepage + blog (`PublicLayout homeHeader`); else `PublicHeader`. Why: isolate fixed overlay.
- Public agency pages: `/agentii` and public logo reads use `public_partner_eligible`; `public_partner_agencies` returns a slug only for enabled profiles. `/agentii/$slug` remains opt-in via `public_agency_profile`/`public_agency_agents`; agent phone only with `public_show_phone`. Why: list eligibility is independent of optional profile/contact disclosure.
- Social posters share a dialog-scoped decoded-image pool across small live template thumbnails and full client-side PNG output; template preferences save with styles in localStorage and the latest blob stays in memory for social posting. Why: avoid duplicate image downloads, preserve classic output and keep all social destinations on the same poster.

- Superadmin mail replies use a single nonmodal MailReplyWindow and the unchanged replyMail contract, with a stable draft send key and synchronous in-flight lock. Why: preserve draft state and prevent duplicate submissions without changing server behavior.
- Agent chat lives only in `chat_*` tables (1-to-1 ordered pair, RLS by participant, contacts via `chat_directory`, block = recipient's `blocked_at`); unread emails via armed cron `chat_email_claim` (15 min, max 1/conversation/hour); never in `notifications`. Why: separate from collaboration messages and the portal-error bell.
- Chat emails use `renderHabitooEmail`, read unread content after claim, sign private images server-side and resolve recipient-visible conversations only; hosted unsubscribe remains. Why: consistent emails without changing delivery or privacy.
- Property feature editing and read-only detail groups share module-level components and presentation metadata referencing the existing taxonomy; browser view preferences hydrate after mount. Why: preserve stored values, focus, and SSR consistency while keeping both views aligned.
- Property sheets share privacy-filtered materials fragments across layouts and use data-attribute-based measured description pagination in a lazy browser-only PDF renderer; user overrides hydrate after mount, agency defaults use organization branding, and mobile delivery follows a ready-file click. Why: keep confidentiality and pagination identical across layouts without losing browser activation.
- Subdirectories (e.g. `src/lib`, `src/lib/meta`) have their own `AGENTS.md`; read it before changing files there.
- Video music uses private `video-music` storage with superadmin writes and signed reads; video/Reel posts record `music_track_id`. Facebook Reels use the Meta boundary and GET-only social-temp completion. Why: private tokens, music provenance and no duplicate publishing.
- Video narration uses the shared Replicate boundary, atomic organization-locked reservations with existing AI usage events, caller-RLS private audio signing, and one offline audio mix for both encoders. Why: prevent concurrent quota bypass, cross-agency access and silent loss of narration in fallback rendering.
- No global `entities` aliases or version overrides. Why: consumers require different majors and package exports.
- Integrations overview has a separate registry-derived presentation module. Why: no duplicates or false claims, unchanged detail pages.
- Property-list portal and promotion selections share PortalFilterSelect while retaining independent URL fields and existing server filters. Why: unified presentation without changing OR semantics, access controls or legacy links.
- Imobiliare.ro property-card promotion drafts are controlled by the publication selection and applied through the durable publication queue, never on checkbox clicks; initial online and promotions share one POST, published changes remain partial. Why: Bonus must supply the online slot and unchanged services must not consume additional capacity.
- hbsync private listings: `/api/public/listings/upsert` is idempotent on (source, external_id), mirrors images into the private `listing-images` bucket served via `/api/public/listings/media/$id`, prefixes `period` into the description, normalizes listing URLs (`normalizeListingUrl`) and never clears a stored url/phone/images with an empty re-import; a daily cron purges rows not re-imported for 60 days (`purge_old_listings`). Why: portal → import → 60-day retention cycle without touching CRM data or losing links.
- hbsync market offers use a separate authenticated push endpoint and the existing normalized market ingestion/history pipeline, with original portal identities, explicit nullable publisher classification, no contact data, partial-feed semantics and per-source durable locks; canonical geography stays stored separately from legacy sector-as-city ACP presentation. Why: preserve provenance and idempotency without mixing private listings or treating capped feeds as complete.
