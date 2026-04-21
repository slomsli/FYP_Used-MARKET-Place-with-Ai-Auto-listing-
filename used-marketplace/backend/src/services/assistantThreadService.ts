import { supabaseAdmin } from '../config/supabase';
import { chatWithAssistant } from './assistantService';
import type {
  AssistantChatRequestBody,
  AssistantCurrentPageContext,
  AssistantHistoryEntry,
  AssistantIntent,
  AssistantMessageType,
  AssistantPendingAction,
  AssistantPersistedMessage,
  AssistantResponse,
  AssistantRole,
  AssistantRoleContext,
  AssistantSelectedEntityContext,
  AssistantSendMessageResult,
  AssistantThreadState,
  AssistantThreadStateSnapshot,
  AssistantThreadStatus,
  AssistantThreadSummary,
} from '../types/assistant';

const DEFAULT_THREAD_TITLE = 'New chat';
const ASSISTANT_INTENTS = new Set<AssistantIntent>([
  'go_to_add_listing',
  'open_messages',
  'open_profile',
  'open_settings',
  'open_my_listings',
  'open_offers',
  'open_browse',
  'open_support',
  'open_admin_analytics',
  'open_admin_reports',
  'open_admin_messages',
  'open_admin_users',
  'show_my_purchases',
  'show_my_sold_items',
  'show_my_orders',
  'show_admin_sales_today',
  'show_admin_sales_yesterday',
  'show_admin_revenue_yesterday',
  'show_admin_profit_yesterday',
  'report_problem',
  'unknown',
]);
const PENDING_ACTION_TYPES = new Set<NonNullable<AssistantPendingAction['type']>>([
  'navigate',
  'report_scope',
  'report_order_selection',
]);

