-- =============================================================================
-- VELORA FASHION - DATABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- Target Engine: PostgreSQL / Supabase
-- =============================================================================

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null default '',
  email text not null,
  phone text default '',
  avatar_url text default '',
  email_notifications boolean default true,
  promo_notifications boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for profiles
create index if not exists profiles_email_idx on public.profiles(email);

-- -----------------------------------------------------------------------------
-- 2. USER ADDRESSES TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.addresses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  recipient_name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text default '',
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'United States',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for addresses
create index if not exists addresses_user_id_idx on public.addresses(user_id);

-- -----------------------------------------------------------------------------
-- 3. ORDERS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text unique not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'Confirmed' 
    check (status in ('Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled')),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  shipping_fee numeric(10,2) not null default 0 check (shipping_fee >= 0),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  shipping_address jsonb not null,
  payment_method text not null default 'Credit / Debit Card',
  payment_status text not null default 'Paid'
    check (payment_status in ('Pending', 'Paid', 'Authorized', 'Failed', 'Refunded', 'Pay on Delivery')),
  transaction_ref text,
  tracking_number text,
  tracking_carrier text default 'FedEx Luxury Express',
  tracking_link text,
  estimated_delivery date,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for orders
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_order_number_idx on public.orders(order_number);
create index if not exists orders_status_idx on public.orders(status);

-- -----------------------------------------------------------------------------
-- 4. ORDER ITEMS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade not null,
  product_id text not null,
  product_name text not null,
  product_image text not null,
  subcategory text default '',
  size text default '',
  color text default '',
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  total_price numeric(10,2) not null check (total_price >= 0),
  created_at timestamptz not null default now()
);

-- Index for order items
create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- -----------------------------------------------------------------------------
-- 5. WISHLIST ITEMS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.wishlist_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  product_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists wishlist_user_id_idx on public.wishlist_items(user_id);

-- -----------------------------------------------------------------------------
-- 6. CART ITEMS TABLE (Server-side cart sync across devices)
-- -----------------------------------------------------------------------------
create table if not exists public.cart_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  line_key text not null,
  product_id text not null,
  size text default '',
  color text default '',
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, line_key)
);

create index if not exists cart_items_user_id_idx on public.cart_items(user_id);

-- -----------------------------------------------------------------------------
-- 7. DATABASE TRIGGERS & FUNCTIONS
-- -----------------------------------------------------------------------------

-- A. Auto-create user profile row upon Supabase Auth registration
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do update
  set 
    full_name = excluded.full_name,
    email = excluded.email,
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

-- Trigger to hook into auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- B. Auto-update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_addresses_updated_at on public.addresses;
create trigger set_addresses_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists set_cart_items_updated_at on public.cart_items;
create trigger set_cart_items_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- C. Enforce only one default address per user
create or replace function public.handle_default_address()
returns trigger
language plpgsql
as $$
begin
  if new.is_default = true then
    update public.addresses
    set is_default = false
    where user_id = new.user_id and id != new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_default_address on public.addresses;
create trigger enforce_single_default_address
  before insert or update of is_default on public.addresses
  for each row
  when (new.is_default = true)
  execute function public.handle_default_address();

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.cart_items enable row level security;

-- PROFILES Policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ADDRESSES Policies
create policy "Users can view their own addresses"
  on public.addresses for select
  using (auth.uid() = user_id);

create policy "Users can insert their own addresses"
  on public.addresses for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own addresses"
  on public.addresses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own addresses"
  on public.addresses for delete
  using (auth.uid() = user_id);

-- ORDERS Policies
create policy "Users can view their own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Users can insert their own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

create policy "Users can update eligible fields of their own orders"
  on public.orders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ORDER ITEMS Policies
create policy "Users can view their own order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
    )
  );

create policy "Users can insert order items for their own orders"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
    )
  );

-- WISHLIST Policies
create policy "Users can view their own wishlist"
  on public.wishlist_items for select
  using (auth.uid() = user_id);

create policy "Users can add to their own wishlist"
  on public.wishlist_items for insert
  with check (auth.uid() = user_id);

create policy "Users can remove from their own wishlist"
  on public.wishlist_items for delete
  using (auth.uid() = user_id);

-- CART ITEMS Policies
create policy "Users can view their own cart"
  on public.cart_items for select
  using (auth.uid() = user_id);

create policy "Users can insert into their own cart"
  on public.cart_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cart"
  on public.cart_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove from their own cart"
  on public.cart_items for delete
  using (auth.uid() = user_id);
