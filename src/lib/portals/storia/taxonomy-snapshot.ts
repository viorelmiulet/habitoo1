/**
 * INSTANTANEU al taxonomiei reale Storia.ro (`urn:site:storiaro`), generat din
 * `GET https://api.olxgroup.com/taxonomy/v1/categories/partner/urn:site:storiaro`.
 *
 * NU se editează manual. Se regenerează din Superadmin → Portaluri
 * („Reîmprospătează taxonomia"), care actualizează și cache-ul din baza de date.
 * Rolul lui este să dea mapper-ului o sursă offline VERIFICATĂ: nu trimitem
 * niciodată un URN de atribut sau o valoare de enum care nu apare aici.
 *
 * Observație: câteva atribute apar de două ori în răspunsul OLX, cu tipuri
 * diferite (`select` și `multiple`). Le-am unificat: tipul primei apariții,
 * uniunea valorilor, `mandatory` = adevărat dacă cel puțin o apariție e marcată.
 */

export type StoriaAttributeType = "select" | "input" | "multiple";

export type StoriaAttributeSpec = {
  code: string;
  type: StoriaAttributeType;
  mandatory: boolean;
  values: readonly string[];
};

export type StoriaCategorySpec = {
  label: string;
  attributes: readonly StoriaAttributeSpec[];
};

/** Momentul descărcării instantaneului (UTC). */
export const STORIA_TAXONOMY_SNAPSHOT_AT = "2026-09-10T19:18:47Z";