interface AssistantThreadRow {
  id: string;
  user_id: string;
  title: string;
  role_context: AssistantRoleContext;
  status: AssistantThreadStatus;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface AssistantThreadStateRow {
  thread_id: string;
  pending_intent: string | null;
  pending_action_type: string | null;
  requires_confirmation: boolean;
  state_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface AssistantMessageRow {
  id: string;
  thread_id: string;
  sender_type: 'user' | 'assistant' | 'system';
  message_type: AssistantMessageType;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ThreadMessageStat {
  messageCount: number;
  lastMessagePreview: string | null;
}

interface CreateAssistantThreadInput {
  userId: string;
  roleContext?: AssistantRoleContext;
}

interface SendAssistantMessageInput {
  requestId: string;
  userId: string;
  threadId: string;
  message: string;
  roleContext?: AssistantRoleContext;
  currentPageContext?: AssistantCurrentPageContext;
  selectedEntityContext?: AssistantSelectedEntityContext;
}

class AssistantThreadServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AssistantThreadServiceError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeIntent(value: unknown): AssistantIntent | undefined {
  if (typeof value !== 'string' || !ASSISTANT_INTENTS.has(value as AssistantIntent)) {
    return undefined;
  }

  return value as AssistantIntent;
}

function normalizePendingActionType(
  value: unknown
): AssistantPendingAction['type'] | null {
  if (typeof value !== 'string' || !PENDING_ACTION_TYPES.has(value as AssistantPendingAction['type'])) {
    return null;
  }

  return value as AssistantPendingAction['type'];
}

function normalizeRoleContext(
  value: unknown,
  fallback: AssistantRoleContext = 'user'
): AssistantRoleContext {
  if (value === 'user' || value === 'seller' || value === 'admin') {
    return value;
  }

  return fallback;
}

function normalizeMessage(message: unknown): string {
  if (typeof message !== 'string' || !message.trim()) {
    throw new AssistantThreadServiceError('message is required', 422);
  }

  const trimmed = message.trim();
  if (trimmed.length > 2000) {
    throw new AssistantThreadServiceError('message must be 2000 characters or fewer', 422);
  }

  return trimmed;
}

function normalizeThreadId(threadId: unknown): string {
  if (typeof threadId !== 'string' || !threadId.trim()) {
    throw new AssistantThreadServiceError('threadId is required', 422);
  }

  return threadId.trim();
}

function normalizePreview(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= 84) {
    return collapsed;
  }

  return `${collapsed.slice(0, 84).trimEnd()}...`;
}

function generateThreadTitleFromMessage(message: string): string | null {
  const collapsed = message.replace(/\s+/g, ' ').trim();

  if (!collapsed || /^(hi|hello|hey|yo|thanks|thank you)$/i.test(collapsed)) {
    return null;
  }

  const withoutTrailingPunctuation = collapsed.replace(/[.!?]+$/, '').trim();
  const baseTitle = withoutTrailingPunctuation || collapsed;

  if (baseTitle.length <= 56) {
    return baseTitle;
  }

  return `${baseTitle.slice(0, 56).trimEnd()}...`;
}

function inferAssistantMessageType(response: AssistantResponse): AssistantMessageType {
  if (response.action.type !== 'none') {
    return 'action';
  }

  if (response.quickReplies.length > 0) {
    return 'quick_reply';
  }

  return 'text';
}

function parsePendingAction(value: unknown): AssistantPendingAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = normalizePendingActionType(value.type);
  const intent = normalizeIntent(value.intent) ?? 'unknown';

  if (!type) {
    return null;
  }

  return {
    type,
    intent,
    step: typeof value.step === 'string' && value.step.trim() ? value.step : 'pending',
    target: typeof value.target === 'string' && value.target.trim() ? value.target : undefined,
    label: typeof value.label === 'string' && value.label.trim() ? value.label : undefined,
    payload: isRecord(value.payload) ? value.payload : undefined,
  };
}

function createDefaultThreadState(
  threadId: string,
  timestamp = new Date().toISOString()
): AssistantThreadStateSnapshot {
  return {
    threadId,
    pendingAction: null,
    requiresConfirmation: false,
    pendingIntent: null,
    pendingActionType: null,
    updatedAt: timestamp,
  };
}

function snapshotToThreadState(snapshot: AssistantThreadStateSnapshot): AssistantThreadState {
  return {
    threadId: snapshot.threadId,
    lastIntent: snapshot.lastIntent,
    pendingAction: snapshot.pendingAction ?? null,
  };
}

function mapStateRowToSnapshot(
  row: AssistantThreadStateRow | null,
  threadId: string
): AssistantThreadStateSnapshot {
  if (!row) {
    return createDefaultThreadState(threadId);
  }

  const stateJson = isRecord(row.state_json) ? row.state_json : {};
  const pendingAction = parsePendingAction(stateJson.pendingAction);

  return {
    threadId,
    lastIntent: normalizeIntent(stateJson.lastIntent),
    pendingAction,
    requiresConfirmation: row.requires_confirmation,
    pendingIntent: normalizeIntent(row.pending_intent) ?? null,
    pendingActionType: normalizePendingActionType(row.pending_action_type),
    updatedAt: row.updated_at,
  };
}

function buildThreadStateSnapshotFromResponse(
  threadId: string,
  response: AssistantResponse,
  updatedAt: string
): AssistantThreadStateSnapshot {
  return {
    threadId,
    lastIntent: response.threadState.lastIntent,
    pendingAction: response.threadState.pendingAction ?? null,
    requiresConfirmation: response.requiresConfirmation,
    pendingIntent: response.pendingAction?.intent ?? null,
    pendingActionType: response.pendingAction?.type ?? null,
    updatedAt,
  };
}

function extractAssistantResponse(
  metadata: Record<string, unknown>
): AssistantResponse | undefined {
  const response = metadata.response;

  if (!isRecord(response)) {
    return undefined;
  }

  return response as unknown as AssistantResponse;
}

function mapMessageRow(row: AssistantMessageRow): AssistantPersistedMessage {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const response = row.sender_type === 'assistant' ? extractAssistantResponse(metadata) : undefined;

  return {
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type,
    messageType: row.message_type,
    content: row.content,
    metadata,
    createdAt: row.created_at,
    response,
  };
}

function buildHistory(messages: AssistantPersistedMessage[]): AssistantHistoryEntry[] {
  const history: AssistantHistoryEntry[] = [];

  for (const message of messages) {
    if (message.senderType !== 'user' && message.senderType !== 'assistant') {
      continue;
    }

    history.push({
      role: message.senderType,
      message: message.content,
      response: message.response,
      createdAt: message.createdAt,
    });
  }

  return history;
}

async function loadThreadRow(threadId: string): Promise<AssistantThreadRow | null> {
  const { data, error } = await supabaseAdmin
    .from('assistant_threads')
    .select(
      'id, user_id, title, role_context, status, last_message_at, created_at, updated_at, deleted_at'
    )
    .eq('id', threadId)
    .maybeSingle();

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to load assistant thread: ${error.message}`,
      500
    );
  }

  return (data as AssistantThreadRow | null) ?? null;
}

async function requireOwnedThread(
  userId: string,
  threadId: string,
  options?: { allowDeleted?: boolean }
): Promise<AssistantThreadRow> {
  const thread = await loadThreadRow(threadId);

  if (!thread) {
    throw new AssistantThreadServiceError('Assistant thread not found', 404);
  }

  if (thread.user_id !== userId) {
    throw new AssistantThreadServiceError('You do not have access to this assistant thread', 403);
  }

  if (!options?.allowDeleted && thread.deleted_at) {
    throw new AssistantThreadServiceError('Assistant thread not found', 404);
  }

  return thread;
}

async function getOrCreateThreadStateRow(
  threadId: string
): Promise<AssistantThreadStateRow | null> {
  const { data, error } = await supabaseAdmin
    .from('assistant_thread_state')
    .select(
      'thread_id, pending_intent, pending_action_type, requires_confirmation, state_json, created_at, updated_at'
    )
    .eq('thread_id', threadId)
    .maybeSingle();

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to load assistant thread state: ${error.message}`,
      500
    );
  }

  if (data) {
    return data as AssistantThreadStateRow;
  }

  const timestamp = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('assistant_thread_state')
    .insert({
      thread_id: threadId,
      pending_intent: null,
      pending_action_type: null,
      requires_confirmation: false,
      state_json: {
        threadId,
        lastIntent: null,
        pendingAction: null,
      },
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select(
      'thread_id, pending_intent, pending_action_type, requires_confirmation, state_json, created_at, updated_at'
    )
    .single();

  if (insertError || !inserted) {
    throw new AssistantThreadServiceError(
      `Failed to initialize assistant thread state: ${insertError?.message || 'Unknown error'}`,
      500
    );
  }

  return inserted as AssistantThreadStateRow;
}

async function loadPersistedMessages(threadId: string): Promise<AssistantPersistedMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('assistant_messages')
    .select('id, thread_id, sender_type, message_type, content, metadata, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to load assistant messages: ${error.message}`,
      500
    );
  }

  return ((data ?? []) as AssistantMessageRow[]).map(mapMessageRow);
}

