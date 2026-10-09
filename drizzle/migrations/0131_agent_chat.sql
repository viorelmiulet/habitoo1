-- lovable-cron-fallback-reviewed: 288 runs/day max; armed only when a chat message is sent and unscheduled once no unread message awaits an email.
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null,
  user_b uuid not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint chat_conversations_pair_order check (user_a < user_b),
  constraint chat_conversations_pair_unique unique (user_a, user_b)
);
create table public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  blocked_at timestamptz,
  last_email_at timestamptz,
  primary key (conversation_id, user_id)
);
create index chat_participants_user_idx on public.chat_participants(user_id);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  constraint chat_messages_body_len check (char_length(btrim(body)) between 1 and 4000)
);
create index chat_messages_conv_idx on public.chat_messages(conversation_id, created_at desc);
create index chat_messages_pending_email_idx on public.chat_messages(created_at) where emailed_at is null;
create table public.chat_presence (
  user_id uuid primary key,
  last_seen_at timestamptz not null default now()
);

grant select on public.chat_conversations to authenticated;
grant select on public.chat_participants to authenticated;
grant update (last_read_at, blocked_at) on public.chat_participants to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant all on public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_presence to service_role;

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_presence enable row level security;

create or replace function public.is_chat_participant(_conv uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_participants where conversation_id = _conv and user_id = _user)
$$;

-- utilizator activ într-o agenție activă (sau în perioadă de probă), nearhivată
create or replace function public.chat_user_eligible(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.organizations o on o.id = p.organization_id
    where p.id = _user and coalesce(p.is_active, true)
      and o.status in ('active','trial') and o.archived_at is null
  )
$$;

create policy "chat conv participants read" on public.chat_conversations for select to authenticated
  using (public.is_chat_participant(id, auth.uid()));
create policy "chat participants read" on public.chat_participants for select to authenticated
  using (public.is_chat_participant(conversation_id, auth.uid()));
create policy "chat participants update own" on public.chat_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "chat messages read" on public.chat_messages for select to authenticated
  using (public.is_chat_participant(conversation_id, auth.uid()));
create policy "chat messages send" on public.chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and emailed_at is null
    and public.is_chat_participant(conversation_id, auth.uid())
    and public.chat_user_eligible(auth.uid())
    -- utilizatorul blocat de celălalt participant nu mai poate trimite
    and not exists (
      select 1 from public.chat_participants cp
      where cp.conversation_id = chat_messages.conversation_id
        and cp.user_id <> auth.uid() and cp.blocked_at is not null
    )
  );

