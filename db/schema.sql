-- Bazaar AI database schema (PostgreSQL: works on Supabase and on embedded PGlite).
-- Safe to run more than once.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  name text,
  created_at timestamptz default now()
);

create table if not exists sellers (
  id serial primary key,
  name text not null,
  paypal_email text not null,
  commission_rate numeric(5,4) default 0.10
);

create table if not exists products (
  id integer primary key,
  title text not null,
  description text,
  category text,
  brand text,
  price numeric(10,2) not null,
  rating numeric(3,2),
  stock integer default 0,
  thumbnail text,
  images jsonb,
  tags text[],
  seller_id integer references sellers(id)
);

create table if not exists reviews (
  id serial primary key,
  product_id integer references products(id),
  rating integer,
  comment text,
  reviewer_name text,
  created_at timestamptz
);
create index if not exists reviews_product_idx on reviews(product_id);

create table if not exists mandates (
  user_id uuid primary key references users(id),
  per_order_limit numeric(10,2) default 20,
  monthly_limit numeric(10,2) default 50,
  auto_buy_enabled boolean default true,
  paypal_vault_id text,
  paypal_customer_id text,
  paypal_email text,
  pending_setup_token text,
  updated_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  product_id integer references products(id),
  amount numeric(10,2) not null,
  platform_fee numeric(10,2) not null,
  seller_amount numeric(10,2) not null,
  -- PROCESSING | AWAITING_APPROVAL | PAID | REFUNDED | PAID_OUT | CANCELLED | FAILED
  status text not null,
  rule_triggered text,
  agent_reason text,
  request_budget numeric(10,2),
  paypal_order_id text,
  paypal_capture_id text,
  payout_batch_id text,
  payout_item_id text,
  refund_id text,
  tracking_number text,
  undo_until timestamptz,
  error text,
  created_at timestamptz default now()
);
create index if not exists orders_user_idx on orders(user_id);

create table if not exists events (
  id serial primary key,
  order_id uuid,
  type text,
  source text,
  payload jsonb,
  created_at timestamptz default now()
);

-- Security: Supabase exposes tables through a public data API. Turning on row level security with no
-- policies blocks that API completely. The app connects directly as the database owner, which bypasses it.
alter table users enable row level security;
alter table sellers enable row level security;
alter table products enable row level security;
alter table reviews enable row level security;
alter table mandates enable row level security;
alter table orders enable row level security;
alter table events enable row level security;