async function loadThreadMessageStats(
  threadIds: string[]
): Promise<Map<string, ThreadMessageStat>> {
  const stats = new Map<string, ThreadMessageStat>();

  if (threadIds.length === 0) {
    return stats;
  }

  const { data, error } = await supabaseAdmin
    .from('assistant_messages')
    .select('thread_id, content, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to load assistant message stats: ${error.message}`,
      500
    );
  }

  for (const row of (data ?? []) as Array<{
    thread_id: string;
    content: string;
    created_at: string;
  }>) {
    const existing = stats.get(row.thread_id);

    if (!existing) {
      stats.set(row.thread_id, {
        messageCount: 1,
        lastMessagePreview: normalizePreview(row.content),
      });
      continue;
    }

    existing.messageCount += 1;
  }

  return stats;
}

async function loadThreadStateMap(
  threadIds: string[]
): Promise<Map<string, AssistantThreadStateRow>> {
  const stateMap = new Map<string, AssistantThreadStateRow>();

  if (threadIds.length === 0) {
    return stateMap;
  }

  const { data, error } = await supabaseAdmin
    .from('assistant_thread_state')
    .select(
      'thread_id, pending_intent, pending_action_type, requires_confirmation, state_json, created_at, updated_at'
    )
    .in('thread_id', threadIds);

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to load assistant thread states: ${error.message}`,
      500
    );
  }

  for (const row of (data ?? []) as AssistantThreadStateRow[]) {
    stateMap.set(row.thread_id, row);
  }

  return stateMap;
}

function mapThreadRowToSummary(
  thread: AssistantThreadRow,
  stateRow: AssistantThreadStateRow | null,
  messageStat?: ThreadMessageStat
): AssistantThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    roleContext: thread.role_context,
    status: thread.status,
    lastMessageAt: thread.last_message_at,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    deletedAt: thread.deleted_at,
    messageCount: messageStat?.messageCount ?? 0,
    lastMessagePreview: messageStat?.lastMessagePreview ?? null,
    threadState: mapStateRowToSnapshot(stateRow, thread.id),
  };
}

function sortThreadSummaries(
  threads: AssistantThreadSummary[]
): AssistantThreadSummary[] {
  return [...threads].sort((left, right) => {
    const leftTime = Date.parse(left.lastMessageAt ?? left.updatedAt);
    const rightTime = Date.parse(right.lastMessageAt ?? right.updatedAt);
    return rightTime - leftTime;
  });
}

async function loadThreadSummary(
  userId: string,
  threadId: string,
  options?: { allowDeleted?: boolean }
): Promise<AssistantThreadSummary> {
  const thread = await requireOwnedThread(userId, threadId, options);
  const [stateMap, statMap] = await Promise.all([
    loadThreadStateMap([thread.id]),
    loadThreadMessageStats([thread.id]),
  ]);

  return mapThreadRowToSummary(
    thread,
    stateMap.get(thread.id) ?? null,
    statMap.get(thread.id)
  );
}

async function touchThread(
  threadId: string,
  params: {
    lastMessageAt?: string;
    status?: AssistantThreadStatus;
    title?: string;
    roleContext?: AssistantRoleContext;
    deletedAt?: string | null;
  }
): Promise<void> {
  const updatedAt = params.lastMessageAt ?? new Date().toISOString();
  const payload: Record<string, unknown> = {
    updated_at: updatedAt,
  };

  if (params.lastMessageAt) {
    payload.last_message_at = params.lastMessageAt;
  }

  if (params.status) {
    payload.status = params.status;
  }

  if (typeof params.title === 'string') {
    payload.title = params.title;
  }

  if (params.roleContext) {
    payload.role_context = params.roleContext;
  }

  if (params.deletedAt !== undefined) {
    payload.deleted_at = params.deletedAt;
  }

  const { error } = await supabaseAdmin
    .from('assistant_threads')
    .update(payload)
    .eq('id', threadId);

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to update assistant thread activity: ${error.message}`,
      500
    );
  }
}

