# Line 官方通知管理後台

以 **Next.js 14 + Supabase + Line Messaging API** 打造的官方帳號通知後台，內建 3 個通知情境 Agent，部署於 **Zeabur**。

---

## 🤖 三個 Agent（通知情境）

| Agent | 類型 | 觸發 | 說明 |
|---|---|---|---|
| 🧾 訂單交易通知助手 | `transactional` | 外部系統呼叫 `POST /api/notify` | 訂單成立 / 付款 / 出貨 / 到貨，精準推播給指定會員 |
| 💬 智能客服回覆助手 | `customer_service` | 好友傳訊息 → Webhook | 依關鍵字自動回覆，找不到規則回覆預設語 |
| 📢 行銷活動推播助手 | `marketing` | 後台手動發送 | 對全體或分眾標籤群發活動訊息 |

後台頁面：總覽、Agent 管理、群發推播、好友名單、訊息紀錄。

---

## 🗂 專案結構

```
src/
├─ app/
│  ├─ (admin)/            登入後的後台頁面（layout 內含登入守衛）
│  │  ├─ page.tsx         總覽
│  │  ├─ agents/          Agent 管理
│  │  ├─ broadcasts/      群發推播
│  │  ├─ users/           好友名單
│  │  └─ messages/        訊息紀錄
│  ├─ login/              登入頁
│  └─ api/
│     ├─ login, logout    後台登入
│     ├─ agents           啟用/停用 Agent
│     ├─ broadcast        群發推播
│     ├─ notify           交易通知（外部系統呼叫）
│     └─ line/webhook     Line webhook（follow / 訊息自動回覆）
├─ lib/  supabase / line / auth / session / types
└─ components/  Sidebar / AgentToggle / BroadcastComposer
supabase/schema.sql       資料表 + 預設 3 個 Agent
```

---

## 🚀 建置步驟

### 1) Supabase — 建資料表
1. 進 [Supabase Dashboard](https://papunpywpamrkyrgjlor.supabase.co) → **SQL Editor**
2. 貼上 `supabase/schema.sql` 全部內容並執行（會建表並匯入 3 個 Agent）
3. 到 **Project Settings → API** 複製兩把金鑰：
   - `anon public` → 填入 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role`（機密）→ 填入 `SUPABASE_SERVICE_ROLE_KEY`

### 2) 環境變數
複製 `.env.example` 為 `.env.local`，填入上面兩把 Supabase 金鑰。Line 憑證已預填。
**部署前請把 `ADMIN_PASSWORD` 改成強密碼。**

### 3) 本機執行（需先安裝 Node 18+）
```bash
npm install
npm run dev
# 開 http://localhost:3000 → 用 ADMIN_PASSWORD 登入
```

### 4) Line Developers Console 設定
- **Messaging API → Webhook URL**：填 `https://<你的網域>/api/line/webhook`，並開啟「Use webhook」
- **關閉**「自動回覆訊息」與「加入好友的問候語」中你不想要的預設回覆（讓本後台的客服 Agent 接手）
- 好友一加入官方帳號，就會自動出現在「好友名單」

### 5) 推上 GitHub
```bash
git remote add origin https://github.com/ameliaggm2025-coder/Agent.git
git branch -M main
git push -u origin main
```

### 6) 部署到 Zeabur
1. 到 [Zeabur](https://zeabur.com) → 新建專案 → **Deploy from GitHub** → 選 `ameliaggm2025-coder/Agent`
2. Zeabur 會自動辨識為 Next.js 並 build（無需額外設定）
3. 到服務的 **Variables** 分頁，把 `.env.local` 內的所有變數都填進去
4. 綁定網域後，把該網址填回 Line 的 Webhook URL

---

## 📡 交易通知 API（給外部訂單系統）

```bash
curl -X POST https://<你的網域>/api/notify \
  -H "Authorization: Bearer <NOTIFY_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "Uxxxxxxxxxxxxxxxx",
    "event": "shipped",
    "message": "您的訂單 #10231 已出貨 🚚 預計明日送達"
  }'
```
- `to`：Line userId，可傳單一字串或字串陣列
- 回傳 `{ ok, sent, errors }`，並自動寫入「訊息紀錄」

---

## 🔐 安全須知
- `.env.local` 已被 `.gitignore` 排除，**機密不會進 git**。
- Supabase 一律以 `service_role` 在 server 端存取，瀏覽器拿不到金鑰。
- ⚠️ 你的 Line Channel Access Token 曾在對話中貼出，**建議到 Line Developers Console 重新產生一組新 token** 後更新環境變數。
- 後台以密碼 + 簽章 cookie 保護；正式上線請設強密碼。
