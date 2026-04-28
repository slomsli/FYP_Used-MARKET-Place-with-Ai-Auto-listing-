begin;

with duplicate_daily_views as (
  select
    listing_id,
    view_date,
    sum(views_count)::integer as merged_views_count,
    min(created_at) as merged_created_at,
    max(updated_at) as merged_updated_at
  from public.listing_daily_views
  group by listing_id, view_date
  having count(*) > 1
),
deleted_rows as (
  delete from public.listing_daily_views ldv
  using duplicate_daily_views dup
  where ldv.listing_id = dup.listing_id
    and ldv.view_date = dup.view_date
  returning
    dup.listing_id,
    dup.view_date,
    dup.merged_views_count,
    dup.merged_created_at,
    dup.merged_updated_at
)
insert into public.listing_daily_views (
  listing_id,
  view_date,
  views_count,
  created_at,
  updated_at
)
select distinct on (listing_id, view_date)
  listing_id,
  view_date,
  merged_views_count,
  merged_created_at,
  merged_updated_at
from deleted_rows
order by listing_id, view_date;

create unique index if not exists listing_daily_views_listing_id_view_date_uidx
  on public.listing_daily_views (listing_id, view_date);

create or replace function public.increment_listing_view_counters_atomic(p_listing_id uuid)
returns table (
  listing_id uuid,
  views_count integer
)
language sql
security definer
set search_path = public
as $$
  with updated_listing as (
    update public.listings
    set
      views_count = views_count + 1,
      updated_at = now()
    where id = p_listing_id
      and deleted_at is null
      and status in ('active', 'reserved', 'sold')
    returning id, views_count
  ),
  upsert_daily as (
    insert into public.listing_daily_views (
      listing_id,
      view_date,
      views_count,
      created_at,
      updated_at
    )
    select
      id,
      current_date,
      1,
      now(),
      now()
    from updated_listing
    on conflict (listing_id, view_date)
    do update
      set
        views_count = public.listing_daily_views.views_count + 1,
        updated_at = now()
    returning listing_daily_views.listing_id
  )
  select
    updated_listing.id,
    updated_listing.views_count
  from updated_listing
  left join upsert_daily on upsert_daily.listing_id = updated_listing.id;
$$;

create or replace function public.get_listing_engagement_counts(p_listing_ids uuid[])
returns table (
  listing_id uuid,
  favorite_count integer,
  total_offer_count integer,
  pending_offer_count integer
)
language sql
security definer
set search_path = public
as $$
  with requested_listing_ids as (
    select distinct unnest(coalesce(p_listing_ids, '{}'::uuid[])) as listing_id
  ),
  favorite_counts as (
    select
      listing_id,
      count(*)::integer as favorite_count
    from public.favorites
    where listing_id = any(coalesce(p_listing_ids, '{}'::uuid[]))
    group by listing_id
  ),
  offer_counts as (
    select
      listing_id,
      count(*)::integer as total_offer_count,
      count(*) filter (where status = 'pending')::integer as pending_offer_count
    from public.offers
    where listing_id = any(coalesce(p_listing_ids, '{}'::uuid[]))
    group by listing_id
  )
  select
    requested_listing_ids.listing_id,
    coalesce(favorite_counts.favorite_count, 0) as favorite_count,
    coalesce(offer_counts.total_offer_count, 0) as total_offer_count,
    coalesce(offer_counts.pending_offer_count, 0) as pending_offer_count
  from requested_listing_ids
  left join favorite_counts using (listing_id)
  left join offer_counts using (listing_id);
$$;

create or replace function public.get_public_listing_lookups()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with active_listings as (
    select
      category_id,
      state_id,
      condition,
      price
    from public.listings
    where status = 'active'
      and deleted_at is null
  ),
  category_counts as (
    select
      categories.id,
      categories.name,
      categories.slug,
      count(*)::integer as count
    from active_listings
    join public.categories on categories.id = active_listings.category_id
    group by categories.id, categories.name, categories.slug
  ),
  state_counts as (
    select
      states.id,
      states.name,
      states.slug,
      count(*)::integer as count
    from active_listings
    join public.states on states.id = active_listings.state_id
    group by states.id, states.name, states.slug
  ),
  condition_counts as (
    select
      condition,
      count(*)::integer as count
    from active_listings
    group by condition
  ),
  price_summary as (
    select
      coalesce(min(price), 0) as min_price,
      coalesce(max(price), 0) as max_price
    from active_listings
  )
  select jsonb_build_object(
    'categories',
    coalesce(
      (
        select jsonb_agg(to_jsonb(category_counts) order by category_counts.name)
        from category_counts
      ),
      '[]'::jsonb
    ),
    'states',
    coalesce(
      (
        select jsonb_agg(to_jsonb(state_counts) order by state_counts.name)
        from state_counts
      ),
      '[]'::jsonb
    ),
    'conditions',
    coalesce(
      (
        select jsonb_object_agg(condition_counts.condition, condition_counts.count)
        from condition_counts
      ),
      '{}'::jsonb
    ),
    'priceRange',
    (
      select jsonb_build_object(
        'min', price_summary.min_price,
        'max', price_summary.max_pricel
      )
      from price_summary
    )
  );
$$;

commit;
