begin;
select plan(7);
select ok(
 (preview_match_correction((select m.game_id from positions p join markets m on m.id=p.market_id limit 1))->>'order_count')::integer+
 (preview_match_correction((select m.game_id from positions p join markets m on m.id=p.market_id limit 1))->>'position_count')::integer>0,
 'impact counts dependencies'
);
select throws_ok(
 $$select admin_correct_match(null,(select m.game_id from positions p join markets m on m.id=p.market_id limit 1),'DELETE',1,2,current_date,time'18:00',33,200)$$,
 'P0001','주문 또는 포지션이 있어 삭제/초기가 변경이 차단됩니다','dependencies block delete'
);
insert into games(id,game_date,game_time,home_team_id,away_team_id,game_status)
values(9944,current_date+10,time'18:00',1,2,'SCHEDULED');
select lives_ok($$select admin_correct_match(null,9944,'DELETE',1,2,current_date,time'18:00',33,200)$$,'dependency-free match deletes');
select ok(not exists(select 1 from games where id=9944),'deleted row stays deleted');
insert into games(id,game_date,game_time,home_team_id,away_team_id,game_status)
values(9945,current_date+11,time'18:00',1,2,'SCHEDULED');
insert into markets(game_id,b,status,season_id)values(9945,200,'OPEN',1);
select lives_ok($$select admin_correct_match(null,9945,'RECREATE',2,1,current_date+12,time'19:00',40,300)$$,'empty market recreates atomically');
select is((select b from markets where game_id=9945),300::numeric,'recreate resets b');
select ok(exists(select 1 from admin_audit_logs where action='MATCH_CORRECTION'),'corrections audited');
select * from finish();
rollback;
