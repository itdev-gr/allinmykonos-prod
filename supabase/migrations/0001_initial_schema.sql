-- One Mykonos — initial schema
-- Multi-vendor marketplace: customers, businesses (vendors), admin.

-- ============================================================
-- Enums
-- ============================================================
create type public.user_role as enum ('customer', 'business', 'admin');
create type public.business_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.pricing_type as enum ('fixed', 'per_hour', 'per_day', 'per_person');
create type public.booking_mode as enum ('instant', 'request');
create type public.booking_status as enum ('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show');
create type public.payment_status as enum ('unpaid', 'paid', 'refunded', 'failed');
create type public.payout_status as enum ('pending', 'paid');

-- ============================================================
-- Tables
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role public.user_role not null default 'customer',
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_el text,
  icon text,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  name text not null,
  slug text not null unique,
  description text,
  description_el text,
  location_area text,
  address text,
  lat double precision,
  lng double precision,
  phone text,
  email text,
  website text,
  instagram text,
  logo_url text,
  cover_url text,
  gallery jsonb not null default '[]'::jsonb,
  opening_hours jsonb,
  status public.business_status not null default 'pending',
  verified boolean not null default false,
  featured boolean not null default false,
  commission_pct numeric(5,2), -- null = platform default
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_category_idx on public.businesses (category_id);
create index businesses_status_idx on public.businesses (status);
create index businesses_owner_idx on public.businesses (owner_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  title_el text,
  description text,
  description_el text,
  pricing_type public.pricing_type not null default 'fixed',
  base_price numeric(10,2) not null,
  currency text not null default 'EUR',
  duration_minutes int,
  min_guests int not null default 1,
  max_guests int,
  images jsonb not null default '[]'::jsonb,
  booking_mode public.booking_mode not null default 'instant',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_business_idx on public.services (business_id);

create table public.service_pricing_seasons (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  price numeric(10,2) not null,
  check (end_date >= start_date)
);
create index pricing_seasons_service_idx on public.service_pricing_seasons (service_id);

-- Availability: per service per day (optionally per time slot).
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid references public.services (id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  capacity int not null default 1,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);
create index availability_lookup_idx on public.availability (service_id, date);
create index availability_business_idx on public.availability (business_id, date);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  user_id uuid not null references public.profiles (id),
  business_id uuid not null references public.businesses (id),
  service_id uuid not null references public.services (id),
  booking_date date not null,
  start_time time,
  guests int not null default 1,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  commission_pct numeric(5,2) not null,
  commission_amount numeric(10,2) not null,
  currency text not null default 'EUR',
  status public.booking_status not null default 'pending',
  special_requests text,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  business_notes text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_user_idx on public.bookings (user_id);
create index bookings_business_idx on public.bookings (business_id, booking_date);
create index bookings_status_idx on public.bookings (status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  stripe_session_id text,
  stripe_payment_intent text,
  amount numeric(10,2) not null,
  commission_amount numeric(10,2) not null,
  currency text not null default 'EUR',
  status public.payment_status not null default 'unpaid',
  payout_status public.payout_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  business_id uuid not null references public.businesses (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  business_reply text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index reviews_business_idx on public.reviews (business_id);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-create a profile row on signup; role can be passed in signup metadata
-- but only 'customer' or 'business' is accepted (never 'admin').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'customer');
begin
  if requested_role not in ('customer', 'business') then
    requested_role := 'customer';
  end if;
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    requested_role::public.user_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS helper functions
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.owns_business(b_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.businesses where id = b_id and owner_id = auth.uid()
  );
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.service_pricing_seasons enable row level security;
alter table public.availability enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.platform_settings enable row level security;

-- profiles
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy "profiles: admin update" on public.profiles
  for update using (public.is_admin());

-- categories: public read, admin write
create policy "categories: public read" on public.categories
  for select using (active or public.is_admin());
create policy "categories: admin write" on public.categories
  for all using (public.is_admin());

-- businesses: public sees approved; owner and admin see their own always
create policy "businesses: public read approved" on public.businesses
  for select using (status = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy "businesses: owner insert" on public.businesses
  for insert with check (owner_id = auth.uid());
create policy "businesses: owner update" on public.businesses
  for update using (owner_id = auth.uid() or public.is_admin());
create policy "businesses: admin delete" on public.businesses
  for delete using (public.is_admin());

-- services: visible when active + business approved; owner/admin always
create policy "services: public read" on public.services
  for select using (
    (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'approved'))
    or public.owns_business(business_id)
    or public.is_admin()
  );
create policy "services: owner write" on public.services
  for all using (public.owns_business(business_id) or public.is_admin())
  with check (public.owns_business(business_id) or public.is_admin());

-- pricing seasons: follow the parent service's visibility/ownership
create policy "seasons: public read" on public.service_pricing_seasons
  for select using (
    exists (select 1 from public.services s where s.id = service_id)
  );
create policy "seasons: owner write" on public.service_pricing_seasons
  for all using (
    exists (
      select 1 from public.services s
      where s.id = service_id and (public.owns_business(s.business_id) or public.is_admin())
    )
  );

-- availability: public read (needed for the booking calendar), owner/admin write
create policy "availability: public read" on public.availability
  for select using (true);
create policy "availability: owner write" on public.availability
  for all using (public.owns_business(business_id) or public.is_admin())
  with check (public.owns_business(business_id) or public.is_admin());

-- bookings: customer sees own, business owner sees theirs, admin all
create policy "bookings: read involved" on public.bookings
  for select using (
    user_id = auth.uid() or public.owns_business(business_id) or public.is_admin()
  );
create policy "bookings: customer insert" on public.bookings
  for insert with check (user_id = auth.uid());
create policy "bookings: involved update" on public.bookings
  for update using (
    user_id = auth.uid() or public.owns_business(business_id) or public.is_admin()
  );

-- payments: read-only for involved parties; writes happen via service role only
create policy "payments: read involved" on public.payments
  for select using (
    exists (
      select 1 from public.bookings bk
      where bk.id = booking_id
        and (bk.user_id = auth.uid() or public.owns_business(bk.business_id) or public.is_admin())
    )
  );

-- reviews
create policy "reviews: public read" on public.reviews
  for select using (is_published or user_id = auth.uid() or public.owns_business(business_id) or public.is_admin());
create policy "reviews: author insert" on public.reviews
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings bk
      where bk.id = booking_id and bk.user_id = auth.uid() and bk.status = 'completed'
    )
  );
