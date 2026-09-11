-- Run as database owner via Supabase MCP execute_sql or psql. Every fixture,
-- actor and payment is rolled back. Raises an exception on any regression.
begin;
create temporary table settlement_test_ids (gid uuid,a uuid,b uuid,c uuid,outsider uuid,auth_a uuid,auth_b uuid,auth_c uuid,auth_out uuid,expense uuid,payment uuid,idem uuid,stale_payment uuid);
insert into settlement_test_ids select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,gen_random_uuid(),null;
insert into auth.users(id,aud,role,email,created_at,updated_at,raw_user_meta_data)
select auth_a,'authenticated','authenticated',auth_a::text||'@settlement-test.invalid',now(),now(),'{}'::jsonb from settlement_test_ids union all
select auth_b,'authenticated','authenticated',auth_b::text||'@settlement-test.invalid',now(),now(),'{}'::jsonb from settlement_test_ids union all
select auth_out,'authenticated','authenticated',auth_out::text||'@settlement-test.invalid',now(),now(),'{}'::jsonb from settlement_test_ids;
-- Reuse profiles if an auth signup trigger already created them.
update settlement_test_ids t set a=coalesce((select id from public.profiles where auth_user_id=t.auth_a),a),
  b=coalesce((select id from public.profiles where auth_user_id=t.auth_b),b),
  outsider=coalesce((select id from public.profiles where auth_user_id=t.auth_out),outsider);
-- Profiles intentionally have different auth IDs; C is a placeholder.
insert into public.profiles(id,auth_user_id,display_name)
select a,auth_a,'Settlement test admin' from settlement_test_ids union all
select b,auth_b,'Settlement test payer' from settlement_test_ids union all
select c,null,'Settlement test placeholder' from settlement_test_ids union all
select outsider,auth_out,'Settlement test outsider' from settlement_test_ids
on conflict(id) do nothing;
insert into public.groups(id,name,created_by) select gid,'Rollback settlement test',a from settlement_test_ids;
insert into public.memberships(group_id,user_id,role,authenticated)
select gid,a,'admin',true from settlement_test_ids union all
select gid,b,'member',true from settlement_test_ids union all
select gid,c,'member',false from settlement_test_ids;
grant select,update on settlement_test_ids to authenticated,service_role;

create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
create function pg_temp.expect_error(statement text,fragment text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(lower(fragment) in lower(sqlerrm))=0 then raise exception 'Wrong error: %, expected %',sqlerrm,fragment; end if;
    return;
  end;
  raise exception 'FAILED: expected error containing %',fragment;
end $$;

select set_config('request.jwt.claim.sub',(select auth_a::text from settlement_test_ids),true);
set local role authenticated;
update settlement_test_ids set expense=(public.create_expense_with_splits(gid,'Dinner',90,current_date,a,
  jsonb_build_array(jsonb_build_object('user_id',a,'amount',30),jsonb_build_object('user_id',b,'amount',30),jsonb_build_object('user_id',c,'amount',30)))).id;
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert_true((select balance=60 from public.get_group_balances(t.gid) where profile_id=t.a),'payer balance credits explicit profile payer') from settlement_test_ids t;
select pg_temp.assert_true((select sum(balance)=0 from public.get_group_balances(t.gid)),'zero sum') from settlement_test_ids t;
select pg_temp.expect_error(format('select public.create_expense_with_splits(%L,%L,10,current_date,%L,%L::jsonb)',gid,'Bad',a,jsonb_build_array(jsonb_build_object('user_id',a,'amount',9))), 'equal expense total') from settlement_test_ids;
select pg_temp.assert_true((select count(*)=1 from public.expenses where group_id=t.gid),'failed expense creates no partial header') from settlement_test_ids t;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,1.001,%L,%L,null,gen_random_uuid())',gid,b,a,'confirmed','cash'),'whole cents') from settlement_test_ids;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,-1,%L,%L,null,gen_random_uuid())',gid,b,a,'confirmed','cash'),'whole cents') from settlement_test_ids;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,1,%L,%L,null,gen_random_uuid())',gid,a,a,'confirmed','cash'),'different') from settlement_test_ids;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,31,%L,%L,null,gen_random_uuid())',gid,b,a,'confirmed','cash'),'exceeds') from settlement_test_ids;
select pg_temp.expect_error(format('update public.expenses set amount=1 where id=%L',expense),'permission denied') from settlement_test_ids;
select pg_temp.expect_error(format('delete from public.expense_splits where expense_id=%L',expense),'permission denied') from settlement_test_ids;


-- Admin records a placeholder's completed payment with no payment method.
update settlement_test_ids set payment=(public.record_settlement(gid,c,a,20,null,'Cash outside the app',idem,date '2026-08-31')).id;
select pg_temp.assert_true((select status='confirmed' and payment_method is null and payment_date=date '2026-08-31' and created_by=t.a from public.settlements where id=t.payment),'completed, dated and audited') from settlement_test_ids t;
select pg_temp.assert_true((select balance=-10 from public.get_group_balances(t.gid) where profile_id=t.c),'immediate balance change') from settlement_test_ids t;
select pg_temp.assert_true((public.record_settlement(gid,c,a,20,null,'Cash outside the app',idem,date '2026-08-31')).id=payment,'retry once') from settlement_test_ids;
select pg_temp.expect_error(format('select public.record_settlement(%L,%L,%L,20,null,%L,%L,%L)',gid,c,a,'Cash outside the app',idem,'2026-08-30'),'another payment date') from settlement_test_ids;
select pg_temp.expect_error(format('select public.record_settlement(%L,%L,%L,20,null,null,gen_random_uuid(),%L)',gid,c,a,'2999-01-01'),'valid payment date') from settlement_test_ids;
select public.void_settlement(payment,'Test undo') from settlement_test_ids;
select pg_temp.assert_true((select balance=-30 from public.get_group_balances(t.gid) where profile_id=t.c),'void restores debt') from settlement_test_ids t;
select pg_temp.assert_true((public.record_settlement(gid,c,a,20,null,'Cash outside the app',idem,date '2026-08-31')).status='voided','retry does not resurrect voided record') from settlement_test_ids;
select set_config('request.jwt.claim.sub',(select auth_b::text from settlement_test_ids),true);
select pg_temp.expect_error(format('select public.record_settlement(%L,%L,%L,1,null,null,gen_random_uuid(),%L)',gid,c,a,'2026-08-31'),'participant or admin') from settlement_test_ids;
select public.record_settlement(gid,b,a,10,null,null,gen_random_uuid(),date '2026-08-31') from settlement_test_ids;
select pg_temp.assert_true((select balance=-20 from public.get_group_balances(t.gid) where profile_id=t.b),'payer can record completed payment') from settlement_test_ids t;
reset role;
rollback;
