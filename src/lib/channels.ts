import { supabaseAdmin } from './supabase';
import { getBotInfo } from './line';
import type { Agent } from './types';

/**
 * 把某公司角色（以 role_code 對應）接上一支 LINE OA。
 * 會用 access token 呼叫 /v2/bot/info 取得 destination(bot userId) 並寫入 config，
 * 讓多租戶 webhook 能依 destination 路由到這個角色。成功後 enabled=true 上線。
 */
export interface ConnectInput {
  roleCode: string;
  secret: string;
  token: string;
  channelId?: string | null;
}

export interface ConnectResult {
  ok: boolean;
  status: number;
  error?: string;
  company?: string | null;
  role_code?: string;
  destination?: string;
  bot?: string | null;
}

export async function connectChannel(input: ConnectInput): Promise<ConnectResult> {
  const roleCode = input.roleCode?.trim();
  const secret = input.secret?.trim();
  const token = input.token?.trim();
  if (!roleCode || !secret || !token) {
    return {
      ok: false,
      status: 400,
      error: 'role_code、channel_secret、channel_access_token 為必填',
    };
  }

  // 用 access token 取得該 OA 的 bot userId（= webhook 的 destination）
  const info = await getBotInfo(token);
  if (!info?.userId) {
    return {
      ok: false,
      status: 400,
      error: '無法用該 access token 取得 bot 資訊，請確認 token 是否正確、是否為 long-lived。',
    };
  }

  const sb = supabaseAdmin();
  const { data: found } = await sb
    .from('agents')
    .select('*')
    .eq('config->>role_code', roleCode)
    .limit(1);
  const agent = found?.[0] as Agent | undefined;
  if (!agent) {
    return { ok: false, status: 404, error: `找不到 role_code=${roleCode} 的角色` };
  }

  // 同一支 OA（相同 destination）不可同時綁到不同角色，避免 webhook 路由衝突
  const { data: clash } = await sb
    .from('agents')
    .select('id,name,config')
    .eq('config->>line_destination', info.userId)
    .neq('id', agent.id)
    .limit(1);
  const other = clash?.[0] as Agent | undefined;
  if (other) {
    return {
      ok: false,
      status: 409,
      error: `這支 LINE 官方帳號已綁定角色「${other.name}」，請先在該角色解除連線再重綁。`,
    };
  }

  const newConfig = {
    ...(agent.config as Record<string, unknown>),
    line_channel_id: input.channelId ?? null,
    line_channel_secret: secret,
    line_channel_access_token: token,
    line_destination: info.userId,
  };

  const { error } = await sb
    .from('agents')
    .update({ config: newConfig, enabled: true })
    .eq('id', agent.id);
  if (error) return { ok: false, status: 500, error: error.message };

  return {
    ok: true,
    status: 200,
    company: (agent.config as { company?: string }).company ?? null,
    role_code: roleCode,
    destination: info.userId,
    bot: info.basicId ?? info.displayName ?? null,
  };
}

/** 解除某角色的 LINE 連線：清掉金鑰與 destination 並停用。 */
export async function disconnectChannel(
  roleCode: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const rc = roleCode?.trim();
  if (!rc) return { ok: false, status: 400, error: 'role_code 為必填' };

  const sb = supabaseAdmin();
  const { data: found } = await sb
    .from('agents')
    .select('*')
    .eq('config->>role_code', rc)
    .limit(1);
  const agent = found?.[0] as Agent | undefined;
  if (!agent) return { ok: false, status: 404, error: `找不到 role_code=${rc} 的角色` };

  const cfg = { ...(agent.config as Record<string, unknown>) };
  delete cfg.line_channel_id;
  delete cfg.line_channel_secret;
  delete cfg.line_channel_access_token;
  delete cfg.line_destination;

  const { error } = await sb
    .from('agents')
    .update({ config: cfg, enabled: false })
    .eq('id', agent.id);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, status: 200 };
}
