-- ============================================================
-- 私人小助理（行事曆）種子：建立一個 personal_assistant 角色，
-- 綁定一支「只有妳自己用」的 LINE OA，把丟進來的行程寫進個人 Google 日曆。
--
-- ✅ 安全：只「新增」一列 agents，不動任何現有 5 支已上線 bot。
-- ✅ 可重跑：用 role_code='ASSISTANT' 判斷是否已存在，重跑不會重複新增。
-- ⚠️ 第一段會放寬 agents.type 的 CHECK 限制（多允許 personal_assistant），
--    這是必要的，否則新型別會被資料庫擋下。不影響現有資料。
--
-- 執行後：到 Line Developers 開好新 OA，取得 channel secret / access token，
-- 再呼叫 POST /api/channels/register（role_code=ASSISTANT）即可綁定上線。
-- ============================================================

-- ---------- 1) 放寬 type 允許值（加入 personal_assistant）----------
alter table agents drop constraint if exists agents_type_check;
alter table agents add constraint agents_type_check
  check (type in ('transactional','customer_service','marketing','personal_assistant'));

-- ---------- 2) 新增小助理角色（尚未綁 OA，enabled=false 待命）----------
insert into agents (name, type, description, avatar, enabled, config)
select
  '私人行事曆小助理',
  'personal_assistant',
  '把各公司行程彙整寫進 Amelia 的個人 Google 日曆，依公司配色。',
  '🗓️',
  false,
  jsonb_build_object(
    'role_code', 'ASSISTANT',
    'company', '私人小助理'
    -- 之後若要鎖定只服務本人，可再加 'owner_user_id','<妳的 LINE userId>'
  )
where not exists (
  select 1 from agents where config->>'role_code' = 'ASSISTANT'
);

-- ---------- 確認 ----------
select id, name, type, enabled, config->>'role_code' as role_code
from agents where config->>'role_code' = 'ASSISTANT';
