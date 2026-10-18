-- All changes and notifications roll back. No email functions or external services are called.
begin;
do $$
declare
 admin_id uuid; org_id uuid; super_id uuid; agent_id uuid; request_id uuid; changed_id uuid;
 n integer; expected integer; used_before integer; before_notifications integer; target timestamptz := '2027-10-18T23:59:59.999Z';
begin
 select r.user_id,r.organization_id into admin_id,org_id from public.user_roles r join public.profiles p on p.id=r.user_id join public.organizations o on o.id=r.organization_id where r.role='agency_admin' and p.organization_id=r.organization_id and o.archived_at is null and not exists(select 1 from public.user_roles s where s.user_id=r.user_id and s.role='superadmin') and not exists(select 1 from public.subscription_requests s where s.organization_id=r.organization_id and s.status='pending') limit 1;
 select user_id into super_id from public.user_roles where role='superadmin' limit 1;
 select user_id into agent_id from public.user_roles where role='agent' and user_id<>admin_id limit 1;
 if admin_id is null or super_id is null or agent_id is null then raise exception 'Test needs existing agency admin, superadmin and agent fixtures'; end if;
 select count(distinct user_id) into expected from public.user_roles where role='superadmin';
 select count(*) into before_notifications from public.notifications where type='subscription_request';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 request_id:=public.submit_subscription_request('unlimited','12m','test rollback');
 begin
 perform public.submit_subscription_request('pro','30d','duplicate');
 raise exception 'FAIL: second pending accepted';
 exception when unique_violation then null; end;
 execute 'reset role';
 select count(*) into n from public.notifications where type='subscription_request';
 if n-before_notifications<>expected then raise exception 'FAIL: superadmin notification count'; end if;
 if not exists(select 1 from public.notifications where user_id=super_id and link='/superadmin/cereri-abonament?request='||request_id::text) then raise exception 'FAIL: superadmin request link'; end if;
 raise notice 'PASS: one pending, all superadmins notified';
 -- Ordinary agents cannot create or read agency requests.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',agent_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.subscription_requests where id=request_id;
 if n<>0 then raise exception 'FAIL: agent reads request'; end if;
 begin
 perform public.submit_subscription_request('basic','30d');
 raise exception 'FAIL: agent created request';
 exception when raise_exception then if SQLERRM='FAIL: agent created request' then raise; end if; end;
 execute 'reset role';
 -- Suspension must not prevent an admin from reading or replacing a request.
 update public.organizations set status='suspended',suspended_reason='subscription_expired' where id=org_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if public.current_org() is not null then raise exception 'FAIL: normal CRM org gate open'; end if;
 if public.subscription_request_org() is distinct from org_id then raise exception 'FAIL: suspended admin scope'; end if;
 if (public.subscription_request_summary()->>'organizationId')<>org_id::text then raise exception 'FAIL: suspended summary'; end if;
 changed_id:=public.submit_subscription_request('unlimited','12m','changed',request_id);
 select count(*) into n from public.subscription_requests where organization_id=org_id and status='pending';
 if n<>1 then raise exception 'FAIL: replace pending count'; end if;
 execute 'reset role';
 raise notice 'PASS: agent denied; suspended admin can read/change';
 -- Temporary agent-role fixtures using existing profiles; everything rolls back.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 update public.profiles set is_active=true where id in (select id from public.profiles limit 4);
 insert into public.user_roles(user_id,organization_id,role)
 select id,org_id,'agent' from public.profiles p where p.is_active limit 4
 on conflict (user_id,role) do update set organization_id=excluded.organization_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 select used into used_before from public.org_seat_usage(org_id);
 if used_before<4 then raise exception 'Need four active agents for seat validation test'; end if;
 execute 'set local role authenticated';
 begin
 perform public.submit_subscription_request('basic','30d','too small',changed_id);
 raise exception 'FAIL: under-limit plan accepted';
 exception when raise_exception then if SQLERRM='FAIL: under-limit plan accepted' then raise; end if; end;
 execute 'reset role';
 raise notice 'PASS: Basic blocked above three active agents';
 -- Resolve using shared activation logic, with explicit start/expiry.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.resolve_subscription_request(changed_id,'approved','2026-10-18T00:00:00Z',target);
 execute 'reset role';
 if not exists(select 1 from public.organizations where id=org_id and plan='unlimited' and subscription_term='12m' and subscription_started_at='2026-10-18T00:00:00Z' and subscription_expires_at=target and not is_trial and status='active' and max_users=1000000 and suspended_reason is null) then raise exception 'FAIL: activation fields'; end if;
 if not exists(select 1 from public.subscription_requests where id=changed_id and status='approved' and resolved_by=super_id and resolved_at is not null) then raise exception 'FAIL: approved request'; end if;
 if not exists(select 1 from public.notifications where user_id=admin_id and type='subscription_resolved' and title like 'Abonamentul Unlimited a fost activat până la %') then raise exception 'FAIL: activation notification'; end if;
 raise notice 'PASS: activation dates, plan, seats, active status, is_trial=false, notification';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 request_id:=public.submit_subscription_request('unlimited','30d','reject test');
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.resolve_subscription_request(request_id,'rejected',null,null,'Documente incomplete');
 execute 'reset role';
 if not exists(select 1 from public.subscription_requests where id=request_id and status='rejected' and rejection_reason='Documente incomplete') then raise exception 'FAIL: rejection'; end if;
 if not exists(select 1 from public.notifications where user_id=admin_id and type='subscription_resolved' and body='Cererea de abonament Unlimited a fost respinsă: Documente incomplete') then raise exception 'FAIL: rejection notification'; end if;
 if not exists(select 1 from public.organizations where id=org_id and subscription_expires_at=target and status='active') then raise exception 'FAIL: rejection changed subscription'; end if;
 raise notice 'PASS: rejection notification and unchanged active subscription';
end $$;
rollback;
