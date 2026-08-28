create or replace function record_project_click(p_target_project_id uuid, p_ip_hash text, p_user_agent text)
returns table (url text)
language plpgsql
security definer
as $$
declare
  target_url text;
  target_rank integer;
  click_increment integer;
begin
  select ranked.url, ranked.rank_position
  into target_url, target_rank
  from (
    select
      projects.id,
      projects.url,
      row_number() over (
        order by projects.total_bid_usdt desc, projects.ranking_timestamp asc
      )::integer as rank_position
    from projects
    where projects.status = 'active'
  ) ranked
  where ranked.id = p_target_project_id;

  if target_url is null then
    return;
  end if;

  click_increment := case
    when target_rank <= 3 then 15
    when target_rank <= 10 then 10
    when target_rank <= 20 then 5
    else 3
  end;

  insert into click_events (project_id, ip_hash, user_agent)
  values (p_target_project_id, p_ip_hash, left(coalesce(p_user_agent, ''), 500));

  update projects
  set click_count = click_count + click_increment::bigint,
      updated_at = now()
  where id = p_target_project_id;

  return query select target_url;
end;
$$;
