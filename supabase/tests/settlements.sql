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

select set_config('request.jwt.claim.sub',(select auth_b::text from settlement_test_ids),true);
update settlement_test_ids set payment=(public.create_settlement(gid,b,a,20,'pending','venmo',null,idem)).id;
update settlement_test_ids set stale_payment=(public.create_settlement(gid,b,a,25,'pending','cash',null,gen_random_uuid())).id;
select pg_temp.assert_true((select balance=-30 from public.get_group_balances(t.gid) where profile_id=t.b),'pending leaves debt unchanged') from settlement_test_ids t;
select pg_temp.assert_true((public.create_settlement(gid,b,a,20,'pending','venmo',null,idem)).id=payment,'idempotent retry returns same payment') from settlement_test_ids;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,21,%L,%L,null,%L)',gid,b,a,'pending','venmo',idem),'already used') from settlement_test_ids;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,20,%L,%L,null,%L)',gid,b,a,'confirmed','venmo',idem),'already used') from settlement_test_ids;
select pg_temp.expect_error(format('select public.confirm_settlement(%L)',payment),'recipient or admin') from settlement_test_ids;
select pg_temp.expect_error(format('insert into public.settlements(group_id,paid_by,paid_to,amount) values(%L,%L,%L,1)',gid,b,a),'permission denied') from settlement_test_ids;
select pg_temp.expect_error(format('update public.settlements set status=%L where id=%L','confirmed',payment),'permission denied') from settlement_test_ids;
select pg_temp.expect_error(format('delete from public.settlements where id=%L',payment),'permission denied') from settlement_test_ids;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,1,%L,%L,null,gen_random_uuid())',gid,c,a,'confirmed','cash'),'participant or admin') from settlement_test_ids;

select set_config('request.jwt.claim.sub',(select auth_out::text from settlement_test_ids),true);
select pg_temp.expect_error(format('select * from public.get_group_balances(%L)',gid),'membership required') from settlement_test_ids;
select pg_temp.expect_error(format('select public.confirm_settlement(%L)',payment),'membership required') from settlement_test_ids;
select pg_temp.assert_true((select count(*)=0 from public.settlements where group_id=t.gid),'outsider RLS hides history') from settlement_test_ids t;

select set_config('request.jwt.claim.sub',(select auth_a::text from settlement_test_ids),true);
select pg_temp.assert_true((public.confirm_settlement(payment)).status='confirmed','recipient confirms') from settlement_test_ids;
select pg_temp.assert_true((public.confirm_settlement(payment)).confirmed_by=a,'confirmation idempotent with actor profile') from settlement_test_ids;
select pg_temp.assert_true((select balance=-10 from public.get_group_balances(t.gid) where profile_id=t.b),'partial confirmed payment updates debt') from settlement_test_ids t;
select pg_temp.expect_error(format('select public.confirm_settlement(%L)',stale_payment),'exceeds') from settlement_test_ids;
select pg_temp.assert_true((public.void_settlement(stale_payment,'Stale amount')).status='voided','cancel stale pending payment') from settlement_test_ids;
select pg_temp.expect_error(format('delete from public.expenses where id=%L',expense),'confirmed payments') from settlement_test_ids;
delete from public.memberships using settlement_test_ids t where memberships.group_id=t.gid and memberships.user_id=t.b;
select pg_temp.assert_true(exists(select 1 from public.memberships where group_id=t.gid and user_id=t.b),'RLS preserves member with split history') from settlement_test_ids t;
reset role;
select pg_temp.expect_error(format('delete from public.memberships where group_id=%L and user_id=%L',gid,b),'Settle this member') from settlement_test_ids;
set local role authenticated;
select pg_temp.assert_true((public.create_settlement(gid,c,a,30,'confirmed','cash','Admin recorded placeholder payment',gen_random_uuid())).confirmed_by=a,'admin can record placeholder settlement') from settlement_test_ids;
select pg_temp.assert_true((public.void_settlement(payment,'Mistake')).voided_by=a,'void is audited') from settlement_test_ids;
select pg_temp.assert_true((select balance=-30 from public.get_group_balances(t.gid) where profile_id=t.b),'void restores debt') from settlement_test_ids t;
select pg_temp.expect_error(format('select public.confirm_settlement(%L)',payment),'pending payments') from settlement_test_ids;

