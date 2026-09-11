create or replace function public.mail_thread_search_count(
  _mailbox_id uuid,
  _status text,
  _q text default null,
  _from timestamptz default null,
  _to timestamptz default null,
  _unread_only boolean default false,
  _has_attachments boolean default null
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  with q as (select nullif(btrim(coalesce(_q, '')), '') as term)
  select count(*)::int
  from public.email_threads t
  cross join q
  left join lateral (
    select exists (
      select 1 from public.email_attachments ea
      join public.email_messages em2 on em2.id = ea.message_id
      where em2.thread_id = t.id
    ) as has_att
  ) a on true
  where t.status = _status
    and (_mailbox_id is null or t.mailbox_id = _mailbox_id)
    and (coalesce(_unread_only, false) = false or t.unread_count > 0)
    and (_has_attachments is null or coalesce(a.has_att, false) = _has_attachments)
    and (_from is null or t.last_message_at >= _from)
    and (_to is null or t.last_message_at <= _to)
    and (
      q.term is null
      or coalesce(t.subject, '') ilike '%' || q.term || '%'
      or array_to_string(t.participants, ' ') ilike '%' || q.term || '%'
      or exists (
        select 1 from public.email_messages em3
        where em3.thread_id = t.id
          and (
            em3.from_email ilike '%' || q.term || '%'
            or coalesce(em3.from_name, '') ilike '%' || q.term || '%'
            or array_to_string(em3.to_emails, ' ') ilike '%' || q.term || '%'
            or array_to_string(em3.cc_emails, ' ') ilike '%' || q.term || '%'
            or coalesce(em3.subject, '') ilike '%' || q.term || '%'
            or coalesce(em3.stripped_text, '') ilike '%' || q.term || '%'
            or coalesce(em3.text_body, '') ilike '%' || q.term || '%'
          )
      )
    )
$$;

revoke all on function public.mail_thread_search_count(uuid, text, text, timestamptz, timestamptz, boolean, boolean) from anon, authenticated;
grant execute on function public.mail_thread_search_count(uuid, text, text, timestamptz, timestamptz, boolean, boolean) to service_role;