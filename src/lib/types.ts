export type AgentType = 'transactional' | 'customer_service' | 'marketing';

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  description: string | null;
  avatar: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LineUser {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: 'active' | 'blocked';
  tags: string[];
  followed_at: string;
  updated_at: string;
}

export interface AutoReply {
  id: string;
  agent_id: string;
  keyword: string;
  reply_text: string;
  enabled: boolean;
  priority: number;
  created_at: string;
}

export interface Broadcast {
  id: string;
  agent_id: string | null;
  title: string;
  message: LineMessage[];
  audience: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  scheduled_at: string | null;
  sent_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface MessageLog {
  id: string;
  agent_id: string | null;
  line_user_id: string | null;
  direction: 'inbound' | 'outbound';
  channel: string;
  message_type: string | null;
  content: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

/** 最常用的 Line 文字訊息物件；也可放其他 Line message 型別 */
export interface LineTextMessage {
  type: 'text';
  text: string;
}
export type LineMessage = LineTextMessage | Record<string, unknown>;
