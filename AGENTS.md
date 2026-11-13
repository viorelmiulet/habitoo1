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
- `HomeHeader` only on homepage/blog; else `PublicHeader`. Why: isolate overlay.
- Public photos share PublicPhotoHeading and a leaf asset registry; publicHead defaults elsewhere. Why: consistent previews.
- Public agency pages: `/agentii` and public logo reads use `public_partner_eligible`; `public_partner_agencies` returns a slug only for enabled profiles. `/agentii/$slug` remains opt-in via `public_agency_profile`/`public_agency_agents`; agent phone only with `public_show_phone`. Why: list eligibility is independent of optional profile/contact disclosure.
- Social posters share a dialog-scoped decoded-image pool for thumbnails/PNG; styles/templates persist locally and latest blob stays in memory. Why: avoid duplicate downloads and use the same poster at every destination.

- Superadmin mail replies use a single nonmodal MailReplyWindow and the unchanged replyMail contract, with a stable draft send key and synchronous in-flight lock. Why: preserve draft state and prevent duplicate submissions without changing server behavior.
- Agent chat lives only in `chat_*` tables (1-to-1 ordered pair, RLS by participant, contacts via `chat_directory`, block = recipient's `blocked_at`); unread emails via armed cron `chat_email_claim` (15 min, max 1/conversation/hour); never in `notifications`. Why: separate from collaboration messages and the portal-error bell.
- Chat emails use `renderHabitooEmail`, read after claim, sign private images and resolve recipient-visible conversations; retain unsubscribe. Why: consistent delivery and privacy.
- Property features share stable taxonomy groups and one edit/create panel layout, with no saved display mode. Why: preserve values, focus and identical writes.
- Location/overview edits share the page draft, guard and buildEditPatch; detail layouts use opt-in props. Why: presentation-only tabs without divergent writes.
- Property PDFs share privacy-filtered fragments and measured pagination in a lazy browser renderer; hydrate overrides, use agency defaults and mobile ready-file clicks. Why: consistent privacy and delivery.
- Read nested AGENTS.md for scoped rules.
- ZonaTa uses a scoped durable attempt journal. Why: interrupted jobs must leave evidence.
- Video music uses private `video-music` storage with superadmin writes and signed reads; video/Reel posts record `music_track_id`. Facebook Reels use the Meta boundary and GET-only social-temp completion. Why: private tokens, music provenance and no duplicate publishing.
- Completed videos store caller-owned metadata and server-resolved music snapshots in generated_video_clips, not media; history uses caller RLS and never publishes. Why: include unpublished clips and retain soundtrack identity after library edits.
- Video narration: direct Gemini TTS (model from `ai_model_settings`), validated base64, PCM→WAV, org-locked reservations, caller-RLS signing, one offline mix. Why: quotas, privacy, decodable audio.
- No global `entities` aliases/overrides: use distinct exports.
- Contracts: encrypted IDs/RLS, locked per-kind numbers; viewing table parser shared by preview/PDF. Why: privacy/fidelity.
- PortalLogo shares assets; overview uses registry. Why: same access.
- Filters share applyPropertyFilterClauses; merge legacy portal fields; OR within state/promotion/renewal, AND across types before count. Why: exact lists.
- Imobiliare.ro destination and promotion drafts use the existing durable publication queue; requested mode lives on publications/jobs and confirmed mode on listings, with no new portal. Destination changes send both statuses in one POST; unchanged published promotions remain partial; Bonus and imoradar-only bypass local capacity reads/checks. Why: keep destination switching recoverable and let the portal decide capacity.
- Private listing geography is canonicalized by a database trigger using the locality/county nomenclature; generated normalized keys drive caller-RLS filtering and complete paged facets, with legacy city/zone URL compatibility. Why: imports, existing rows, counts and diacritic-insensitive filters must agree without changing CRM geography.
- UI light colors/typography use global CSS; navy actions rebind primary locally, excluding light cards/dark mode. Root loads UI font; material fonts remain separate. Why: preserve tools/materials.
- MAP tabs share brand assets.
- hbsync market lock expiry and bounded retry are scoped to its importer via explicit claim arguments; other importers retain the RPC default. Why: recover interrupted partial pushes without altering manual or scheduled sync semantics.
- ACP observed-age filters share whole-day timestamp bounds on first_seen_at across listing counts and intelligence aggregates; source choices come from the canonical market registry. Why: re-imports must not reset age and observed duration must never imply traffic or confirmed time-to-sale.

- Removed publishing integrations have no registry definition, adapter, requirements, logo or public detail content; shared import formats and historical data remain intact. Why: removal must stop availability and outbound calls without rewriting history or unrelated imports.
- Imobiliare media uses one replacement-gallery POST, a read-back confirmation and Worker-safe sequential JPEG compression with an encoded-JSON size budget; the card reads the portal gallery without refreshing tokens. Why: batching replaced prior photos and submission counts were not portal confirmations.
- Superadmin surfaces use `withMarketDataNav` and `SuperadminGate` (`superadminGateDecision`); direct links redirect. Why: menu visibility and route access must agree.
- Private listing portfolio imports use an authenticated transactional RPC keyed by agency/source/external ID, with pre-copied private media and cleanup of losing concurrent attempts; imported-property agency read access is explicit. Why: consent, draft creation and duplicate prevention must be atomic without invoking publishing.
- Agency commissions live only in `commissions`; visibility/edit rights are enforced by RLS plus guard trigger `commissions_guard` (admin = agency_admin of own agency via `is_commission_admin`; admin allocations flagged `allocated_by_admin` are read-only for agents). Why: the UI only mirrors the DB rule (`src/lib/commissions.ts`).
- Commission list/report/export reads share complete caller-RLS pagination and saved-rate conversion, with lazy client-side file generators and ready-file delivery. Why: exports must match filters and access without truncation or historical rate drift.
- Public route JSON-LD uses publicGraphJsonLd through publicHead (or the article head), merging shared IDs and retaining page nodes; public identity constants are browser-safe and independent of head builders. Why: one connected graph per public page without circular imports or duplicate organizations.
- llms.txt reads only the aggregate public_llms_statistics RPC through a server publishable client, counts retained owner listings and active market offers, and derives prices and portal links from existing constants. Why: fresh public statistics without exposing private rows or changing listing access; existing one-hour shared cache remains.
- The public owner-listings page loads the existing aggregate statistics through a public server function; its FAQ and visible counts share the loader timestamp and formatter, and the former CRM URL redirects at the host boundary. Why: full SSR content without private listing reads, mismatched FAQ counts or competing route IDs.
- The public ACP page reuses the aggregate statistics server function and derives scoring presentation from ACP configuration; its FAQ and visible count share the loader timestamp. Why: public SSR explanations stay aligned with the engine without exposing private offers or changing analysis logic.
- Public collaboration copy and FAQ share a browser-safe content module with no private reads. Why: static SSR and matching FAQ schema without coupling public content to authenticated collaboration handlers.
- Internal AI fallback restarts complete read/generation callbacks before persistence or approval; native assistant blocks and tool IDs stay in memory. ID vision uses high-detail attachments; ACP interpretation uses the same registry, one JSON correction and final-provider usage/model. Other contracts keep their providers. Why: prevent mixed histories, duplicate actions and identity-image persistence while preserving deterministic ACP values.
- AI music uses a server-only direct fal ACE-Step call (no queue, 110 s timeout), handler-scoped FAL_KEY, 30 successes/day, inactive tracks and failure cleanup; recoverable failures return safe-message DTOs and record stage codes in ai_usage_events.extra_info, never provider bodies; unexpected errors also record sanitized error_name/message. Why: preserve privacy and actionable production diagnostics.

- Studio AI uses Gemini inline images, fal queue video and fal Kontext (models in `ai_model_settings`), private media and one terminal-updated usage event. All paid AI (text calls via `withAiCredits`/`chargedAiFallback`, media/voice via insert triggers) reserves monthly credits atomically through `ai_credit_reserve` (agency row lock, Romania months, plan + bonus) and settles consumed/refunded; contract ID scanning is never charged. AI features are on unless a row sets `enabled=false`. Why: one budget, no races or double limits.
- Galleries share PhotoViewer; client offers follow src/lib/AGENTS.md; guide clicks stay safe. Why: privacy.
- Lists share ListPagination/use-list-state; geography uses scoped choices/invoker RPCs (src/lib/AGENTS.md). Why: safe OR/counts.
- Public SSR/feeds read the DB via `publicRead` (timeout, logged fallback); `public_llms_statistics` reads an hourly cron cache. Why: no 500s under load.
- FB client requests: only `social_requests` (keyed upsert, DB geography, 30-day RLS+purge); matching in `src/lib/social-requests.ts`. Why: personal data apart from offers.
- `market_listings` retention runs only in `market_listings_lifecycle()` (nightly cron): unseen 14 days → inactive with `disappeared_at`, `last_seen_at` older than 365 days → deleted; ingestion never deletes and ignores observations older than the stored `last_seen_at`. ACP v5 weights inactive offers by age. Why: one place for retention, idempotent historical imports.
- ACP PDF reports render only the version snapshot (extras in `snapshot.report`); photos/OSM tiles fall back to placeholders; appendix opt-in; demand counts (`report/demand*.ts`) are computed at generation, partner-only numbers, frozen. Why: reproducible, private.
