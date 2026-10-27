import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { buildSearchPlaces, legacyPlaceChoices, parsePlaceChoices, placeMatches, serializePlaces, type SearchPlaceRow } from "./search-places";
import { propertyListSearchSchema, propertyListStateFromSearch, propertyListSearchFromState, normalizeSavedPropertyFilters } from "./property-list-filters";
const rows: SearchPlaceRow[] = [
 { county:"București",city:"București",district:"Militari" },
 { county:"Ilfov",city:"Chiajna",district:"Centru" },
 { county:"Ilfov",city:"Voluntari",district:"Pipera" },
 { county:"București",city:"București",district:"Titan" },
 { county:"Cluj",city:"Cluj-Napoca",district:"Militari" },
];
const choices = [...legacyPlaceChoices("București","București","Militari"),...legacyPlaceChoices("Ilfov","Chiajna")];
describe("cross-region geography", () => {
 it("Militari + Chiajna matches only both scopes", () => { expect(rows.filter(r=>placeMatches(r,choices))).toEqual(rows.slice(0,2)); });
 it("Ilfov includes every locality without counting Chiajna twice",()=>{expect(rows.filter(r=>placeMatches(r,[...choices,...legacyPlaceChoices("Ilfov")]))).toEqual(rows.slice(0,3));});
 it("removing Militari leaves all Chiajna zones",()=>{expect(rows.filter(r=>placeMatches(r,choices.slice(1)))).toEqual([rows[1]]);});
 it("counts all rows and scopes repeated neighborhoods",()=>{const opts=buildSearchPlaces(rows);expect(opts.find(o=>o.label==='Ilfov (tot județul)')?.count).toBe(2);expect(opts.filter(o=>o.choice.zone==='militari')).toHaveLength(2);});
 it("URL and saved filters preserve choices alongside price",()=>{const locuri=serializePlaces(choices);const state=propertyListStateFromSearch(propertyListSearchSchema.parse({locuri,priceMin:'100000'}));expect(parsePlaceChoices(propertyListSearchFromState(state.filters,state.sort,state.page,state.view).locuri)).toEqual(choices);expect(normalizeSavedPropertyFilters(state.filters).locuri).toBe(locuri);expect(state.filters.priceMin).toBe('100000');});
 it("keeps old county/city/zone links",()=>{expect(legacyPlaceChoices('Ilfov')[0].kind).toBe('county');expect(legacyPlaceChoices(undefined,'București','Militari')[0]).toMatchObject({county:'',city:'bucuresti',zone:'militari'});});
 it("Sector 6 legacy properties belong to București and the same Militari option",()=>{const row={county:'Bucureşti',city:'Sector 6',district:'Militari'};expect(placeMatches(row,choices)).toBe(true);expect(buildSearchPlaces([rows[0],row]).find(o=>o.choice.zone==='militari')?.count).toBe(2);});
 it("executes parameterized SQL union and conjunctive price filtering", async()=>{
  const db=new PGlite();
  await db.exec("CREATE FUNCTION public.ro_normalize_name(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT trim(regexp_replace(lower(translate(coalesce(v,''),'ăâîșşțţ','aaisstt')), '[^a-z0-9]+',' ','g')) $$; CREATE TABLE public.properties(id int,county text,city text,district text,price int); CREATE TABLE public.listings(id int,county text,city text,zone text,neighborhood text); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await db.exec(readFileSync('drizzle/migrations/0190_multi_geography_read_filters.sql','utf8'));
  await db.exec(readFileSync('drizzle/migrations/0191_multi_geography_legacy_sector_scope.sql','utf8'));
  for (const [i,r] of rows.entries()) await db.query('INSERT INTO properties VALUES ($1,$2,$3,$4,$5)',[i,r.county,r.city,r.district,100+i]);
  await db.query('INSERT INTO properties VALUES (5,$1,$2,$3,100)', ['Bucureşti','Sector 6','Militari']);
  expect((await db.query('SELECT id FROM search_properties_places($1::jsonb) ORDER BY id',[serializePlaces(choices)])).rows).toEqual([{id:0},{id:1},{id:5}]);
  expect((await db.query('SELECT id FROM search_properties_places($1::jsonb) WHERE price >= $2 ORDER BY id',[serializePlaces([...choices,...legacyPlaceChoices('Ilfov')]),101])).rows).toEqual([{id:1},{id:2}]);
  expect((await db.query('SELECT id FROM search_properties_places($1::jsonb)',[serializePlaces([{kind:'zone',county:'',city:'bucuresti',zone:'militari),id.gt.0'}])])).rows).toEqual([]);
  await db.close();
 });
});
