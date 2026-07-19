-- ============================================================
-- Line 官方通知管理後台 — Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 貼上並執行
-- ============================================================

-- 需要 gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------- Agents（後台系統內的 AI 機器人角色）----------
create table if not exists agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('transactional','customer_service','marketing')),
  description text,
  avatar      text,                          -- emoji 或圖片 URL
  enabled     boolean not null default true,
  config      jsonb not null default '{}',   -- 各 agent 的專屬設定
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Line 好友（由 webhook follow 事件寫入）----------
create table if not exists line_users (
  id            uuid primary key default gen_random_uuid(),
  line_user_id  text not null unique,         -- Line 的 userId
  display_name  text,
  picture_url   text,
  status        text not null default 'active' check (status in ('active','blocked')),
  tags          text[] not null default '{}', -- 分眾標籤
  followed_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- 訊息模板 ----------
create table if not exists templates (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid references agents(id) on delete set null,
  name        text not null,
  content     jsonb not null,                 -- Line message objects 陣列
  created_at  timestamptz not null default now()
);

-- ---------- 自動回覆規則（客服 agent 用）----------
create table if not exists auto_replies (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid references agents(id) on delete cascade,
  keyword     text not null,                  -- 觸發關鍵字（比對 contains）
  reply_text  text not null,
  enabled     boolean not null default true,
  priority    int not null default 0,         -- 數字大者先比對
  created_at  timestamptz not null default now()
);

-- ---------- 群發活動（行銷 agent 用）----------
create table if not exists broadcasts (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references agents(id) on delete set null,
  title         text not null,
  message       jsonb not null,               -- Line message objects 陣列
  audience      text not null default 'all',  -- 'all' 或標籤名
  status        text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  scheduled_at  timestamptz,
  sent_count    int not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

-- ---------- 訊息紀錄（進出站都記）----------
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references agents(id) on delete set null,
  line_user_id  text,
  direction     text not null check (direction in ('inbound','outbound')),
  channel       text not null default 'line',
  message_type  text,                         -- push / multicast / reply / broadcast / receive
  content       text,
  status        text not null default 'sent', -- sent / failed / received
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_messages_created  on messages(created_at desc);
create index if not exists idx_messages_user      on messages(line_user_id);
create index if not exists idx_broadcasts_status  on broadcasts(status);

-- ---------- 觸發 updated_at 自動更新 ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agents_updated on agents;
create trigger trg_agents_updated before update on agents
  for each row execute function set_updated_at();

drop trigger if exists trg_line_users_updated on line_users;
create trigger trg_line_users_updated before update on line_users
  for each row execute function set_updated_at();

-- ============================================================
-- RLS：全部開啟，且不建立 public policy。
-- 後台一律以 service_role key 從 server 端存取（會繞過 RLS），
-- 瀏覽器端 anon key 無法直接讀寫，確保資料安全。
-- ============================================================
alter table agents       enable row level security;
alter table line_users   enable row level security;
alter table templates    enable row level security;
alter table auto_replies enable row level security;
alter table broadcasts   enable row level security;
alter table messages     enable row level security;

-- ============================================================
-- 預設 3 個 Agent（場景）
-- ============================================================
insert into agents (name, type, description, avatar, enabled, config) values
(
  '訂單交易通知助手', 'transactional',
  '訂單成立、付款完成、出貨、到貨等交易事件，精準推播給指定會員。由外部系統呼叫 API 觸發。',
  '🧾', true,
  '{"events":["order_created","payment_paid","shipped","delivered"],"trigger":"api"}'
),
(
  '智能客服回覆助手', 'customer_service',
  '用戶在 Line 傳訊息時，依關鍵字自動回覆常見問題；無法處理時提示轉真人客服。',
  '💬', true,
  '{"fallback_reply":"感謝您的訊息，客服人員將盡快為您服務 🙏","office_hours":"09:00-18:00"}'
),
(
  '行銷活動推播助手', 'marketing',
  '活動、優惠、新品上市等訊息群發推播，可對全體好友或指定分眾標籤發送。',
  '📢', true,
  '{"trigger":"manual_or_scheduled","default_audience":"all"}'
)
on conflict do nothing;

-- 客服 agent 的範例自動回覆規則
insert into auto_replies (agent_id, keyword, reply_text, priority)
select id, '營業時間', '我們的營業時間為週一至週五 09:00–18:00 🕘', 10 from agents where type='customer_service'
union all
select id, '運費', '單筆訂單滿 $1000 免運費，未滿酌收 $80 運費 📦', 10 from agents where type='customer_service'
union all
select id, '退貨', '商品到貨 7 天內可申請退貨，請至會員中心操作或聯繫客服 🔁', 10 from agents where type='customer_service'
on conflict do nothing;