-- Trusted expense updates still validate amounts and preserve historical payments.
set local role service_role;
select pg_temp.assert_true((public.update_expense_with_splits(expense,'Corrected payer',90,current_date,
  jsonb_build_array(jsonb_build_object('user_id',a,'amount',30),jsonb_build_object('user_id',b,'amount',30),jsonb_build_object('user_id',c,'amount',30)),c)).paid_by=c,
  'service update accepts explicit placeholder payer') from settlement_test_ids;
select pg_temp.assert_true((select created_by=t.a from public.expenses where id=t.expense),'payer update retains original creator') from settlement_test_ids t;
select pg_temp.assert_true((select count(*)=1 from public.settlements where group_id=t.gid and paid_by=t.c and paid_to=t.a and status='confirmed' and amount=30),
  'expense edit preserves confirmed settlement') from settlement_test_ids t;
select pg_temp.expect_error(format('select public.update_expense_with_splits(%L,%L,91,current_date,%L::jsonb,%L)',expense,'Invalid edit',
  jsonb_build_array(jsonb_build_object('user_id',a,'amount',30),jsonb_build_object('user_id',b,'amount',30),jsonb_build_object('user_id',c,'amount',30)),a),
  'equal expense total') from settlement_test_ids;
select pg_temp.assert_true((select amount=90 and paid_by=t.c and description='Corrected payer' from public.expenses where id=t.expense),
  'invalid edit leaves expense unchanged') from settlement_test_ids t;
select pg_temp.assert_true((select count(*)=3 and sum(amount)=90 from public.expense_splits where expense_id=t.expense),
  'invalid edit leaves all splits intact') from settlement_test_ids t;
select pg_temp.assert_true((public.update_expense_with_splits(expense,'Corrected payer',90,current_date,
  jsonb_build_array(jsonb_build_object('user_id',a,'amount',30),jsonb_build_object('user_id',b,'amount',30),jsonb_build_object('user_id',c,'amount',30)))).paid_by=c,
  'legacy five-argument update preserves explicit payer') from settlement_test_ids;
-- Flush valid edits, then prove even a privileged single-row split corruption
-- fails at the deferred boundary; expect_error rolls its subtransaction back.
set constraints all immediate;
set constraints all deferred;
select pg_temp.expect_error(format('update public.expense_splits set amount=31 where expense_id=%L and user_id=%L; set constraints all immediate',expense,b),
  'equal expense total') from settlement_test_ids;
select pg_temp.assert_true((select amount=30 from public.expense_splits where expense_id=t.expense and user_id=t.b),
  'deferred validation failure rolls back trusted split mutation') from settlement_test_ids t;
set local role authenticated;
select pg_temp.assert_true((select balance=90 from public.get_group_balances(t.gid) where profile_id=t.c),
  'balance uses changed payer and retains prior settlement credit') from settlement_test_ids t;
select pg_temp.assert_true((select balance=-60 from public.get_group_balances(t.gid) where profile_id=t.a),
  'former payer balance recalculates after correction') from settlement_test_ids t;
select pg_temp.assert_true((select sum(balance)=0 from public.get_group_balances(t.gid)),
  'edited ledger remains zero sum') from settlement_test_ids t;

-- Simulate a pre-migration malformed expense, then verify settlement fails closed.
set constraints all immediate;
reset role;
alter table public.expenses disable trigger validate_expense_total;
insert into public.expenses(group_id,created_by,paid_by,description,amount,date) select gid,a,a,'Legacy missing splits',5,current_date from settlement_test_ids;
alter table public.expenses enable trigger validate_expense_total;
set local role authenticated;
select pg_temp.expect_error(format('select * from public.get_group_balances(%L)',gid),'Correct expense splits before settling') from settlement_test_ids;
select pg_temp.expect_error(format('select public.create_settlement(%L,%L,%L,1,%L,%L,null,gen_random_uuid())',gid,b,a,'confirmed','cash'),'Correct expense splits before settling') from settlement_test_ids;
reset role;
set constraints all immediate;
rollback;
