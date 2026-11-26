// Shapes of the sign-in contract. The backend owns authentication and authorization rules.

export type Role = 'employee' | 'group_manager' | 'org_admin';

export const ROLES: readonly Role[] = ['employee', 'group_manager', 'org_admin'];

export interface Organisation {
  id: number;
  name: string;
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  organisation: Organisation;
  avatar_url: string | null;
}

export type ReportReason = 'phishing' | 'sensitive_data' | 'malicious_file' | 'policy' | 'other';

export const REPORT_REASONS: readonly ReportReason[] = [
  'phishing',
  'sensitive_data',
  'malicious_file',
  'policy',
  'other',
];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  phishing: 'Possible phishing (suspicious link or email)',
  sensitive_data: 'Sensitive data request or leakage',
  malicious_file: 'Malicious attachment or file',
  policy: 'Policy violation',
  other: 'Other',
};

/** The message a user reports, as the report screen shows it. */
export interface ReportableMessage {
  id: number;
  conversation_name: string;
  author_name: string;
  body: string;
  created_at: string;
  /** Domain of an external address found in the message, or null. */
  detected_domain: string | null;
}

export interface ReportInput {
  messageId: number;
  reason: ReportReason;
  details: string;
}

export interface MessageReport {
  id: number;
  message_id: number;
  conversation_name: string;
  reporter_username: string;
  reason: string;
  message_body: string;
  created_at: string;
}

export interface AuditEvent {
  id: number;
  event_type: string;
  actor_username: string | null;
  timestamp: string;
  source_ip: string;
  details: string;
}

export const CHAT_MESSAGE_MAX_LENGTH = 500;

export interface ChatConversation {
  id: number;
  kind: 'direct' | 'group';
  name: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  author_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
}

export interface WhatsUpApi {
  auth: {
    me(): Promise<User>;
    login(username: string, password: string): Promise<User>;
    logout(): Promise<void>;
  };
  chats: {
    listConversations(): Promise<ChatConversation[]>;
    listMessages(conversationId: number): Promise<ChatMessage[]>;
    send(conversationId: number, body: string): Promise<ChatMessage>;
  };
  reports: {
    reportable(messageId: number): Promise<ReportableMessage>;
    submit(input: ReportInput): Promise<void>;
  };
  admin: {
    listReports(): Promise<MessageReport[]>;
    listAuditEvents(): Promise<AuditEvent[]>;
  };
}
