# Marketing feature pages

- Dedicated feature pages and their contents live in the browser-safe feature-pages registry; explicit section-to-slug mappings replace matching topics in the table of contents. Why: different URLs must not create duplicate features or leave section links behind.- Renamed feature-page slugs stay in `FEATURE_PAGE_ALIASES` and redirect permanently from the slug route. Why: already-shared or indexed addresses must keep working.

- Editorial contentModified drives visible dates, WebPage and sitemap; public cache lives in the existing server entry and excludes session HTML. Why: truthful dates and private-cache isolation.
- llms-full uses registries, shared FAQ, public aggregate statistics and reviewed Markdown extracted from public pages, excluding mock account previews. Why: complete public content only.
- IndexNow uses service-only revision receipts and a lock; the key file is served from the server entry (the key is public by protocol), static revisions are checked once per isolate and blog saves notify. Why: deduplicated batches without preview submissions.
- Blog article AEO (author organization, summary, TOC, JSON-LD, related, FAQ) lives in the pure blog-aeo module. Why: testable without rendering.