async function persistThreadState(
  threadId: string,
  response: AssistantResponse
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const pendingAction = response.threadState.pendingAction ?? null;
  const { error } = await supabaseAdmin
    .from('assistant_thread_state')
    .upsert(
      {
        thread_id: threadId,
        pending_intent: pendingAction?.intent ?? null,
        pending_action_type: pendingAction?.type ?? null,
        requires_confirmation: response.requiresConfirmation,
        state_json: {
          threadId,
          lastIntent: response.threadState.lastIntent ?? null,
          pendingAction,
        },
        updated_at: updatedAt,
      },
      {
        onConflict: 'thread_id',
      }
    );

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to persist assistant thread state: ${error.message}`,
      500
    );
  }
}

async function insertMessage(params: {
  threadId: string;
  senderType: 'user' | 'assistant' | 'system';
  messageType: AssistantMessageType;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<AssistantPersistedMessage> {
  const { data, error } = await supabaseAdmin
    .from('assistant_messages')
    .insert({
      thread_id: params.threadId,
      sender_type: params.senderType,
      message_type: params.messageType,
      content: params.content,
      metadata: params.metadata ?? {},
    })
    .select('id, thread_id, sender_type, message_type, content, metadata, created_at')
    .single();

  if (error || !data) {
    throw new AssistantThreadServiceError(
      `Failed to save assistant message: ${error?.message || 'Unknown error'}`,
      500
    );
  }

  return mapMessageRow(data as AssistantMessageRow);
}

function buildAssistantRequestBody(params: {
  threadId: string;
  message: string;
  roleContext: AssistantRoleContext;
  threadState: AssistantThreadStateSnapshot;
  history: AssistantPersistedMessage[];
  currentPageContext?: AssistantCurrentPageContext;
  selectedEntityContext?: AssistantSelectedEntityContext;
}): AssistantChatRequestBody {
  const userRole: AssistantRole = params.roleContext === 'admin' ? 'admin' : 'user';

  return {
    message: params.message,
    userRole,
    roleContext: params.roleContext,
    threadId: params.threadId,
    threadState: snapshotToThreadState(params.threadState),
    currentPageContext: params.currentPageContext,
    selectedEntityContext: params.selectedEntityContext,
    history: buildHistory(params.history),
  };
}

export async function createAssistantThread(
  input: CreateAssistantThreadInput
): Promise<AssistantThreadSummary> {
  const roleContext = normalizeRoleContext(input.roleContext);
  const timestamp = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('assistant_threads')
    .insert({
      user_id: input.userId,
      title: DEFAULT_THREAD_TITLE,
      role_context: roleContext,
      status: 'active',
      updated_at: timestamp,
    })
    .select(
      'id, user_id, title, role_context, status, last_message_at, created_at, updated_at, deleted_at'
    )
    .single();

  if (error || !data) {
    throw new AssistantThreadServiceError(
      `Failed to create assistant thread: ${error?.message || 'Unknown error'}`,
      500
    );
  }

  await getOrCreateThreadStateRow((data as AssistantThreadRow).id);
  return mapThreadRowToSummary(data as AssistantThreadRow, null);
}

export async function listAssistantThreadsForUser(
  userId: string
): Promise<AssistantThreadSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('assistant_threads')
    .select(
      'id, user_id, title, role_context, status, last_message_at, created_at, updated_at, deleted_at'
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new AssistantThreadServiceError(
      `Failed to load assistant threads: ${error.message}`,
      500
    );
  }

  const threads = (data ?? []) as AssistantThreadRow[];
  const threadIds = threads.map((thread) => thread.id);
  const [stateMap, statMap] = await Promise.all([
    loadThreadStateMap(threadIds),
    loadThreadMessageStats(threadIds),
  ]);

  return sortThreadSummaries(
    threads.map((thread) =>
      mapThreadRowToSummary(
        thread,
        stateMap.get(thread.id) ?? null,
        statMap.get(thread.id)
      )
    )
  );
}

export async function getAssistantThreadMessagesForUser(
  userId: string,
  threadId: string
): Promise<AssistantPersistedMessage[]> {
  const normalizedThreadId = normalizeThreadId(threadId);
  await requireOwnedThread(userId, normalizedThreadId);
  return loadPersistedMessages(normalizedThreadId);
}

export async function archiveAssistantThreadForUser(
  userId: string,
  threadId: string
): Promise<AssistantThreadSummary> {
  const normalizedThreadId = normalizeThreadId(threadId);
  await requireOwnedThread(userId, normalizedThreadId);
  await touchThread(normalizedThreadId, {
    status: 'archived',
  });

  return loadThreadSummary(userId, normalizedThreadId);
}

export async function deleteAssistantThreadForUser(
  userId: string,
  threadId: string
): Promise<{ threadId: string; deletedAt: string }> {
  const normalizedThreadId = normalizeThreadId(threadId);
  await requireOwnedThread(userId, normalizedThreadId);
  const deletedAt = new Date().toISOString();

  await touchThread(normalizedThreadId, {
    status: 'closed',
    deletedAt,
  });

  return {
    threadId: normalizedThreadId,
    deletedAt,
  };
}

export async function sendAssistantMessage(
  input: SendAssistantMessageInput
): Promise<AssistantSendMessageResult> {
  const message = normalizeMessage(input.message);
  const threadId = normalizeThreadId(input.threadId);
  const thread = await requireOwnedThread(input.userId, threadId);

  if (thread.status === 'closed') {
    throw new AssistantThreadServiceError(
      'This assistant thread has been closed and cannot receive new messages',
      409
    );
  }

  const [existingMessages, stateRow] = await Promise.all([
    loadPersistedMessages(thread.id),
    getOrCreateThreadStateRow(thread.id),
  ]);

  const roleContext = normalizeRoleContext(input.roleContext, thread.role_context);
  const isFirstMessage = existingMessages.length === 0;
  const generatedTitle =
    isFirstMessage && thread.title === DEFAULT_THREAD_TITLE
      ? generateThreadTitleFromMessage(message)
      : null;
  const nextRoleContext =
    isFirstMessage && roleContext !== thread.role_context ? roleContext : thread.role_context;

  const userMessage = await insertMessage({
    threadId: thread.id,
    senderType: 'user',
    messageType: 'text',
    content: message,
    metadata: {
      roleContext: nextRoleContext,
      currentPageContext: input.currentPageContext ?? null,
      selectedEntityContext: input.selectedEntityContext ?? null,
    },
  });

  await touchThread(thread.id, {
    lastMessageAt: userMessage.createdAt,
    status: 'active',
    title: generatedTitle ?? undefined,
    roleContext: nextRoleContext,
  });

  const effectiveThreadState = mapStateRowToSnapshot(stateRow, thread.id);
  const response = await chatWithAssistant({
    requestId: input.requestId,
    userId: input.userId,
    body: buildAssistantRequestBody({
      threadId: thread.id,
      message,
      roleContext: nextRoleContext,
      threadState: effectiveThreadState,
      history: [...existingMessages, userMessage],
      currentPageContext: input.currentPageContext,
      selectedEntityContext: input.selectedEntityContext,
    }),
  });

  const assistantMessage = await insertMessage({
    threadId: thread.id,
    senderType: 'assistant',
    messageType: inferAssistantMessageType(response),
    content: response.message,
    metadata: {
      response,
    },
  });

  await Promise.all([
    touchThread(thread.id, {
      lastMessageAt: assistantMessage.createdAt,
      status: 'active',
      title: generatedTitle ?? undefined,
      roleContext: nextRoleContext,
    }),
    persistThreadState(thread.id, response),
  ]);

  return {
    thread: {
      id: thread.id,
      title: generatedTitle ?? thread.title,
      roleContext: nextRoleContext,
      status: 'active',
      lastMessageAt: assistantMessage.createdAt,
      createdAt: thread.created_at,
      updatedAt: assistantMessage.createdAt,
      deletedAt: null,
      messageCount: existingMessages.length + 2,
      lastMessagePreview: normalizePreview(assistantMessage.content),
      threadState: buildThreadStateSnapshotFromResponse(
        thread.id,
        response,
        assistantMessage.createdAt
      ),
    },
    userMessage,
    assistantMessage,
    response,
  };
}
