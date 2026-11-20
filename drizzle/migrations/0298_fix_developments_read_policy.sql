drop policy if exists developments_read on public.developments;
create policy developments_read on public.developments for select using (
  deleted_at is null and (
    is_superadmin() or (
      organization_id = current_org() and (
        has_role(auth.uid(),'agency_admin'::app_role)
        or assigned_to = auth.uid()
        or exists (select 1 from public.properties p
                   where p.development_id = developments.id
                     and p.assigned_to = auth.uid()
                     and p.deleted_at is null)))));

drop policy if exists development_images_write on public.development_images;
create policy development_images_write on public.development_images for all
  using (can_access_development(development_id, true))
  with check (
    can_access_development(development_id, true)
    and exists (select 1 from public.developments d
                where d.id = development_images.development_id
                  and d.organization_id = development_images.organization_id)
    and storage_path like (organization_id::text || '/developments/' || development_id::text || '/%')
    and url = storage_path);