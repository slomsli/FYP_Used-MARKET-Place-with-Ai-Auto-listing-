import type { ListingReportReason } from './report';

export type AssistantRole = 'user' | 'admin';
export type AssistantRoleContext = 'user' | 'seller' | 'admin';
export type AssistantThreadStatus = 'active' | 'archived' | 'closed';
export type AssistantMessageSenderType = 'user' | 'assistant' | 'system';
export type AssistantMessageType =
  | 'text'
  | 'action'
  | 'error'
  | 'quick_reply'
  | 'system_notice';
export type AssistantIntent =
  | 'go_to_add_listing'
  | 'open_messages'
  | 'open_profile'
  | 'open_settings'
  | 'open_my_listings'
  | 'open_offers'
  | 'open_browse'
  | 'open_support'
  | 'open_admin_analytics'
  | 'open_admin_reports'
  | 'open_admin_messages'
  | 'open_admin_users'
  | 'show_my_purchases'
  | 'show_my_sold_items'
  | 'show_my_orders'
  | 'show_admin_sales_today'
  | 'show_admin_sales_yesterday'
  | 'show_admin_revenue_yesterday'
  | 'show_admin_profit_yesterday'
  | 'report_problem'
  | 'unknown';

export interface AssistantCurrentPageContext {
  path?: string;
  title?: string;
  section?: string;
  pageType?: string;
}

export interface AssistantSelectedEntityContext {
  listingId?: string;
  conversationId?: string;
  orderId?: string;
  reportId?: string;
  userId?: string;
}

export interface AssistantQuickAction {
  id: string;
  label: string;
  message: string;
}

export interface AssistantQuickReply {
  id: string;
  label: string;
  message: string;
}

export interface AssistantAction {
  type: 'navigate' | 'tool_result' | 'none';
  target?: string;
  payload?: Record<string, unknown>;
}

export interface AssistantPendingAction {
  type: 'navigate' | 'report_scope' | 'report_order_selection';
  intent: AssistantIntent;
  step: string;
  target?: string;
  label?: string;
  payload?: Record<string, unknown>;
}

export interface AssistantThreadState {
  threadId: string;
  lastIntent?: AssistantIntent;
  pendingAction?: AssistantPendingAction | null;
}

export interface AssistantThreadStateSnapshot extends AssistantThreadState {
  requiresConfirmation: boolean;
  pendingIntent?: AssistantIntent | null;
  pendingActionType?: AssistantPendingAction['type'] | null;
  updatedAt: string;
}

export interface AssistantStatCard {
  id: string;
  label: string;
  value: string;
  description?: string;
  tone?: 'neutral' | 'positive' | 'warning';
}

export interface AssistantOrderCard {
  id: string;
  orderId: string;
  listingId: string;
  title: string;
  statusLabel: string;
  priceLabel: string;
  price: string;
  counterpartyLabel: string;
  counterpartyName: string;
  dateLabel: string;
  date: string;
  imagePath: string | null;
  caption?: string;
}

export interface AssistantListingCard {
  id: string;
  listingId: string;
  title: string;
  statusLabel: string;
  price: string;
  subtitle?: string;
  imagePath: string | null;
  meta: string[];
}

export interface AssistantReportDraftCard {
  listingId: string | null;
  listingTitle: string | null;
  listingImagePath: string | null;
  reason: ListingReportReason | null;
  reasonLabel: string | null;
  details: string;
  readyToSubmit: boolean;
  submitted?: boolean;
  missingFields: string[];
  guidance: string;
  safetyNote: string;
}

export type AssistantResponseBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'stat_cards';
      items: AssistantStatCard[];
    }
  | {
      type: 'order_cards';
      items: AssistantOrderCard[];
    }
  | {
      type: 'listing_cards';
      items: AssistantListingCard[];
    }
  | {
      type: 'report_draft_card';
      draft: AssistantReportDraftCard;
    }
  | {
      type: 'quick_actions';
      items: AssistantQuickAction[];
    }
  | {
      type: 'confirmation_prompt';
      action: 'submit_report';
      prompt: string;
      confirmLabel: string;
      confirmMessage: string;
      cancelLabel?: string;
      cancelMessage?: string;
    };

export interface AssistantToolCallSummary {
  name: string;
  status: 'completed' | 'blocked' | 'failed';
  summary: string;
}

export interface AssistantResponse {
  role: AssistantRole;
  requestedRole: AssistantRole;
  model: string;
  route: 'tool' | 'direct';
  message: string;
  blocks: AssistantResponseBlock[];
  toolCalls: AssistantToolCallSummary[];
  quickReplies: AssistantQuickReply[];
  requiresConfirmation: boolean;
  action: AssistantAction;
  pendingAction?: AssistantPendingAction | null;
  threadState: AssistantThreadState;
  generatedAt: string;
}

export interface AssistantHistoryEntry {
  role: 'user' | 'assistant';
  message: string;
  response?: AssistantResponse;
  createdAt?: string;
}

export interface AssistantConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AssistantResponse;
  createdAt: string;
}

export interface AssistantConversationSession {
  id: string;
  role: AssistantRole;
  title: string;
  messages: AssistantConversationMessage[];
  createdAt: string;
  updatedAt: string;
  threadState?: AssistantThreadState | null;
  lastError?: string | null;
}

export interface AssistantChatPayload {
  message: string;
  userRole: AssistantRole;
  roleContext?: AssistantRoleContext;
  threadId?: string;
  threadState?: AssistantThreadState;
  conversationId?: string;
  currentPageContext?: AssistantCurrentPageContext;
  selectedEntityContext?: AssistantSelectedEntityContext;
  history?: AssistantHistoryEntry[];
}

export interface CreateAssistantThreadPayload {
  roleContext?: AssistantRoleContext;
}

export interface AssistantSendMessagePayload {
  threadId: string;
  message: string;
  roleContext?: AssistantRoleContext;
  currentPageContext?: AssistantCurrentPageContext;
  selectedEntityContext?: AssistantSelectedEntityContext;
}

export interface AssistantThreadSummary {
  id: string;
  title: string;
  roleContext: AssistantRoleContext;
  status: AssistantThreadStatus;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  threadState: AssistantThreadStateSnapshot;
}

export interface AssistantPersistedMessage {
  id: string;
  threadId: string;
  senderType: AssistantMessageSenderType;
  messageType: AssistantMessageType;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  response?: AssistantResponse;
}

export interface AssistantSendMessageResult {
  thread: AssistantThreadSummary;
  userMessage: AssistantPersistedMessage;
  assistantMessage: AssistantPersistedMessage;
  response: AssistantResponse;
}
