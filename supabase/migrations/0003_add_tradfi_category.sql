insert into categories (slug, name)
values ('tradfi', 'TradFi')
on conflict do nothing;