export const STORIA_TAXONOMY_SNAPSHOT: Record<string, StoriaCategorySpec> = {
  "urn:concept:apartments-for-sale": {
    "label": "Apartments for Sale",
    "attributes": [
      {
        "code": "urn:concept:number-of-rooms",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:1",
          "urn:concept:10",
          "urn:concept:2",
          "urn:concept:3",
          "urn:concept:4",
          "urn:concept:5",
          "urn:concept:6",
          "urn:concept:7",
          "urn:concept:8",
          "urn:concept:9",
          "urn:concept:more"
        ]
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:construction-year",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:building-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:apartment",
          "urn:concept:block",
          "urn:concept:house",
          "urn:concept:infill",
          "urn:concept:loft",
          "urn:concept:other",
          "urn:concept:ribbon",
          "urn:concept:tenement"
        ]
      },
      {
        "code": "urn:concept:floor",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:10th-floor",
          "urn:concept:11th-floor-and-above",
          "urn:concept:1st-floor",
          "urn:concept:2nd-floor",
          "urn:concept:3rd-floor",
          "urn:concept:4th-floor",
          "urn:concept:5th-floor",
          "urn:concept:6th-floor",
          "urn:concept:7th-floor",
          "urn:concept:8th-floor",
          "urn:concept:9th-floor",
          "urn:concept:cellar",
          "urn:concept:garret",
          "urn:concept:ground-floor"
        ]
      },
      {
        "code": "urn:concept:building-floors",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:building-ownership",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:full-ownership",
          "urn:concept:limited-ownership",
          "urn:concept:shared-ownership",
          "urn:concept:usufruct"
        ]
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete"
        ]
      },
      {
        "code": "urn:concept:building-material",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:breeze-block",
          "urn:concept:brick",
          "urn:concept:cellular-concrete",
          "urn:concept:concrete",
          "urn:concept:concrete-plate",
          "urn:concept:hydroton",
          "urn:concept:other",
          "urn:concept:reinforced-concrete",
          "urn:concept:silicate",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:heating",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:boiler-room",
          "urn:concept:electrical",
          "urn:concept:gas",
          "urn:concept:other",
          "urn:concept:tiled-stove",
          "urn:concept:urban"
        ]
      },
      {
        "code": "urn:concept:windows-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:aluminium",
          "urn:concept:plastic",
          "urn:concept:wooden"
        ]
      },
      {
        "code": "urn:concept:free-from",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cable-tv",
          "urn:concept:internet",
          "urn:concept:phone"
        ]
      },
      {
        "code": "urn:concept:equipment-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:dishwasher",
          "urn:concept:fridge",
          "urn:concept:furniture",
          "urn:concept:oven",
          "urn:concept:stove",
          "urn:concept:tv",
          "urn:concept:washing-machine"
        ]
      },
      {
        "code": "urn:concept:extras",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:air-conditioning",
          "urn:concept:balcony",
          "urn:concept:basement",
          "urn:concept:garage",
          "urn:concept:garden",
          "urn:concept:lift",
          "urn:concept:separate-kitchen",
          "urn:concept:terrace",
          "urn:concept:two-storey",
          "urn:concept:usable-room"
        ]
      },
      {
        "code": "urn:concept:house-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:circular",
          "urn:concept:detached",
          "urn:concept:semidetached",
          "urn:concept:undetached"
        ]
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      },
      {
        "code": "urn:concept:market",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:primary",
          "urn:concept:secondary"
        ]
      }
    ]
  },
  "urn:concept:houses-for-sale": {
    "label": "Houses for sale",
    "attributes": [
      {
        "code": "urn:concept:number-of-rooms",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:10",
          "urn:concept:2",
          "urn:concept:3",
          "urn:concept:4",
          "urn:concept:5",
          "urn:concept:6",
          "urn:concept:7",
          "urn:concept:8",
          "urn:concept:9",
          "urn:concept:more"
        ]
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:terrain-area-m2",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:construction-year",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:building-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:detached",
          "urn:concept:farm",
          "urn:concept:residence",
          "urn:concept:ribbon",
          "urn:concept:semi-detached",
          "urn:concept:tenement"
        ]
      },
      {
        "code": "urn:concept:free-from",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete",
          "urn:concept:unfinished-close",
          "urn:concept:unfinished-open"
        ]
      },
      {
        "code": "urn:concept:building-material",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:breeze-block",
          "urn:concept:brick",
          "urn:concept:cellular-concrete",
          "urn:concept:concrete",
          "urn:concept:concrete-plate",
          "urn:concept:hydroton",
          "urn:concept:other",
          "urn:concept:silicate",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:windows-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:aluminium",
          "urn:concept:inexistent",
          "urn:concept:plastic",
          "urn:concept:wooden"
        ]
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cable-television",
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:internet",
          "urn:concept:phone",
          "urn:concept:sewage",
          "urn:concept:water",
          "urn:concept:water-purification"
        ]
      },
      {
        "code": "urn:concept:attic-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:inexistent",
          "urn:concept:unusable",
          "urn:concept:usable"
        ]
      },
      {
        "code": "urn:concept:roof-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:diagonal",
          "urn:concept:flat",
          "urn:concept:inexistent",
          "urn:concept:plain"
        ]
      },
      {
        "code": "urn:concept:roofing",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:asbestic-tile",
          "urn:concept:chopper",
          "urn:concept:other",
          "urn:concept:roofing-paper",
          "urn:concept:sheet",
          "urn:concept:shingle",
          "urn:concept:slate",
          "urn:concept:tile"
        ]
      },
      {
        "code": "urn:concept:recreational",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:views-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:florest-view",
          "urn:concept:forest-view",
          "urn:concept:lake-view",
          "urn:concept:mountain-view",
          "urn:concept:sea-view"
        ]
      },
      {
        "code": "urn:concept:access-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:dirt-access",
          "urn:concept:paved",
          "urn:concept:paved-access"
        ]
      },
      {
        "code": "urn:concept:heating-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:biomass",
          "urn:concept:coal",
          "urn:concept:electric",
          "urn:concept:fireplace",
          "urn:concept:gas",
          "urn:concept:geothermal",
          "urn:concept:heat-pump",
          "urn:concept:oil",
          "urn:concept:solar-collector",
          "urn:concept:stove",
          "urn:concept:urban"
        ]
      },
      {
        "code": "urn:concept:fence-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:brick",
          "urn:concept:concrete",
          "urn:concept:hedge",
          "urn:concept:metal",
          "urn:concept:other",
          "urn:concept:wire",
          "urn:concept:wooden"
        ]
      },
      {
        "code": "urn:concept:extras",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:air-conditioning",
          "urn:concept:attic",
          "urn:concept:basement",
          "urn:concept:garage",
          "urn:concept:pool"
        ]
      },
      {
        "code": "urn:concept:is-bungalow",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:number-of-floors",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      },
      {
        "code": "urn:concept:location-type",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:city",
          "urn:concept:country",
          "urn:concept:suburban"
        ]
      },
      {
        "code": "urn:concept:market",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:primary",
          "urn:concept:secondary"
        ]
      },
      {
        "code": "urn:concept:floors-in-building",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:ground-floor",
          "urn:concept:more",
          "urn:concept:one-floor",
          "urn:concept:two-floors"
        ]
      },
      {
        "code": "urn:concept:location",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:city",
          "urn:concept:country",
          "urn:concept:suburban"
        ]
      }
    ]
  },
  "urn:concept:lots-for-sale": {
    "label": "Lots for Sale",
    "attributes": [
      {
        "code": "urn:concept:terrain-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:agricultural",
          "urn:concept:agricultural-building",
          "urn:concept:building",
          "urn:concept:commercial",
          "urn:concept:habitat",
          "urn:concept:other",
          "urn:concept:recreational",
          "urn:concept:woodland"
        ]
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:dimensions",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:refinery",
          "urn:concept:sewage",
          "urn:concept:telephone",
          "urn:concept:water"
        ]
      },
      {
        "code": "urn:concept:fence",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:access-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:paved",
          "urn:concept:paved-access",
          "urn:concept:unpaved-access"
        ]
      },
      {
        "code": "urn:concept:views-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:forest-view",
          "urn:concept:lake-view",
          "urn:concept:mountain-view",
          "urn:concept:open-terrain-view",
          "urn:concept:sea-view"
        ]
      },
      {
        "code": "urn:concept:location",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:city",
          "urn:concept:country",
          "urn:concept:suburban"
        ]
      }
    ]
  },
  "urn:concept:stores-for-sale": {
    "label": "Stores for Sale",
    "attributes": [
      {
        "code": "urn:concept:type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:block",
          "urn:concept:historic-building",
          "urn:concept:office-building",
          "urn:concept:private-house",
          "urn:concept:separate",
          "urn:concept:shopping-center",
          "urn:concept:tenement-house"
        ]
      },
      {
        "code": "urn:concept:construction-year",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:floor",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:10th-floor",
          "urn:concept:11th-floor-and-above",
          "urn:concept:1st-floor",
          "urn:concept:2nd-floor",
          "urn:concept:3rd-floor",
          "urn:concept:4th-floor",
          "urn:concept:5th-floor",
          "urn:concept:6th-floor",
          "urn:concept:7th-floor",
          "urn:concept:8th-floor",
          "urn:concept:9th-floor",
          "urn:concept:cellar",
          "urn:concept:garret",
          "urn:concept:ground-floor"
        ]
      },
      {
        "code": "urn:concept:use-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:gastronomy",
          "urn:concept:hotel",
          "urn:concept:industrial",
          "urn:concept:office",
          "urn:concept:retail",
          "urn:concept:services"
        ]
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cable-television",
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:internet",
          "urn:concept:phone",
          "urn:concept:sewage",
          "urn:concept:water",
          "urn:concept:water-purification"
        ]
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete"
        ]
      },
      {
        "code": "urn:concept:extras",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:access-with-asphalt",
          "urn:concept:air-conditioning",
          "urn:concept:asphalt-access",
          "urn:concept:elevator",
          "urn:concept:furniture",
          "urn:concept:heating",
          "urn:concept:parking",
          "urn:concept:shop-window"
        ]
      },
      {
        "code": "urn:concept:building-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:block",
          "urn:concept:historic-building",
          "urn:concept:office-building",
          "urn:concept:private-house",
          "urn:concept:separate",
          "urn:concept:shopping-center",
          "urn:concept:tenement-house"
        ]
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      },
      {
        "code": "urn:concept:market",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:primary",
          "urn:concept:secondary"
        ]
      }
    ]
  },
  "urn:concept:warehouses-for-sale": {
    "label": "Warehouses for Sale",
    "attributes": [
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:heating",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:height",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:fence",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:structure-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:brick",
          "urn:concept:glass",
          "urn:concept:shed",
          "urn:concept:steel",
          "urn:concept:tent",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:access-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:paved",
          "urn:concept:paved-access",
          "urn:concept:unpaved-access"
        ]
      },
      {
        "code": "urn:concept:parking-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:cobblestone",
          "urn:concept:concrete",
          "urn:concept:none",
          "urn:concept:paved",
          "urn:concept:unpaved",
          "urn:concept:unpaved-access"
        ]
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete",
          "urn:concept:unfinished-close",
          "urn:concept:unfinished-open"
        ]
      },
      {
        "code": "urn:concept:flooring-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:none",
          "urn:concept:pollen",
          "urn:concept:unpollen"
        ]
      },
      {
        "code": "urn:concept:office-space",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:social-facilities",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:ramp",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:use-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:commercial",
          "urn:concept:manufacturing",
          "urn:concept:office",
          "urn:concept:stock"
        ]
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:internet",
          "urn:concept:phone",
          "urn:concept:power",
          "urn:concept:sewage",
          "urn:concept:water",
          "urn:concept:water-purification"
        ]
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      },
      {
        "code": "urn:concept:market",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:primary",
          "urn:concept:secondary"
        ]
      }
    ]
  },
  "urn:concept:garages-for-sale": {
    "label": "Garages for Sale",
    "attributes": [
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:structure-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:brick",
          "urn:concept:shed",
          "urn:concept:tin",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:localization",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:by-the-house",
          "urn:concept:in-building",
          "urn:concept:separate"
        ]
      },
      {
        "code": "urn:concept:heating",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:lighting",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:market",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:primary",
          "urn:concept:secondary"
        ]
      }
    ]
  },
  "urn:concept:apartments-for-rent": {
    "label": "Apartments for Rent",
    "attributes": [
      {
        "code": "urn:concept:number-of-rooms",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:1",
          "urn:concept:10",
          "urn:concept:2",
          "urn:concept:3",
          "urn:concept:4",
          "urn:concept:5",
          "urn:concept:6",
          "urn:concept:7",
          "urn:concept:8",
          "urn:concept:9",
          "urn:concept:more"
        ]
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:construction-year",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:building-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:apartment",
          "urn:concept:block",
          "urn:concept:house",
          "urn:concept:infill",
          "urn:concept:loft",
          "urn:concept:other",
          "urn:concept:ribbon",
          "urn:concept:tenement"
        ]
      },
      {
        "code": "urn:concept:floor",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:10th-floor",
          "urn:concept:11th-floor-and-above",
          "urn:concept:1st-floor",
          "urn:concept:2nd-floor",
          "urn:concept:3rd-floor",
          "urn:concept:4th-floor",
          "urn:concept:5th-floor",
          "urn:concept:6th-floor",
          "urn:concept:7th-floor",
          "urn:concept:8th-floor",
          "urn:concept:9th-floor",
          "urn:concept:cellar",
          "urn:concept:garret",
          "urn:concept:ground-floor"
        ]
      },
      {
        "code": "urn:concept:building-floors",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete"
        ]
      },
      {
        "code": "urn:concept:building-material",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:breeze-block",
          "urn:concept:brick",
          "urn:concept:cellular-concrete",
          "urn:concept:concrete",
          "urn:concept:concrete-plate",
          "urn:concept:hydroton",
          "urn:concept:other",
          "urn:concept:reinforced-concrete",
          "urn:concept:silicate",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:heating",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:boiler-room",
          "urn:concept:electrical",
          "urn:concept:gas",
          "urn:concept:other",
          "urn:concept:tiled-stove",
          "urn:concept:urban"
        ]
      },
      {
        "code": "urn:concept:windows-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:aluminium",
          "urn:concept:plastic",
          "urn:concept:wooden"
        ]
      },
      {
        "code": "urn:concept:free-from",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cable-tv",
          "urn:concept:internet",
          "urn:concept:phone"
        ]
      },
      {
        "code": "urn:concept:equipment-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:dishwasher",
          "urn:concept:fridge",
          "urn:concept:furniture",
          "urn:concept:oven",
          "urn:concept:stove",
          "urn:concept:tv",
          "urn:concept:washing-machine"
        ]
      },
      {
        "code": "urn:concept:extras",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:air-conditioning",
          "urn:concept:balcony",
          "urn:concept:basement",
          "urn:concept:garage",
          "urn:concept:garden",
          "urn:concept:lift",
          "urn:concept:non-smokers-only",
          "urn:concept:separate-kitchen",
          "urn:concept:terrace",
          "urn:concept:two-storey",
          "urn:concept:usable-room"
        ]
      },
      {
        "code": "urn:concept:rent-to-students",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:house-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:circular",
          "urn:concept:detached",
          "urn:concept:semidetached",
          "urn:concept:undetached"
        ]
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      }
    ]
  },
  "urn:concept:houses-for-rent": {
    "label": "Houses for Rent",
    "attributes": [
      {
        "code": "urn:concept:number-of-rooms",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:10",
          "urn:concept:2",
          "urn:concept:3",
          "urn:concept:4",
          "urn:concept:5",
          "urn:concept:6",
          "urn:concept:7",
          "urn:concept:8",
          "urn:concept:9",
          "urn:concept:more"
        ]
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:terrain-area-m2",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:construction-year",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:building-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:detached",
          "urn:concept:farm",
          "urn:concept:residence",
          "urn:concept:ribbon",
          "urn:concept:semi-detached",
          "urn:concept:tenement"
        ]
      },
      {
        "code": "urn:concept:free-from",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete"
        ]
      },
      {
        "code": "urn:concept:building-material",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:breeze-block",
          "urn:concept:brick",
          "urn:concept:cellular-concrete",
          "urn:concept:concrete",
          "urn:concept:concrete-plate",
          "urn:concept:hydroton",
          "urn:concept:other",
          "urn:concept:silicate",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:windows-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:aluminium",
          "urn:concept:inexistent",
          "urn:concept:plastic",
          "urn:concept:wooden"
        ]
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cable-television",
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:internet",
          "urn:concept:phone",
          "urn:concept:sewage",
          "urn:concept:water",
          "urn:concept:water-purification"
        ]
      },
      {
        "code": "urn:concept:attic-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:inexistent",
          "urn:concept:unusable",
          "urn:concept:usable"
        ]
      },
      {
        "code": "urn:concept:roof-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:diagonal",
          "urn:concept:flat",
          "urn:concept:inexistent",
          "urn:concept:plain"
        ]
      },
      {
        "code": "urn:concept:roofing",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:asbestic-tile",
          "urn:concept:chopper",
          "urn:concept:other",
          "urn:concept:roofing-paper",
          "urn:concept:sheet",
          "urn:concept:shingle",
          "urn:concept:slate",
          "urn:concept:tile"
        ]
      },
      {
        "code": "urn:concept:recreational",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:views-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:forest-view",
          "urn:concept:lake-view",
          "urn:concept:mountain-view",
          "urn:concept:sea-view"
        ]
      },
      {
        "code": "urn:concept:access-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:dirt-access",
          "urn:concept:paved",
          "urn:concept:paved-access"
        ]
      },
      {
        "code": "urn:concept:heating-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:biomass",
          "urn:concept:coal",
          "urn:concept:electric",
          "urn:concept:fireplace",
          "urn:concept:gas",
          "urn:concept:geothermal",
          "urn:concept:heat-pump",
          "urn:concept:oil",
          "urn:concept:solar-collector",
          "urn:concept:stove",
          "urn:concept:urban"
        ]
      },
      {
        "code": "urn:concept:fence-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:brick",
          "urn:concept:concrete",
          "urn:concept:hedge",
          "urn:concept:metal",
          "urn:concept:other",
          "urn:concept:wire",
          "urn:concept:wooden"
        ]
      },
      {
        "code": "urn:concept:extras",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:air-conditioning",
          "urn:concept:attic",
          "urn:concept:basement",
          "urn:concept:furniture",
          "urn:concept:garage",
          "urn:concept:pool"
        ]
      },
      {
        "code": "urn:concept:number-of-floors",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:location",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:city",
          "urn:concept:country",
          "urn:concept:suburban"
        ]
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      },
      {
        "code": "urn:concept:floors-in-building",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:ground-floor",
          "urn:concept:more",
          "urn:concept:one-floor",
          "urn:concept:two-floors"
        ]
      }
    ]
  },
  "urn:concept:rooms-for-rent": {
    "label": "Rooms for Rent",
    "attributes": [
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:free-from",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cable-tv",
          "urn:concept:internet",
          "urn:concept:phone"
        ]
      },
      {
        "code": "urn:concept:equipment-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:dishwasher",
          "urn:concept:fridge",
          "urn:concept:furniture",
          "urn:concept:oven",
          "urn:concept:stove",
          "urn:concept:tv",
          "urn:concept:washing-machine"
        ]
      },
      {
        "code": "urn:concept:building-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:apartment",
          "urn:concept:block",
          "urn:concept:house",
          "urn:concept:infill",
          "urn:concept:loft",
          "urn:concept:ribbon",
          "urn:concept:tenement"
        ]
      },
      {
        "code": "urn:concept:non-smokers-only",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:room-size",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1-person",
          "urn:concept:2-persons",
          "urn:concept:3-persons"
        ]
      }
    ]
  },
  "urn:concept:lots-for-rent": {
    "label": "Lots for Rent",
    "attributes": [
      {
        "code": "urn:concept:terrain-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:agricultural",
          "urn:concept:agricultural-building",
          "urn:concept:building",
          "urn:concept:commercial",
          "urn:concept:habitat",
          "urn:concept:other",
          "urn:concept:recreational",
          "urn:concept:woodland"
        ]
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:refinery",
          "urn:concept:sewage",
          "urn:concept:telephone",
          "urn:concept:water"
        ]
      },
      {
        "code": "urn:concept:fence",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:access-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:paved",
          "urn:concept:paved-access",
          "urn:concept:unpaved-access"
        ]
      },
      {
        "code": "urn:concept:views-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:forest-view",
          "urn:concept:lake-view",
          "urn:concept:mountain-view",
          "urn:concept:open-terrain-view",
          "urn:concept:sea-view"
        ]
      },
      {
        "code": "urn:concept:location",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:city",
          "urn:concept:country",
          "urn:concept:suburban"
        ]
      }
    ]
  },
  "urn:concept:stores-for-rent": {
    "label": "Stores for Rent",
    "attributes": [
      {
        "code": "urn:concept:type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:block",
          "urn:concept:historic-building",
          "urn:concept:office-building",
          "urn:concept:private-house",
          "urn:concept:separate",
          "urn:concept:shopping-center",
          "urn:concept:tenement-house"
        ]
      },
      {
        "code": "urn:concept:construction-year",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:floor",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:10th-floor",
          "urn:concept:11th-floor-and-above",
          "urn:concept:1st-floor",
          "urn:concept:2nd-floor",
          "urn:concept:3rd-floor",
          "urn:concept:4th-floor",
          "urn:concept:5th-floor",
          "urn:concept:6th-floor",
          "urn:concept:7th-floor",
          "urn:concept:8th-floor",
          "urn:concept:9th-floor",
          "urn:concept:cellar",
          "urn:concept:garret",
          "urn:concept:ground-floor"
        ]
      },
      {
        "code": "urn:concept:use-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:gastronomy",
          "urn:concept:hotel",
          "urn:concept:industrial",
          "urn:concept:office",
          "urn:concept:retail",
          "urn:concept:services"
        ]
      },
      {
        "code": "urn:concept:free-from",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cable-television",
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:internet",
          "urn:concept:phone",
          "urn:concept:sewage",
          "urn:concept:water",
          "urn:concept:water-purification"
        ]
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete"
        ]
      },
      {
        "code": "urn:concept:building-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:block",
          "urn:concept:historic-building",
          "urn:concept:office-building",
          "urn:concept:private-house",
          "urn:concept:separate",
          "urn:concept:shopping-center",
          "urn:concept:tenement-house"
        ]
      },
      {
        "code": "urn:concept:extras",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:access-with-asphalt",
          "urn:concept:air-conditioning",
          "urn:concept:asphalt-access",
          "urn:concept:elevator",
          "urn:concept:furniture",
          "urn:concept:heating",
          "urn:concept:parking",
          "urn:concept:shop-window"
        ]
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      }
    ]
  },
  "urn:concept:warehouses-for-rent": {
    "label": "Warehouses for Rent",
    "attributes": [
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:heating",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:height",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:fence",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:structure-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:brick",
          "urn:concept:glass",
          "urn:concept:shed",
          "urn:concept:steel",
          "urn:concept:tent",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:access-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:paved",
          "urn:concept:paved-access",
          "urn:concept:unpaved-access"
        ]
      },
      {
        "code": "urn:concept:parking-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:asphalt",
          "urn:concept:cobblestone",
          "urn:concept:concrete",
          "urn:concept:none",
          "urn:concept:paved",
          "urn:concept:unpaved",
          "urn:concept:unpaved-access"
        ]
      },
      {
        "code": "urn:concept:status",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:in-renovation",
          "urn:concept:ready-to-use",
          "urn:concept:to-complete",
          "urn:concept:unfinished-close",
          "urn:concept:unfinished-open"
        ]
      },
      {
        "code": "urn:concept:flooring-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:none",
          "urn:concept:pollen",
          "urn:concept:unpollen"
        ]
      },
      {
        "code": "urn:concept:office-space",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:social-facilities",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:ramp",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:use-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:commercial",
          "urn:concept:manufacturing",
          "urn:concept:office",
          "urn:concept:stock"
        ]
      },
      {
        "code": "urn:concept:media-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:cesspool",
          "urn:concept:electricity",
          "urn:concept:gas",
          "urn:concept:internet",
          "urn:concept:phone",
          "urn:concept:power",
          "urn:concept:sewage",
          "urn:concept:water",
          "urn:concept:water-purification"
        ]
      },
      {
        "code": "urn:concept:security-types",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm",
          "urn:concept:anti-burglary-door",
          "urn:concept:closed-area",
          "urn:concept:entryphone",
          "urn:concept:monitoring",
          "urn:concept:roller-shutters"
        ]
      }
    ]
  },
  "urn:concept:garages-for-rent": {
    "label": "Garages for Rent",
    "attributes": [
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:structure-type",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:brick",
          "urn:concept:shed",
          "urn:concept:tin",
          "urn:concept:wood"
        ]
      },
      {
        "code": "urn:concept:localization",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:by-the-house",
          "urn:concept:in-building",
          "urn:concept:separate"
        ]
      },
      {
        "code": "urn:concept:heating",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      },
      {
        "code": "urn:concept:lighting",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:n",
          "urn:concept:y"
        ]
      }
    ]
  },
  "urn:concept:investments": {
    "label": "Investments",
    "attributes": [
      {
        "code": "urn:concept:state",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:in-building",
          "urn:concept:in-construction",
          "urn:concept:not-started",
          "urn:concept:ready"
        ]
      },
      {
        "code": "urn:concept:start-date",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:end-date",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:area-from",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:area-to",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:price-per-sq-meter-from",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:floors-in-building",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:estate-type",
        "type": "select",
        "mandatory": true,
        "values": [
          "urn:concept:commercial-properties",
          "urn:concept:flats",
          "urn:concept:houses"
        ]
      },
      {
        "code": "urn:concept:hide-price",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:no",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:total-number-of-properties-in-the-investment",
        "type": "input",
        "mandatory": true,
        "values": []
      },
      {
        "code": "urn:concept:project-amenities",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:disabled-friendly",
          "urn:concept:elevators",
          "urn:concept:gym",
          "urn:concept:playground",
          "urn:concept:relax-area",
          "urn:concept:sport-fields",
          "urn:concept:swimming-pool"
        ]
      },
      {
        "code": "urn:concept:extra-spaces",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:balcony",
          "urn:concept:basement",
          "urn:concept:bicycle-room",
          "urn:concept:ground-parking-space",
          "urn:concept:storage",
          "urn:concept:terrace",
          "urn:concept:underground-parking-space"
        ]
      },
      {
        "code": "urn:concept:ceiling-height-from-cm",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:ceiling-height-to-cm",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:remote-services",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:yes"
        ]
      },
      {
        "code": "urn:concept:project-security",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:alarm-system",
          "urn:concept:closed-area",
          "urn:concept:monitoring",
          "urn:concept:security-vigilance",
          "urn:concept:smoke-detector"
        ]
      },
      {
        "code": "urn:concept:net-area-m2",
        "type": "input",
        "mandatory": false,
        "values": []
      },
      {
        "code": "urn:concept:number-of-rooms",
        "type": "select",
        "mandatory": false,
        "values": [
          "urn:concept:1",
          "urn:concept:10",
          "urn:concept:2",
          "urn:concept:3",
          "urn:concept:4",
          "urn:concept:5",
          "urn:concept:6",
          "urn:concept:7",
          "urn:concept:8",
          "urn:concept:9",
          "urn:concept:more"
        ]
      },
      {
        "code": "urn:concept:on-demand",
        "type": "multiple",
        "mandatory": false,
        "values": [
          "urn:concept:yes"
        ]
      }
    ]
  }
};

/** Categoriile care există efectiv pe Storia.ro. */
export function storiaCategoryExists(categoryUrn: string): boolean {
  return Object.hasOwn(STORIA_TAXONOMY_SNAPSHOT, categoryUrn);
}

/** Specificația unui atribut în cadrul unei categorii, dacă există. */
export function storiaAttributeSpec(
  categoryUrn: string,
  attributeUrn: string,
): StoriaAttributeSpec | null {
  const category = STORIA_TAXONOMY_SNAPSHOT[categoryUrn];
  if (!category) return null;
  return category.attributes.find((a) => a.code === attributeUrn) ?? null;
}

/** Atributele marcate obligatoriu de Storia pentru o categorie. */
export function storiaMandatoryAttributes(categoryUrn: string): readonly string[] {
  const category = STORIA_TAXONOMY_SNAPSHOT[categoryUrn];
  if (!category) return [];
  return category.attributes.filter((a) => a.mandatory).map((a) => a.code);
}