create policy "reviews: author update" on public.reviews
  for update using (user_id = auth.uid());
create policy "reviews: business reply" on public.reviews
  for update using (public.owns_business(business_id));
create policy "reviews: admin all" on public.reviews
  for all using (public.is_admin());

-- platform settings: admin only (service role bypasses RLS for server reads)
create policy "settings: admin all" on public.platform_settings
  for all using (public.is_admin());

-- ============================================================
-- Storage: public bucket for business media
-- ============================================================
insert into storage.buckets (id, name, public)
values ('business-media', 'business-media', true)
on conflict (id) do nothing;

create policy "media: public read" on storage.objects
  for select using (bucket_id = 'business-media');
create policy "media: authenticated upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'business-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "media: owner manage" on storage.objects
  for update using (bucket_id = 'business-media' and owner = auth.uid());
create policy "media: owner delete" on storage.objects
  for delete using (bucket_id = 'business-media' and owner = auth.uid());

-- ============================================================
-- Seed data
-- ============================================================

insert into public.categories (slug, name, name_el, icon, sort_order) values
  ('transport',      'Travel & Transport',    'Μεταφορές',              'car',      1),
  ('accommodation',  'Accommodation',         'Διαμονή',                'villa',    2),
  ('concierge',      'Concierge',             'Concierge',              'bell',     3),
  ('dining',         'Food & Dining',         'Φαγητό',                 'dining',   4),
  ('nightlife',      'Nightlife',             'Νυχτερινή ζωή',          'music',    5),
  ('experiences',    'Beaches & Experiences', 'Παραλίες & Εμπειρίες',   'beach',    6),
  ('wellness',       'Wellness & Beauty',     'Ευεξία & Ομορφιά',       'spa',      7),
  ('shopping',       'Shopping',              'Αγορές',                 'bag',      8),
  ('local-services', 'Local Services',        'Τοπικές Υπηρεσίες',      'services', 9),
  ('events',         'Events',                'Εκδηλώσεις',             'party',    10);

insert into public.platform_settings (key, value) values
  ('default_commission_pct', '15'::jsonb),
  ('currency', '"EUR"'::jsonb);
