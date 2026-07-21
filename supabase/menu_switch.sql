-- ============================================================
-- 圖文選單「角色切換」所需的使用者狀態表（純新增，安全）
--
-- 記錄每個 LINE 使用者在某 OA（= 某 agent）下目前選到的角色。
-- webhook 找不到此表或查無狀態時，會自動退回該 OA 的預設角色，
-- 所以本檔可安全執行、不影響現有 5 支已上線的 bot。
-- ============================================================

create table if not exists line_user_menu (
  line_user_id text not null,
  agent_id uuid not null references agents(id) on delete cascade,
  role_key text not null,
  updated_at timestamptz not null default now(),
  primary key (line_user_id, agent_id)
);
