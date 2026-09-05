export type View = "inbox" | "sent" | "compose" | "detail";

export type ThemeMode = "light" | "dark";

export interface Filters {
  query?: string;
  sender?: string;
  afterDays?: number;
  unreadOnly?: boolean;
  datePreset?: "all" | "today" | "7d" | "30d";
}

export interface ComposeState {
  to: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
  threadId?: string;
  isForward?: boolean;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
  body: string;
}

export interface ThreadDetail {
  id: string;
  messages: ThreadMessage[];
}

export interface MailFilters {
  query?: string;
  sender?: string;
  afterDays?: number;
  unreadOnly?: boolean;
  label?: "INBOX" | "SENT";
}
