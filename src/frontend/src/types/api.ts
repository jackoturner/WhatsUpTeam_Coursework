// Shapes of the sign-in contract. The backend owns authentication and authorization rules.

export type Role = 'employee' | 'group_manager' | 'org_admin';

export const ROLES: readonly Role[] = ['employee', 'group_manager', 'org_admin'];

export interface Organisation {
  id: number;
  name: string;
}

export interface MessageAttachment {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  is_confidential: boolean;
  created_at: string;
  can_download: boolean;
  preview_url: string;
  download_url: string | null;
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
  review_status: 'open' | 'in_review' | 'resolved';
  reviewed_by_username: string | null;
  reviewed_at: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface AuditEvent {
  id: number;
  event_type: string;
  actor_username: string | null;
  timestamp: string;
  source_ip: string;
  details: string;
}

export interface ManagedUser {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
}

export interface OrganisationProfile {
  id: number;
  name: string;
}

export const CHAT_MESSAGE_MAX_LENGTH = 500;

export interface ChatConversation {
  id: number;
  kind: 'direct' | 'group';
  name: string;
}

export interface Contact {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  avatar_url: string | null;
}

export interface GroupMember {
  user_id: number;
  username: string;
  display_name: string;
  role: Role;
}

export interface ChatGroup {
  id: number;
  name: string;
  members: GroupMember[];
  can_manage: boolean;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  author_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
  attachments: MessageAttachment[];
}

export interface WhatsUpApi {
  auth: {
    me(): Promise<User>;
    login(username: string, password: string): Promise<User>;
    logout(): Promise<void>;
    updateProfile(displayName: string): Promise<User>;
    changePassword(currentPassword: string, newPassword: string): Promise<void>;
    uploadAvatar(file: File): Promise<User>;
    removeAvatar(): Promise<void>;
  };
  chats: {
    listConversations(): Promise<ChatConversation[]>;
    startDirect(contactId: number): Promise<ChatConversation>;
    listMessages(conversationId: number): Promise<ChatMessage[]>;
    send(conversationId: number, body: string): Promise<ChatMessage>;
    listAttachments(conversationId: number): Promise<MessageAttachment[]>;
    uploadAttachment(conversationId: number, file: File, confidential: boolean): Promise<ChatMessage>;
    reshareAttachment(
      sourceConversationId: number,
      fileId: number,
      targetConversationId: number,
    ): Promise<ChatMessage>;
  };
  contacts: {
    list(): Promise<Contact[]>;
  };
  groups: {
    list(): Promise<ChatGroup[]>;
    create(name: string, memberIds: number[]): Promise<ChatGroup>;
    rename(groupId: number, name: string): Promise<ChatGroup>;
    addMembers(groupId: number, memberIds: number[]): Promise<ChatGroup>;
    removeMember(groupId: number, memberId: number): Promise<ChatGroup>;
  };
  reports: {
    reportable(messageId: number): Promise<ReportableMessage>;
    submit(input: ReportInput): Promise<void>;
  };
  admin: {
    listReports(options: { offset: number; reviewStatus: string }): Promise<Page<MessageReport>>;
    updateReport(reportId: number, reviewStatus: MessageReport['review_status']): Promise<MessageReport>;
    listAuditEvents(options: { offset: number }): Promise<Page<AuditEvent>>;
    listUsers(): Promise<ManagedUser[]>;
    createUser(input: { username: string; displayName: string; password: string; role: Role }): Promise<ManagedUser>;
    updateUser(userId: number, input: { role: Role; isActive: boolean }): Promise<ManagedUser>;
    updateOrganisation(name: string): Promise<OrganisationProfile>;
  };
}
