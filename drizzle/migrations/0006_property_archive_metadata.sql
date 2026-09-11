-- Arhivarea folosește statusul existent `archived` din enum-ul property_status.
-- Coloanele de mai jos păstrează urma arhivării și statusul comercial anterior,
-- ca dezarhivarea să readucă proprietatea exact în starea în care era.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID,
  ADD COLUMN IF NOT EXISTS pre_archive_status public.property_status;

CREATE INDEX IF NOT EXISTS properties_archived_at_idx
  ON public.properties (organization_id, archived_at);