-- O singură conversație între aceiași doi utilizatori.
create or replace function public.chat_open_conversation(_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _a uuid; _b uuid; _id uuid;
begin
  if _me is null then raise exception 'Neautentificat'; end if;
  if _other is null or _other = _me then raise exception 'Destinatar invalid'; end if;
  if not public.chat_user_eligible(_me) or not public.chat_user_eligible(_other) then
    raise exception 'Utilizatorul nu este disponibil pentru chat';
  end if;
  _a := least(_me, _other); _b := greatest(_me, _other);
  insert into public.chat_conversations(user_a, user_b) values (_a, _b)
    on conflict (user_a, user_b) do nothing;
  select id into _id from public.chat_conversations where user_a = _a and user_b = _b;
  insert into public.chat_participants(conversation_id, user_id) values (_id, _a), (_id, _b)
    on conflict do nothing;
  return _id;
end $$;

-- Lista de contacte: doar nume, poză, agenție și ultima prezență (fără telefon/email).
create or replace function public.chat_directory()
returns table(user_id uuid, full_name text, avatar_path text, organization_id uuid, organization_name text, last_seen_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Agent'), p.avatar_url, o.id, o.name, pr.last_seen_at
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  left join public.chat_presence pr on pr.user_id = p.id
  where auth.uid() is not null and public.chat_user_eligible(auth.uid())
    and coalesce(p.is_active, true) and o.status in ('active','trial') and o.archived_at is null
$$;

-- Conversațiile mele cu celălalt participant și numărul de necitite.
create or replace function public.chat_my_conversations()
returns table(conversation_id uuid, other_user_id uuid, unread integer, last_message_at timestamptz, i_blocked boolean, blocked_me boolean)
language sql stable security definer set search_path = public as $$
  select c.id, o.user_id,
    (select count(*)::int from public.chat_messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at),
    c.last_message_at, me.blocked_at is not null, o.blocked_at is not null
  from public.chat_participants me
  join public.chat_conversations c on c.id = me.conversation_id
  join public.chat_participants o on o.conversation_id = c.id and o.user_id <> me.user_id
  where me.user_id = auth.uid()
$$;

create or replace function public.chat_touch_presence()
returns void language sql security definer set search_path = public as $$
  insert into public.chat_presence(user_id, last_seen_at) select auth.uid(), now() where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = now()
$$;

-- Emailuri: necitit de 15 min, maximum unul pe conversație și destinatar pe oră.
create or replace function public.chat_email_claim()
returns table(conversation_id uuid, recipient_id uuid, sender_id uuid, message_count integer)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select m.conversation_id, r.user_id as recipient_id, m.sender_id, count(*)::int as n
    from public.chat_messages m
    join public.chat_participants r on r.conversation_id = m.conversation_id and r.user_id <> m.sender_id
    where m.emailed_at is null
      and m.created_at <= now() - interval '15 minutes'
      and m.created_at > now() - interval '2 days'
      and m.created_at > r.last_read_at
      and (r.last_email_at is null or r.last_email_at <= now() - interval '1 hour')
    group by m.conversation_id, r.user_id, m.sender_id
  ), mark_p as (
    update public.chat_participants p set last_email_at = now()
    from due where p.conversation_id = due.conversation_id and p.user_id = due.recipient_id
    returning p.conversation_id
  ), mark_m as (
    update public.chat_messages m set emailed_at = now()
    from due where m.conversation_id = due.conversation_id and m.sender_id = due.sender_id
      and m.emailed_at is null and m.created_at <= now() - interval '15 minutes'
    returning m.id
  )
  select due.conversation_id, due.recipient_id, due.sender_id, due.n from due;
end $$;

create or replace function public.chat_email_arm()
returns void language plpgsql security definer set search_path = public, cron as $$
begin
  if not exists (select 1 from cron.job where jobname = 'chat-email-worker') then
    perform cron.schedule('chat-email-worker', '*/5 * * * *', 'select public.chat_email_tick()');
  end if;
end $$;

create or replace function public.chat_email_tick()
returns void language plpgsql security definer set search_path = public, cron as $$
declare _pending integer;
begin
  select count(*) into _pending from public.chat_messages m
   join public.chat_participants r on r.conversation_id = m.conversation_id and r.user_id <> m.sender_id
   where m.emailed_at is null and m.created_at > now() - interval '2 days' and m.created_at > r.last_read_at;
  if _pending = 0 then
    perform cron.unschedule('chat-email-worker');
    return;
  end if;
  perform net.http_post(
    url := 'https://crm.habitoo.ro/api/public/cron/chat-email',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-nonce', public.cron_nonce_issue('chat_email')),
    body := '{}'::jsonb
  );
end $$;

create or replace function public.chat_messages_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.chat_conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.chat_participants set last_read_at = greatest(last_read_at, new.created_at)
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  perform public.chat_email_arm();
  return new;
end $$;
create trigger chat_messages_after_insert after insert on public.chat_messages
  for each row execute function public.chat_messages_after_insert();

revoke execute on function public.chat_email_claim(), public.chat_email_arm(), public.chat_email_tick(), public.chat_messages_after_insert() from public, anon, authenticated;
grant execute on function public.chat_email_claim(), public.chat_email_arm(), public.chat_email_tick() to service_role;
revoke execute on function public.chat_open_conversation(uuid), public.chat_directory(), public.chat_my_conversations(), public.chat_touch_presence(), public.is_chat_participant(uuid, uuid), public.chat_user_eligible(uuid) from public, anon;
grant execute on function public.chat_open_conversation(uuid), public.chat_directory(), public.chat_my_conversations(), public.chat_touch_presence(), public.is_chat_participant(uuid, uuid), public.chat_user_eligible(uuid) to authenticated, service_role;

alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_participants;