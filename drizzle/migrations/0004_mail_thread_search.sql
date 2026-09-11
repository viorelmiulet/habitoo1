-- Full-text-ish search over mail threads: sender, recipients, subject, body,
-- plus an optional date range. Same shape as mail_thread_list so the reader
-- code maps a single row type. SECURITY DEFINER + superadmin-only callers
-- (the app calls it exclusively through the service-role client).
CREATE OR REPLACE FUNCTION public.mail_thread_search(
  _mailbox_id uuid,
  _status text,
  _limit integer,
  _offset integer,
  _q text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _unread_only boolean DEFAULT false,
  _has_attachments boolean DEFAULT NULL
)
RETURNS TABLE(
  id uuid, mailbox_id uuid, subject text, participants text[],
  message_count integer, unread_count integer, last_message_at timestamptz,
  last_direction text, status text, last_stripped_text text,
  last_text_body text, last_has_html boolean, has_attachments boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with q as (select nullif(btrim(coalesce(_q, '')), '') as term)
  select t.id, t.mailbox_id, t.subject, t.participants, t.message_count, t.unread_count,
    t.last_message_at, t.last_direction, t.status,
    left(m.stripped_text, 400), left(m.text_body, 400),
    coalesce(length(coalesce(m.html_body, '')) > 0, false),
    coalesce(a.has_att, false)
  from public.email_threads t
  cross join q
  left join lateral (
    select em.stripped_text, em.text_body, em.html_body
    from public.email_messages em where em.thread_id = t.id
    order by em.created_at desc, em.id desc limit 1
  ) m on true
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
  order by t.last_message_at desc nulls last, t.id desc
  limit greatest(1, least(coalesce(_limit, 50), 100))
  offset greatest(0, coalesce(_offset, 0))
$function$;

CREATE OR REPLACE FUNCTION public.mail_thread_search_count(
  _mailbox_id uuid,
  _status text,
  _q text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _unread_only boolean DEFAULT false,
  _has_attachments boolean DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select count(*)::int from public.mail_thread_search(
    _mailbox_id, _status, 100000, 0, _q, _from, _to, _unread_only, _has_attachments
  )
$function$;

REVOKE ALL ON FUNCTION public.mail_thread_search(uuid, text, integer, integer, text, timestamptz, timestamptz, boolean, boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mail_thread_search_count(uuid, text, text, timestamptz, timestamptz, boolean, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_thread_search(uuid, text, integer, integer, text, timestamptz, timestamptz, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.mail_thread_search_count(uuid, text, text, timestamptz, timestamptz, boolean, boolean) TO service_role;