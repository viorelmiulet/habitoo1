-- Indexuri pentru cele mai lente interogări măsurate în pg_stat_statements.
-- property_images: filtrare pe property_id cu sortare pe position (2725 apeluri, ~111 ms medie, seq scan confirmat).
CREATE INDEX IF NOT EXISTS property_images_property_position_idx
  ON public.property_images USING btree (property_id, position);

-- audit_logs: filtrare pe entity_id cu sortare created_at DESC (2440 apeluri, ~75 ms medie; exista doar PK pe id).
CREATE INDEX IF NOT EXISTS audit_logs_entity_created_idx
  ON public.audit_logs USING btree (entity_id, created_at DESC);

-- ro_localities: filtrare pe county_siruta_code + active cu sortare pe normalized_name (268 apeluri, ~896 ms medie, seq scan pe 13.755 rânduri).
CREATE INDEX IF NOT EXISTS ro_localities_county_siruta_active_idx
  ON public.ro_localities USING btree (county_siruta_code, normalized_name)
  WHERE active;

-- portal_publications: filtrare pe portal_key + enabled (6938 apeluri; indexurile existente încep cu organization_id).
CREATE INDEX IF NOT EXISTS portal_publications_portal_enabled_idx
  ON public.portal_publications USING btree (portal_key, enabled);