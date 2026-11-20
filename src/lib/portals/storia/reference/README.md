# Storia investment taxonomy

`investments-taxonomy.json` is the unmodified successful response of GET
`https://api.olxgroup.com/taxonomy/v1/categories/partner/urn:site:storiaro/urn:concept:investments`
on 2026-11-20. No advert write requests were made.

Mandatory: `state`, `area-from`, `area-to`, `price-per-sq-meter-from`, `estate-type`,
`total-number-of-properties-in-the-investment`.

Existing fields: construction stage → state; total units → total number of properties.
Added missing fields: area_from, area_to, price_per_sqm_from, estate_type.
Added optional construction_start_date → start-date. Delivery date → end-date;
floors count → floors-in-building. Building count and upper price have no attribute
in this response and are intentionally not sent; no invented URNs.

Official current documentation:
- https://developer.olxgroup.com/docs/primary-market
- https://developer.olxgroup.com/docs/publishing-an-investment
- https://developer.olxgroup.com/docs/publishing-isolated-units

The older doc.olxgroup.com address failed DNS resolution.
