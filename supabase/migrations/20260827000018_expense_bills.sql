-- Recurring / one-shot bill templates for operating expenses. Ledger stays
-- on public.expenses; Mark paid (API) inserts a row there. Reminders are
-- Laravel-scheduled — this table is the schedule source of truth.

create table public.expense_bills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  description text not null
    check (length(trim(description)) > 0 and length(description) <= 200),
  amount numeric(12, 2) not null check (amount > 0),
  category text check (category is null or length(category) <= 80),
  note text check (note is null or length(note) <= 500),
  frequency text not null
    check (frequency in ('once', 'weekly', 'monthly', 'yearly')),
  next_due_date date not null,
  remind_days_before smallint not null default 0
    check (remind_days_before >= 0 and remind_days_before <= 90),
  reminders_enabled boolean not null default true,
  last_reminded_on date,
  active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expense_bills_company_due_idx
  on public.expense_bills (company_id, active, next_due_date);
create index expense_bills_due_idx on public.expense_bills (next_due_date);

create trigger expense_bills_touch_updated_at
  before update on public.expense_bills
  for each row execute function public.touch_updated_at();

alter table public.expense_bills enable row level security;

create policy expense_bills_select on public.expense_bills
  for select to authenticated
  using (public.is_admin() and public.shop_readable(company_id));
create policy expense_bills_insert on public.expense_bills
  for insert to authenticated
  with check (public.is_admin() and public.shop_writable(company_id));
create policy expense_bills_update on public.expense_bills
  for update to authenticated
  using (public.is_admin() and public.shop_readable(company_id))
  with check (public.is_admin() and public.shop_writable(company_id));
create policy expense_bills_delete on public.expense_bills
  for delete to authenticated
  using (public.is_admin() and public.shop_writable(company_id));

alter table public.expenses
  add column if not exists expense_bill_id uuid
    references public.expense_bills (id) on delete set null;
