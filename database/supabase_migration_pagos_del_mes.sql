-- ============================================================
-- Pagos del mes – migration
-- Run this in your Supabase SQL editor
-- ============================================================

-- Config table: savings + salary per quincena (one row per user)
create table if not exists payment_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null unique,
  monthly_income  numeric(12,2) default 0,
  savings_pct     numeric(5,2)  default 0,   -- e.g. 20 = 20%
  fixed_pct       numeric(5,2)  default 0,   -- e.g. 50 = 50%
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table payment_config enable row level security;
create policy "Users manage own payment config"
  on payment_config for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Savings checkboxes: one row per user per quincena slot (q1/q2) per month
create table if not exists payment_savings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  month       text not null,      -- 'YYYY-MM'
  quincena    text not null,      -- 'q1' | 'q2'
  checked     boolean default false,
  created_at  timestamptz default now(),
  unique(user_id, month, quincena)
);

alter table payment_savings enable row level security;
create policy "Users manage own payment savings"
  on payment_savings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Payment items: fixed and variable expenses
create table if not exists payment_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  month         text not null,        -- 'YYYY-MM'
  quincena      text not null,        -- 'q1' | 'q2'
  item_type     text not null,        -- 'fixed' | 'variable'
  concept       text not null default '',
  payment_method text default '',     -- account/credit name or free text
  amount        numeric(12,2) default 0,
  money_location text default 'empty', -- account id, 'paid', or 'empty'
  already_charged boolean default false,
  pay_date      date,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

alter table payment_items enable row level security;
create policy "Users manage own payment items"
  on payment_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


  /*
  Nota: Para que aparezcan los porcentajes de ahorro y presupuesto fijo, necesitas insertar manualmente un registro en payment_config en Supabase con tu ingreso y porcentajes. Puedes hacerlo con:
  insert into payment_config (user_id, monthly_income, savings_pct, fixed_pct)
  values ('0a62d930-fc5a-4f77-a5fc-13f43964bb1b', 1400, 20, 50);
  */