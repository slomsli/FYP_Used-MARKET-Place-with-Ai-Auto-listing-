import {
  FunctionCallingConfigMode,
  type FunctionCall,
  type FunctionDeclaration,
} from '@google/genai';
import { geminiClient } from '../config/gemini';
import { supabaseAdmin } from '../config/supabase';
import {
  createListingReport,
  ReportServiceError,
} from './reportService';
import type {
  AssistantAction,
  AssistantChatRequestBody,
  AssistantConfirmationPromptBlock,
  AssistantCurrentPageContext,
  AssistantHistoryEntry,
  AssistantIntent,
  AssistantListingCard,
  AssistantOrderCard,
  AssistantPendingAction,
  AssistantQuickAction,
  AssistantQuickReply,
  AssistantReportDraftCard,
  AssistantResponse,
  AssistantResponseBlock,
  AssistantRole,
  AssistantRoleContext,
  AssistantSelectedEntityContext,
  AssistantStatCard,
  AssistantThreadState,
  AssistantToolCallSummary,
} from '../types/assistant';
import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from '../types/report';
import { MODERATION_LISTING_BRAND } from '../utils/moderationThread';
import { getPublicStorageUrl } from '../utils/storage';
import { logAssistantToolCall } from '../utils/assistantAudit';

const DEFAULT_ASSISTANT_MODEL =
  process.env.GEMINI_ASSISTANT_MODEL?.trim() || 'gemini-2.5-pro';
const ADMIN_ANALYTICS_MODEL =
  process.env.GEMINI_ASSISTANT_ADMIN_ANALYTICS_MODEL?.trim() || null;
const MARKETPLACE_TIME_ZONE = 'Asia/Kuala_Lumpur';
const LISTING_IMAGE_BUCKET =
  process.env.SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  'listing-images';
const REPORTABLE_LISTING_STATUSES = new Set(['active', 'reserved', 'sold']);
const USER_TOOL_LIMIT = 6;
const SAFE_MEMBER_ROUTES = {
  addListing: '/dashboard/add-listing',
  messages: '/dashboard/messages',
  myListings: '/dashboard/my-listings',
  offers: '/dashboard/offers',
  settings: '/dashboard/settings',
  browse: '/browse',
  support: '/dashboard/support',
  report: '/dashboard/report',
} as const;
const SAFE_ADMIN_ROUTES = {
  analytics: '/admin',
  reports: '/admin/reports',
  messages: '/admin/messages',
  users: '/admin/users',
} as const;

type Relation<T> = T | T[] | null;
type ToolStatus = 'completed' | 'blocked' | 'failed';
type ReportScope = 'purchase' | 'sale';

interface AssistantActorProfile {
  id: string;
  role: AssistantRole;
  username: string | null;
  full_name: string | null;
}

interface RawProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_path?: string | null;
}

interface RawCategory {
  id: number;
  name: string;
  slug: string;
}

interface RawState {
  id: number;
  name: string;
}

interface RawListingOrder {
  id: string;
  seller_id: string;
  sold_to_user_id: string | null;
  title: string;
  price: unknown;
  currency: string | null;
  status: string;
  sold_at: string | null;
  created_at: string;
  cover_image_path: string | null;
  brand: string | null;
  category_id?: number | null;
  state_id?: number | null;
  categories: Relation<RawCategory>;
  seller_profile: Relation<RawProfile>;
  buyer_profile: Relation<RawProfile>;
  states?: Relation<RawState>;
}

interface RawOfferListing {
  id: string;
  title: string;
  price: unknown;
  currency: string | null;
  status: string;
  cover_image_path: string | null;
}

interface RawOffer {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price: unknown;
  status: string;
  offer_kind: string;
  initiated_by: string | null;
  created_at: string;
  updated_at: string;
  listings: Relation<RawOfferListing>;
  buyer_profile: Relation<RawProfile>;
  seller_profile: Relation<RawProfile>;
}

interface RawConversationLookup {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string;
  listings: Relation<{
    id: string;
    title: string;
    cover_image_path: string | null;
  }>;
  buyer_profile: Relation<RawProfile>;
  seller_profile: Relation<RawProfile>;
}

interface RawReportLookup {
  id: string;
  reason: ReportReason;
  status: string;
  created_at: string;
  listings: Relation<{
    id: string;
    title: string;
  }>;
}

interface ReportOrderOption {
  orderId: string;
  listingId: string;
  title: string;
  perspective: ReportScope;
}

interface SupportTicketDraft {
  subject: string;
  details: string;
}

interface AssistantContext {
  requestId: string;
  threadId: string;
  conversationId?: string;
  userId: string;
  message: string;
  requestedRole: AssistantRole;
  actualRole: AssistantRole;
  roleContext: AssistantRoleContext;
  currentPageContext?: AssistantCurrentPageContext;
  selectedEntityContext?: AssistantSelectedEntityContext;
  history: AssistantHistoryEntry[];
  threadState: AssistantThreadState;
  latestReportDraft: AssistantReportDraftCard | null;
  hasExplicitReportConfirmation: boolean;
}

interface ToolExecutionResult {
  name: string;
  status: ToolStatus;
  summary: string;
  payload?: unknown;
}

interface AssistantToolDefinition {
  declaration: FunctionDeclaration;
  allowedRoles: AssistantRole[];
  execute: (
    args: Record<string, unknown>,
    context: AssistantContext
  ) => Promise<ToolExecutionResult>;
}

interface QueryDateRange {
  start: string;
  end: string;
  label: string;
}

interface QueryDateWindow {
  startDate: string;
  endDate: string;
  label: string;
}

interface AssistantToolCallRequest {
  name?: string;
  args?: Record<string, unknown>;
}

class AssistantServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AssistantServiceError';
    this.status = status;
  }
}

class AssistantToolBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantToolBlockedError';
  }
}

function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function buildDisplayName(profile: RawProfile | null): string {
  const fullName = profile?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const username = profile?.username?.trim();
  if (username) {
    return username;
  }

  return 'Marketplace User';
}

function buildListingImagePath(pathValue: string | null | undefined): string | null {
  return getPublicStorageUrl(LISTING_IMAGE_BUCKET, pathValue || null);
}

function formatCurrency(value: unknown, currency = 'MYR'): string {
  const amount = toFiniteNumber(value, Number.NaN);

  if (!Number.isFinite(amount)) {
    return '-';
  }

  try {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `RM ${amount.toFixed(2)}`;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown date';
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MARKETPLACE_TIME_ZONE,
  }).format(parsed);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function parseReportReason(value: unknown): ReportReason | null {
  if (typeof value !== 'string' || !REPORT_REASONS.includes(value as ReportReason)) {
    return null;
  }

  return value as ReportReason;
}

function dedupeQuickActions(items: AssistantQuickAction[]): AssistantQuickAction[] {
  const seen = new Set<string>();
  const deduped: AssistantQuickAction[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function buildDefaultQuickActions(
  role: AssistantRole,
  selectedEntityContext?: AssistantSelectedEntityContext
): AssistantQuickAction[] {
  if (role === 'admin') {
    return [
      { id: 'sales-today', label: 'Sales today', message: 'How many items were sold today?' },
      { id: 'pending-reports', label: 'Pending reports', message: 'Show me the pending reports count.' },
      { id: 'active-listings', label: 'Active listings', message: 'How many active listings are there right now?' },
      { id: 'top-categories', label: 'Top categories', message: 'Show me the top categories.' },
    ];
  }

  return [
    { id: 'my-purchases', label: 'Show my purchases', message: 'Show my purchases.' },
    {
      id: 'report-problem',
      label: 'Report a problem',
      message: selectedEntityContext?.listingId
        ? 'I want to report a problem with this listing.'
        : 'I need to report a problem.',
    },
    { id: 'my-sold-items', label: 'Show my sold items', message: 'Show my sold items.' },
    { id: 'create-listing', label: 'Help me create a listing', message: 'Help me create a listing.' },
  ];
}

function buildRequestedRoleNote(context: AssistantContext): string | null {
  if (context.requestedRole === context.actualRole) {
    return null;
  }

  return `I used your signed-in ${context.actualRole} permissions instead of the requested ${context.requestedRole} role.`;
}

function createTextBlock(text: string): AssistantResponseBlock {
  return {
    type: 'text',
    text,
  };
}

function createQuickActionsBlock(
  role: AssistantRole,
  selectedEntityContext?: AssistantSelectedEntityContext
): AssistantResponseBlock {
  return {
    type: 'quick_actions',
    items: buildDefaultQuickActions(role, selectedEntityContext),
  };
}

function combineText(note: string | null, text: string): string {
  if (!note) {
    return text;
  }

  return `${note}\n\n${text}`;
}

function createQuickReplies(
  items: Array<{ id: string; label: string; message: string }>
): AssistantQuickReply[] {
  const seen = new Set<string>();
  const replies: AssistantQuickReply[] = [];

  for (const item of items) {
    if (!item.id || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    replies.push({
      id: item.id,
      label: item.label,
      message: item.message,
    });
  }

  return replies;
}

function getPrimaryResponseText(blocks: AssistantResponseBlock[]): string {
  const textBlock = blocks.find(
    (block): block is Extract<AssistantResponseBlock, { type: 'text' }> => block.type === 'text'
  );

  return textBlock?.text || '';
}

function buildThreadState(
  context: AssistantContext,
  lastIntent: AssistantIntent,
  pendingAction: AssistantPendingAction | null
): AssistantThreadState {
  return {
    threadId: context.threadId,
    lastIntent,
    pendingAction,
  };
}

function createAssistantResponse(params: {
  context: AssistantContext;
  model: string;
  route: 'tool' | 'direct';
  blocks: AssistantResponseBlock[];
  toolCalls: AssistantToolCallSummary[];
  requiresConfirmation?: boolean;
  action?: AssistantAction;
  quickReplies?: AssistantQuickReply[];
  pendingAction?: AssistantPendingAction | null;
  lastIntent?: AssistantIntent;
  message?: string;
}): AssistantResponse {
  const pendingAction = params.pendingAction ?? null;

  return {
    role: params.context.actualRole,
    requestedRole: params.context.requestedRole,
    model: params.model,
    route: params.route,
    message: params.message || getPrimaryResponseText(params.blocks),
    blocks: params.blocks,
    toolCalls: params.toolCalls,
    quickReplies: params.quickReplies ?? [],
    requiresConfirmation: params.requiresConfirmation ?? false,
    action: params.action ?? { type: 'none' },
    pendingAction,
    threadState: buildThreadState(
      params.context,
      params.lastIntent ?? params.context.threadState.lastIntent ?? 'unknown',
      pendingAction
    ),
    generatedAt: new Date().toISOString(),
  };
}

function getTimeZoneParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKETPLACE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? '0'),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? '0'),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? '0'),
  };
}

function getTimeZoneOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKETPLACE_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const timeZoneName = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(timeZoneName);

  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes);
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}

function getTodayRange(): QueryDateRange {
  const now = new Date();
  const { year, month, day } = getTimeZoneParts(now);
  const startDate = zonedDateTimeToUtc(year, month, day, 0, 0, 0);
  const endDate = zonedDateTimeToUtc(year, month, day + 1, 0, 0, 0);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    label: 'today',
  };
}

function getCurrentWeekRange(): QueryDateRange {
  const now = new Date();
  const offsetMinutes = getTimeZoneOffsetMinutes(now);
  const pseudoZonedNow = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const weekdayIndex = pseudoZonedNow.getUTCDay();
  const daysFromMonday = (weekdayIndex + 6) % 7;
  const pseudoWeekStart = new Date(
    Date.UTC(
      pseudoZonedNow.getUTCFullYear(),
      pseudoZonedNow.getUTCMonth(),
      pseudoZonedNow.getUTCDate() - daysFromMonday
    )
  );
  const pseudoWeekEnd = new Date(
    Date.UTC(
      pseudoZonedNow.getUTCFullYear(),
      pseudoZonedNow.getUTCMonth(),
      pseudoZonedNow.getUTCDate() + (7 - daysFromMonday)
    )
  );

  const start = zonedDateTimeToUtc(
    pseudoWeekStart.getUTCFullYear(),
    pseudoWeekStart.getUTCMonth() + 1,
    pseudoWeekStart.getUTCDate()
  );
  const end = zonedDateTimeToUtc(
    pseudoWeekEnd.getUTCFullYear(),
    pseudoWeekEnd.getUTCMonth() + 1,
    pseudoWeekEnd.getUTCDate()
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: 'this week',
  };
}

function shiftDateParts(
  parts: { year: number; month: number; day: number },
  dayOffset: number
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatDateParts(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day
  ).padStart(2, '0')}`;
}

function createDateWindow(
  startParts: { year: number; month: number; day: number },
  endParts: { year: number; month: number; day: number },
  label: string
): QueryDateWindow {
  return {
    startDate: formatDateParts(startParts),
    endDate: formatDateParts(endParts),
    label,
  };
}

function getRelativeDayWindow(dayOffset: number, label: string): QueryDateWindow {
  const today = getTimeZoneParts(new Date());
  const targetDay = shiftDateParts(today, dayOffset);

  return createDateWindow(targetDay, targetDay, label);
}

function getCurrentWeekWindow(): QueryDateWindow {
  const today = getTimeZoneParts(new Date());
  const pseudoZonedToday = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const weekdayIndex = pseudoZonedToday.getUTCDay();
  const daysFromMonday = (weekdayIndex + 6) % 7;
  const weekStart = shiftDateParts(today, -daysFromMonday);
  const weekEnd = shiftDateParts(weekStart, 6);

  return createDateWindow(weekStart, weekEnd, 'this week');
}

function parseDateOnly(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function getCustomDateRange(
  startDateValue: string,
  endDateValue: string,
  label?: string
): QueryDateRange {
  const start = parseDateOnly(startDateValue);
  const end = parseDateOnly(endDateValue);

  if (!start || !end) {
    throw new AssistantToolBlockedError('Please provide both startDate and endDate in YYYY-MM-DD format.');
  }

  const startDate = zonedDateTimeToUtc(start.year, start.month, start.day);
  const endDate = zonedDateTimeToUtc(end.year, end.month, end.day + 1);

  if (endDate.getTime() <= startDate.getTime()) {
    throw new AssistantToolBlockedError('The end date must be the same day or later than the start date.');
  }

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    label: label || `${startDateValue} to ${endDateValue}`,
  };
}

function extractLatestReportDraft(history: AssistantHistoryEntry[]): AssistantReportDraftCard | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.role !== 'assistant' || !entry.response) {
      continue;
    }

    for (let blockIndex = entry.response.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = entry.response.blocks[blockIndex];

      if (block.type === 'report_draft_card' && !block.draft.submitted) {
        return block.draft;
      }
    }
  }

  return null;
}

function hasExplicitReportConfirmation(message: string): boolean {
  return /^(yes|yep|yeah|confirm|submit it|submit the report|send it|go ahead|please submit|proceed)\b/i.test(
    message.trim()
  );
}

function isAdminAnalyticsHeavy(message: string): boolean {
  return /(trend|compare|analysis|analyze|breakdown|week|month|quarter|summary)/i.test(
    message
  );
}

function selectAssistantModel(actualRole: AssistantRole, message: string): string {
  if (actualRole === 'admin' && ADMIN_ANALYTICS_MODEL && isAdminAnalyticsHeavy(message)) {
    return ADMIN_ANALYTICS_MODEL;
  }

  return DEFAULT_ASSISTANT_MODEL;
}

function normalizeMessageForRouting(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRecentHistoryText(
  history: AssistantHistoryEntry[],
  limit = 6
): string {
  return history
    .slice(-limit)
    .map((entry) => entry.message)
    .join(' ');
}

function hasNavigationVerb(message: string): boolean {
  return /\b(open|go to|take me to|show|bring me to|send me to|visit|launch|pen|tae me to)\b/.test(
    message
  );
}

function isSupportNavigationMessage(message: string): boolean {
  const asksForSupportPage =
    hasNavigationVerb(message) &&
    /\b(support|suppor|help center|help page|support page)\b/.test(message);
  const asksToContactAdmin =
    /\b(message|massage|contact|reach|talk to|speak to)\b.*\b(admin|administrator|support|team)\b/.test(
      message
    ) ||
    /\b(admin|administrator|support|team)\b.*\b(message|massage|contact|reach|talk to|speak to)\b/.test(
      message
    );

  return asksForSupportPage || asksToContactAdmin;
}

function messageMentionsListingCreation(message: string): boolean {
  return (
    /\b(add|adding|create|creating|new|post|posting|submit|submitting|publish|publishing)\b.*\blisting\b/.test(
      message
    ) ||
    /\blisting\b.*\b(add|adding|create|creating|new|post|posting|submit|submitting|publish|publishing)\b/.test(
      message
    )
  );
}

function messageMentionsIssue(message: string): boolean {
  return /\b(cannot|can not|can t|cant|unable|not able|trouble|problem|issue|error|failed|fail|fails|not work|does not work|doesnt work|stuck)\b/.test(
    message
  );
}

function isListingCreationSupportIssue(context: AssistantContext): boolean {
  const message = normalizeMessageForRouting(context.message);

  if (messageMentionsListingCreation(message) && messageMentionsIssue(message)) {
    return true;
  }

  if (
    /\b(sorry|soory|meant|ment|i mean)\b/.test(message) &&
    messageMentionsListingCreation(message)
  ) {
    const recent = normalizeMessageForRouting(getRecentHistoryText(context.history));
    return (
      /\b(support|suppor|admin|administrator|message|massage)\b/.test(recent) ||
      messageMentionsIssue(recent)
    );
  }

  return false;
}

function isSupportDraftRequest(message: string): boolean {
  return (
    /\b(write|draft|prepare|type|fill|prefill)\b.*\b(message|ticket|request|note)\b/.test(
      message
    ) &&
    /\b(admin|administrator|support|team)\b/.test(message)
  );
}

function isRecentSupportDraftContext(context: AssistantContext): boolean {
  const recent = normalizeMessageForRouting(getRecentHistoryText(context.history));

  return (
    /\b(admin|administrator|support|support page|support ticket)\b/.test(recent) &&
    /\b(write|draft|message|ticket|what issue|what is the issue|tell me about the issue)\b/.test(
      recent
    )
  );
}

function inferSupportTicketDraft(context: AssistantContext): SupportTicketDraft | null {
  const normalizedMessage = normalizeMessageForRouting(context.message);

  if (isListingCreationSupportIssue(context)) {
    return {
      subject: 'Cannot add a new listing',
      details:
        "Hi Admin, I'm having trouble adding a new listing. When I try to create or submit the listing, it does not work. Could you please help me check the issue? Thank you.",
    };
  }

  if (!isRecentSupportDraftContext(context) || !messageMentionsIssue(normalizedMessage)) {
    return null;
  }

  const subject = /\b(login|log in|password|sign in)\b/.test(normalizedMessage)
    ? 'Login problem'
    : /\blisting\b/.test(normalizedMessage)
      ? 'Listing problem'
      : 'Support request';

  return {
    subject,
    details: `Hi Admin, I need help with this issue: ${context.message.trim()}. Could you please check it? Thank you.`,
  };
}

function isAffirmativeMessage(message: string): boolean {
  return /^(yes|yep|yeah|sure|ok|okay|please do|do it|go ahead|continue|proceed|open it|open that)\b/.test(
    normalizeMessageForRouting(message)
  );
}

function isNegativeMessage(message: string): boolean {
  return /^(no|nope|cancel|stop|not now|dont|do not|never mind|later)\b/.test(
    normalizeMessageForRouting(message)
  );
}

function parseReportScopeFromMessage(message: string): ReportScope | null {
  const normalizedMessage = normalizeMessageForRouting(message);

  if (/\b(purchase|purchased|buy|bought|buyer scam|seller scam|order i bought)\b/.test(normalizedMessage)) {
    return 'purchase';
  }

  if (/\b(sold|sale|seller side|buyer problem|item i sold|buyer issue)\b/.test(normalizedMessage)) {
    return 'sale';
  }

  return null;
}

function buildReportPageTarget(option: ReportOrderOption): string {
  const params = new URLSearchParams({
    listingId: option.listingId,
    orderId: option.orderId,
    scope: option.perspective,
    title: option.title,
    source: 'assistant',
  });

  return `${SAFE_MEMBER_ROUTES.report}?${params.toString()}`;
}

function buildSupportPageTarget(context: AssistantContext): string {
  const draft = inferSupportTicketDraft(context);

  if (!draft) {
    return SAFE_MEMBER_ROUTES.support;
  }

  const params = new URLSearchParams({
    newTicket: '1',
    subject: draft.subject,
    details: draft.details,
  });

  return `${SAFE_MEMBER_ROUTES.support}?${params.toString()}`;
}

function createNavigatePendingAction(
  intent: AssistantIntent,
  label: string,
  target: string
): AssistantPendingAction {
  return {
    type: 'navigate',
    intent,
    step: 'confirm_navigation',
    label,
    target,
  };
}

function detectDeterministicIntent(context: AssistantContext): AssistantIntent {
  const message = normalizeMessageForRouting(context.message);

  if (context.actualRole === 'admin') {
    if (/\bprofit\b.*\byesterday\b|\byesterday\b.*\bprofit\b/.test(message)) {
      return 'show_admin_profit_yesterday';
    }

    if (/\b(revenue|sales value|gmv|earnings?)\b.*\byesterday\b|\byesterday\b.*\b(revenue|sales value|gmv|earnings?)\b/.test(message)) {
      return 'show_admin_revenue_yesterday';
    }

    if (/\b(sales?|sold)\b.*\byesterday\b|\byesterday\b.*\b(sales?|sold)\b/.test(message)) {
      return 'show_admin_sales_yesterday';
    }

    if (/\b(sales?|sold)\b.*\btoday\b|\btoday\b.*\b(sales?|sold)\b/.test(message)) {
      return 'show_admin_sales_today';
    }

    if (/\b(open|go to|take me to|show)\b.*\b(admin )?(analytics|dashboard|overview)\b/.test(message)) {
      return 'open_admin_analytics';
    }

    if (/\b(open|go to|take me to|show)\b.*\b(reports?|moderation reports?)\b/.test(message)) {
      return 'open_admin_reports';
    }

    if (/\b(open|go to|take me to|show)\b.*\b(messages?|moderation chat)\b/.test(message)) {
      return 'open_admin_messages';
    }

    if (/\b(open|go to|take me to|show)\b.*\b(users?|user directory)\b/.test(message)) {
      return 'open_admin_users';
    }

    return 'unknown';
  }

  if (/\b(report|scam|fraud|problem with my order|report a buyer|report a seller)\b/.test(message)) {
    return 'report_problem';
  }

  if (/\b(show|view|list)\b.*\bmy purchases\b|\bmy purchases\b|\bwhat have i bought\b/.test(message)) {
    return 'show_my_purchases';
  }

  if (/\b(show|view|list)\b.*\bmy sold items\b|\bmy sold items\b|\bwhat have i sold\b/.test(message)) {
    return 'show_my_sold_items';
  }

  if (/\b(show|view)\b.*\b(my )?(orders|transactions)\b|\bmy orders\b/.test(message)) {
    return 'show_my_orders';
  }

  if (
    isSupportNavigationMessage(message) ||
    isListingCreationSupportIssue(context) ||
    inferSupportTicketDraft(context)
  ) {
    return 'open_support';
  }

  if (/\b(open|go to|take me to)\b.*\b(messages?|chat)\b/.test(message)) {
    return 'open_messages';
  }

  if (/\b(open|go to|take me to)\b.*\b(profile)\b/.test(message)) {
    return 'open_profile';
  }

  if (/\b(open|go to|take me to)\b.*\b(settings|account settings)\b/.test(message)) {
    return 'open_settings';
  }

  if (/\b(open|go to|take me to)\b.*\b(my listings|sold items page|seller inventory)\b/.test(message)) {
    return 'open_my_listings';
  }

  if (/\b(open|go to|take me to)\b.*\b(offers|purchase requests?)\b/.test(message)) {
    return 'open_offers';
  }

  if (/\b(open|go to|take me to)\b.*\b(browse|marketplace)\b/.test(message)) {
    return 'open_browse';
  }

  if (
    /\b(add listing|create listing|new listing|list a new item|sell this item|sell an item|add product|post item)\b/.test(
      message
    )
  ) {
    return 'go_to_add_listing';
  }

  return 'unknown';
}

function isSalesLikeMessage(message: string): boolean {
  return /\b(sales?|sold|revenue|gmv|earnings?)\b/.test(message);
}

function isPendingReportsMessage(message: string): boolean {
  return /\bpending reports?\b|\breports? pending\b/.test(message);
}

function isActiveListingsMessage(message: string): boolean {
  return /\bactive listings?\b|\blive listings?\b/.test(message);
}

function isTopCategoriesMessage(message: string): boolean {
  return /\btop categor(?:y|ies)\b|\bbest categor(?:y|ies)\b/.test(message);
}

function isTopStatesMessage(message: string): boolean {
  return /\btop states?\b|\bbest states?\b/.test(message);
}

function isNewUsersMessage(message: string): boolean {
  return /\bnew users?\b|\bsignups?\b|\bjoined this week\b/.test(message);
}

function isSummaryMessage(message: string): boolean {
  return /\b(summary|overview|snapshot|dashboard)\b/.test(message);
}

function isRecentReportsMessage(message: string): boolean {
  return /\b(recent|latest)\s+reports?\b/.test(message);
}

function isPausedListingsMessage(message: string): boolean {
  return /\bpaused listings?\b/.test(message);
}

function buildSingleDateWindowFromString(dateValue: string): QueryDateWindow {
  return {
    startDate: dateValue,
    endDate: dateValue,
    label: dateValue,
  };
}

function extractDateWindowFromMessage(message: string): QueryDateWindow | null {
  const normalizedMessage = normalizeMessageForRouting(message);
  const dateMatches = [...message.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);

  if (dateMatches.length >= 2) {
    return {
      startDate: dateMatches[0],
      endDate: dateMatches[1],
      label: `${dateMatches[0]} to ${dateMatches[1]}`,
    };
  }

  if (dateMatches.length === 1) {
    return buildSingleDateWindowFromString(dateMatches[0]);
  }

  if (/\byesterday\b/.test(normalizedMessage)) {
    return getRelativeDayWindow(-1, 'yesterday');
  }

  if (/\bthis week\b/.test(normalizedMessage)) {
    return getCurrentWeekWindow();
  }

  if (/\btoday\b/.test(normalizedMessage)) {
    return getRelativeDayWindow(0, 'today');
  }

  return null;
}

function getHistoryBeforeCurrentMessage(
  history: AssistantHistoryEntry[],
  currentMessage: string
): AssistantHistoryEntry[] {
  if (history.length === 0) {
    return history;
  }

  const lastEntry = history[history.length - 1];

  if (
    lastEntry.role === 'user' &&
    lastEntry.message.trim().toLowerCase() === currentMessage.trim().toLowerCase()
  ) {
    return history.slice(0, -1);
  }

  return history;
}

function getLatestCompletedAssistantToolName(history: AssistantHistoryEntry[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.role !== 'assistant' || !entry.response || entry.response.toolCalls.length === 0) {
      continue;
    }

    const completedTool = entry.response.toolCalls.find((toolCall) => toolCall.status === 'completed');
    return completedTool?.name || entry.response.toolCalls[0]?.name || null;
  }

  return null;
}

function isPurchasePriceFeedbackMessage(message: string): boolean {
  const normalizedMessage = normalizeMessageForRouting(message);

  return (
    /\b(price|prices|paid|pay|worth|deal|fair|reasonable|cheap|expensive|overpriced|rate|rating)\b/.test(
      normalizedMessage
    ) &&
    /\b(good|fair|reasonable|worth|rate|rating|think|opinion|okay|ok|overpriced|cheap|expensive)\b/.test(
      normalizedMessage
    )
  );
}

function extractLatestPurchaseCards(
  history: AssistantHistoryEntry[]
): AssistantOrderCard[] {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.role !== 'assistant' || !entry.response) {
      continue;
    }

    const loadedPurchases = entry.response.toolCalls.some(
      (toolCall) => toolCall.name === 'getMyPurchases' && toolCall.status === 'completed'
    );

    if (!loadedPurchases) {
      continue;
    }

    const orderBlock = entry.response.blocks.find(
      (block): block is Extract<AssistantResponseBlock, { type: 'order_cards' }> =>
        block.type === 'order_cards'
    );

    if (orderBlock?.items.length) {
      return orderBlock.items.filter((item) =>
        item.priceLabel.toLowerCase().includes('paid')
      );
    }
  }

  return [];
}

function parseCurrencyAmount(price: string): number | null {
  const normalized = price.replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratePurchaseCardPrice(card: AssistantOrderCard): string {
  const title = card.title.trim() || 'This item';
  const price = card.price;
  const amount = parseCurrencyAmount(price);
  const normalizedTitle = normalizeMessageForRouting(title);

  if (amount === null) {
    return `- ${title} at ${price}: I would need the exact price to judge it properly.`;
  }

  if (/\b(pen|gel pen|ball pen|stationery)\b/.test(normalizedTitle)) {
    if (amount <= 5) {
      return `- ${title} at ${price}: good price for a basic gel pen if it is new or writes smoothly.`;
    }
    if (amount <= 8) {
      return `- ${title} at ${price}: fair, but I would compare similar pens first.`;
    }
    return `- ${title} at ${price}: a bit high unless it is a multi-pack or a special model.`;
  }

  if (/\b(brush|hair brush|detangling)\b/.test(normalizedTitle)) {
    if (amount <= 8) {
      return `- ${title} at ${price}: good low price for a basic detangling brush.`;
    }
    if (amount <= 15) {
      return `- ${title} at ${price}: fair if the condition is clean and sturdy.`;
    }
    return `- ${title} at ${price}: on the high side unless it is a premium brand.`;
  }

  if (/\bbrand\b/.test(normalizedTitle)) {
    return `- ${title} at ${price}: harder to judge from the title alone; it is fair if the item and condition matched what you expected.`;
  }

  if (amount <= 10) {
    return `- ${title} at ${price}: looks low-risk and generally reasonable.`;
  }

  if (amount <= 30) {
    return `- ${title} at ${price}: probably reasonable if the item condition is good.`;
  }

  return `- ${title} at ${price}: worth comparing with similar listings before buying again.`;
}

function buildPurchasePriceFeedbackResponse(
  context: AssistantContext
): AssistantResponse | null {
  if (context.actualRole !== 'user' || !isPurchasePriceFeedbackMessage(context.message)) {
    return null;
  }

  const purchaseCards = extractLatestPurchaseCards(context.history).slice(0, USER_TOOL_LIMIT);

  if (purchaseCards.length === 0) {
    return null;
  }

  const note = buildRequestedRoleNote(context);
  const lines = purchaseCards.map(ratePurchaseCardPrice);
  const text = combineText(
    note,
    [
      'Based on the purchase prices already shown, they mostly look reasonable:',
      ...lines,
      'I do not have live market comparisons here, so treat this as a practical estimate rather than a real-time price check.',
    ].join('\n')
  );

  return createAssistantResponse({
    context,
    model: DEFAULT_ASSISTANT_MODEL,
    route: 'direct',
    blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
    toolCalls: [],
    lastIntent: 'show_my_purchases',
    message: text,
  });
}

function buildSalesToolCallFromWindow(window: QueryDateWindow): AssistantToolCallRequest {
  if (window.label === 'today') {
    return {
      name: 'getSalesToday',
      args: {},
    };
  }

  return {
    name: 'getSalesByDateRange',
    args: {
      startDate: window.startDate,
      endDate: window.endDate,
      label: window.label,
    },
  };
}

function resolveDeterministicAdminToolCall(
  context: AssistantContext
): AssistantToolCallRequest | null {
  if (context.actualRole !== 'admin') {
    return null;
  }

  const normalizedMessage = normalizeMessageForRouting(context.message);
  const dateWindow = extractDateWindowFromMessage(context.message);

  if (isSummaryMessage(normalizedMessage)) {
    return { name: 'getMarketplaceSummary', args: {} };
  }

  if (isPendingReportsMessage(normalizedMessage)) {
    return { name: 'getPendingReportsCount', args: {} };
  }

  if (isActiveListingsMessage(normalizedMessage)) {
    return { name: 'getActiveListingsCount', args: {} };
  }

  if (isTopCategoriesMessage(normalizedMessage)) {
    return { name: 'getTopCategories', args: {} };
  }

  if (isTopStatesMessage(normalizedMessage)) {
    return { name: 'getTopStates', args: {} };
  }

  if (isRecentReportsMessage(normalizedMessage)) {
    return { name: 'getRecentReports', args: {} };
  }

  if (isPausedListingsMessage(normalizedMessage)) {
    return { name: 'getPausedListings', args: {} };
  }

  if (isNewUsersMessage(normalizedMessage) || /\bthis week\b/.test(normalizedMessage)) {
    if (isNewUsersMessage(normalizedMessage)) {
      return { name: 'getNewUsers', args: { period: 'this_week' } };
    }
  }

  if (isSalesLikeMessage(normalizedMessage)) {
    return buildSalesToolCallFromWindow(dateWindow ?? getRelativeDayWindow(0, 'today'));
  }

  if (!dateWindow) {
    return null;
  }

  const previousHistory = getHistoryBeforeCurrentMessage(context.history, context.message);
  const latestToolName = getLatestCompletedAssistantToolName(previousHistory);

  if (latestToolName === 'getSalesToday' || latestToolName === 'getSalesByDateRange') {
    return buildSalesToolCallFromWindow(dateWindow);
  }

  return null;
}

function buildToolCallFromIntent(intent: AssistantIntent): AssistantToolCallRequest | null {
  switch (intent) {
    case 'show_my_purchases':
      return { name: 'getMyPurchases', args: {} };
    case 'show_my_sold_items':
      return { name: 'getMySoldItems', args: {} };
    case 'show_my_orders':
      return { name: 'getMyOrders', args: {} };
    case 'show_admin_sales_today':
      return { name: 'getSalesToday', args: {} };
    case 'show_admin_sales_yesterday':
    case 'show_admin_revenue_yesterday':
      return buildSalesToolCallFromWindow(getRelativeDayWindow(-1, 'yesterday'));
    default:
      return null;
  }
}

function buildNavigationPromptResponse(
  context: AssistantContext,
  intent: AssistantIntent,
  label: string,
  target: string,
  prompt: string
): AssistantResponse {
  const note = buildRequestedRoleNote(context);
  const text = combineText(note, prompt);
  const pendingAction = createNavigatePendingAction(intent, label, target);

  return createAssistantResponse({
    context,
    model: DEFAULT_ASSISTANT_MODEL,
    route: 'direct',
    blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
    toolCalls: [],
    quickReplies: createQuickReplies([
      { id: `${intent}-yes`, label: 'Yes', message: 'Yes' },
      { id: `${intent}-no`, label: 'No', message: 'No' },
    ]),
    requiresConfirmation: true,
    pendingAction,
    lastIntent: intent,
    message: text,
  });
}

function buildSupportDraftClarificationResponse(
  context: AssistantContext
): AssistantResponse | null {
  const message = normalizeMessageForRouting(context.message);

  if (!isSupportDraftRequest(message) || inferSupportTicketDraft(context)) {
    return null;
  }

  const note = buildRequestedRoleNote(context);
  const text = combineText(
    note,
    'I can help with that. What issue should I write to the admin about?'
  );

  return createAssistantResponse({
    context,
    model: DEFAULT_ASSISTANT_MODEL,
    route: 'direct',
    blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
    toolCalls: [],
    quickReplies: createQuickReplies([
      {
        id: 'support-draft-listing',
        label: 'Adding listing',
        message: 'I cannot add a new listing.',
      },
      {
        id: 'support-draft-other',
        label: 'Other issue',
        message: 'I need help with another issue.',
      },
    ]),
    lastIntent: 'open_support',
    message: text,
  });
}

function mapOrdersToReportOptions(
  orders: RawListingOrder[],
  perspective: ReportScope
): ReportOrderOption[] {
  return orders.map((order) => ({
    orderId: order.id,
    listingId: order.id,
    title: order.title,
    perspective,
  }));
}

function sanitizeReportOrderOptions(value: unknown): ReportOrderOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const orderId = normalizeString(candidate.orderId);
      const listingId = normalizeString(candidate.listingId);
      const title = normalizeString(candidate.title);
      const perspective =
        candidate.perspective === 'purchase' || candidate.perspective === 'sale'
          ? candidate.perspective
          : null;

      if (!orderId || !listingId || !title || !perspective) {
        return null;
      }

      return {
        orderId,
        listingId,
        title,
        perspective,
      } satisfies ReportOrderOption;
    })
    .filter((item): item is ReportOrderOption => item !== null);
}

function matchReportOrderOption(
  message: string,
  options: ReportOrderOption[]
): ReportOrderOption | null {
  const normalizedMessage = normalizeMessageForRouting(message);

  const directMatch =
    options.find(
      (option) =>
        normalizeMessageForRouting(option.orderId) === normalizedMessage ||
        normalizeMessageForRouting(option.listingId) === normalizedMessage
    ) ?? null;

  if (directMatch) {
    return directMatch;
  }

  const fuzzyMatches = options.filter((option) => {
    const normalizedTitle = normalizeMessageForRouting(option.title);
    return (
      normalizedTitle === normalizedMessage ||
      normalizedTitle.includes(normalizedMessage) ||
      normalizedMessage.includes(normalizedTitle)
    );
  });

  return fuzzyMatches.length === 1 ? fuzzyMatches[0] : null;
}

function buildReportScopeResponse(context: AssistantContext): AssistantResponse {
  const note = buildRequestedRoleNote(context);
  const text = combineText(
    note,
    'I can help with that safely. Is this about a purchase you made or an item you sold?'
  );
  const pendingAction: AssistantPendingAction = {
    type: 'report_scope',
    intent: 'report_problem',
    step: 'choose_scope',
  };

  return createAssistantResponse({
    context,
    model: DEFAULT_ASSISTANT_MODEL,
    route: 'direct',
    blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
    toolCalls: [],
    quickReplies: createQuickReplies([
      { id: 'report-scope-purchase', label: 'A purchase', message: 'It is about a purchase.' },
      { id: 'report-scope-sale', label: 'A sold item', message: 'It is about something I sold.' },
      { id: 'report-scope-cancel', label: 'Cancel', message: 'Cancel' },
    ]),
    pendingAction,
    lastIntent: 'report_problem',
    message: text,
  });
}

function buildReportOrderSelectionResponse(
  context: AssistantContext,
  scope: ReportScope,
  orders: RawListingOrder[]
): AssistantResponse {
  const note = buildRequestedRoleNote(context);
  const options = mapOrdersToReportOptions(orders, scope);
  const text = combineText(
    note,
    scope === 'purchase'
      ? 'Choose the purchase you want to report, and I will open the report form for it.'
      : 'Choose the sold item this report is about, and I will open the report form for it.'
  );
  const pendingAction: AssistantPendingAction = {
    type: 'report_order_selection',
    intent: 'report_problem',
    step: 'choose_order',
    payload: {
      scope,
      options,
    },
  };

  return createAssistantResponse({
    context,
    model: DEFAULT_ASSISTANT_MODEL,
    route: 'tool',
    blocks: [
      createTextBlock(text),
      {
        type: 'order_cards',
        items: orders.map((order) => mapListingToOrderCard(order, scope === 'purchase' ? 'purchase' : 'sale')),
      },
      createQuickActionsBlock(context.actualRole, context.selectedEntityContext),
    ],
    toolCalls: [
      {
        name: scope === 'purchase' ? 'getMyPurchases' : 'getMySoldItems',
        status: 'completed',
        summary: `Loaded ${orders.length} ${scope === 'purchase' ? 'purchase' : 'sold item'} record(s) for reporting.`,
      },
    ],
    quickReplies: createQuickReplies(
      options.slice(0, 4).map((option) => ({
        id: `report-order-${option.orderId}`,
        label: option.title.length > 26 ? `${option.title.slice(0, 26).trimEnd()}...` : option.title,
        message: option.orderId,
      }))
    ),
    pendingAction,
    lastIntent: 'report_problem',
    message: text,
  });
}

function buildReportOrderRetryResponse(
  context: AssistantContext,
  scope: ReportScope,
  options: ReportOrderOption[]
): AssistantResponse {
  const note = buildRequestedRoleNote(context);
  const text = combineText(
    note,
    scope === 'purchase'
      ? 'I could not tell which purchase you meant. Choose one of the recent purchases below.'
      : 'I could not tell which sold item you meant. Choose one of the recent sold items below.'
  );
  const pendingAction: AssistantPendingAction = {
    type: 'report_order_selection',
    intent: 'report_problem',
    step: 'choose_order',
    payload: {
      scope,
      options,
    },
  };

  return createAssistantResponse({
    context,
    model: DEFAULT_ASSISTANT_MODEL,
    route: 'direct',
    blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
    toolCalls: [],
    quickReplies: createQuickReplies(
      options.slice(0, 4).map((option) => ({
        id: `report-order-retry-${option.orderId}`,
        label: option.title.length > 26 ? `${option.title.slice(0, 26).trimEnd()}...` : option.title,
        message: option.orderId,
      }))
    ),
    pendingAction,
    lastIntent: 'report_problem',
    message: text,
  });
}

async function resolvePendingActionResponse(
  context: AssistantContext,
  currentIntent: AssistantIntent
): Promise<AssistantResponse | null> {
  const pendingAction = context.threadState.pendingAction;

  if (!pendingAction) {
    return null;
  }

  if (currentIntent !== 'unknown' && currentIntent !== pendingAction.intent && !isAffirmativeMessage(context.message) && !isNegativeMessage(context.message)) {
    return null;
  }

  if (pendingAction.type === 'navigate') {
    if (isAffirmativeMessage(context.message) && pendingAction.target) {
      const note = buildRequestedRoleNote(context);
      const text = combineText(note, `Opening ${pendingAction.label || 'that page'} now.`);

      return createAssistantResponse({
        context,
        model: DEFAULT_ASSISTANT_MODEL,
        route: 'direct',
        blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
        toolCalls: [],
        action: {
          type: 'navigate',
          target: pendingAction.target,
        },
        pendingAction: null,
        lastIntent: pendingAction.intent,
        message: text,
      });
    }

    if (isNegativeMessage(context.message)) {
      const note = buildRequestedRoleNote(context);
      const text = combineText(note, `Okay, I won't open ${pendingAction.label || 'that page'}.`);

      return createAssistantResponse({
        context,
        model: DEFAULT_ASSISTANT_MODEL,
        route: 'direct',
        blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
        toolCalls: [],
        pendingAction: null,
        lastIntent: pendingAction.intent,
        message: text,
      });
    }

    return null;
  }

  if (pendingAction.type === 'report_scope') {
    if (isNegativeMessage(context.message)) {
      const note = buildRequestedRoleNote(context);
      const text = combineText(note, 'Okay, I stopped the report flow. If you still need help, I can show support or your orders.');

      return createAssistantResponse({
        context,
        model: DEFAULT_ASSISTANT_MODEL,
        route: 'direct',
        blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
        toolCalls: [],
        pendingAction: null,
        lastIntent: 'report_problem',
        message: text,
      });
    }

    const scope = parseReportScopeFromMessage(context.message);
    if (!scope) {
      return buildReportScopeResponse(context);
    }

    const orders =
      scope === 'purchase'
        ? await loadMyPurchases(context.userId, USER_TOOL_LIMIT)
        : await loadMySoldItems(context.userId, USER_TOOL_LIMIT);

    if (orders.length === 0) {
      const note = buildRequestedRoleNote(context);
      const text = combineText(
        note,
        scope === 'purchase'
          ? 'I could not find any completed purchases to report yet.'
          : 'I could not find any sold items to report yet.'
      );

      return createAssistantResponse({
        context,
        model: DEFAULT_ASSISTANT_MODEL,
        route: 'tool',
        blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
        toolCalls: [
          {
            name: scope === 'purchase' ? 'getMyPurchases' : 'getMySoldItems',
            status: 'completed',
            summary: 'No eligible records were found for reporting.',
          },
        ],
        pendingAction: null,
        lastIntent: 'report_problem',
        message: text,
      });
    }

    return buildReportOrderSelectionResponse(context, scope, orders);
  }

  if (pendingAction.type === 'report_order_selection') {
    if (isNegativeMessage(context.message)) {
      return buildReportScopeResponse({
        ...context,
        threadState: buildThreadState(context, 'report_problem', null),
      });
    }

    const options = sanitizeReportOrderOptions(pendingAction.payload?.options);
    const selectedOption = matchReportOrderOption(context.message, options);

    if (!selectedOption) {
      return buildReportOrderRetryResponse(
        context,
        (pendingAction.payload?.scope === 'sale' ? 'sale' : 'purchase') as ReportScope,
        options
      );
    }

    return buildNavigationPromptResponse(
      context,
      'report_problem',
      `the report form for ${selectedOption.title}`,
      buildReportPageTarget(selectedOption),
      `I found "${selectedOption.title}". I can open the report form for that order now. Do you want me to continue?`
    );
  }

  return null;
}

async function resolveDeterministicIntentResponse(
  context: AssistantContext,
  intent: AssistantIntent
): Promise<AssistantResponse | null> {
  switch (intent) {
    case 'go_to_add_listing':
      return buildNavigationPromptResponse(
        context,
        intent,
        'the Add Listing page',
        SAFE_MEMBER_ROUTES.addListing,
        'I can take you to the Add Listing page. Do you want me to open it?'
      );
    case 'open_messages':
      return buildNavigationPromptResponse(
        context,
        intent,
        'your messages',
        SAFE_MEMBER_ROUTES.messages,
        'I can open your messages workspace. Do you want me to continue?'
      );
    case 'open_profile':
    case 'open_settings':
      return buildNavigationPromptResponse(
        context,
        intent,
        'your account settings',
        SAFE_MEMBER_ROUTES.settings,
        'I can open your account settings page. Do you want me to continue?'
      );
    case 'open_my_listings':
      return buildNavigationPromptResponse(
        context,
        intent,
        'your listings',
        SAFE_MEMBER_ROUTES.myListings,
        'I can open your listings page. Do you want me to continue?'
      );
    case 'open_offers':
      return buildNavigationPromptResponse(
        context,
        intent,
        'your offers',
        SAFE_MEMBER_ROUTES.offers,
        'I can open your offers page. Do you want me to continue?'
      );
    case 'open_browse':
      return buildNavigationPromptResponse(
        context,
        intent,
        'the browse page',
        SAFE_MEMBER_ROUTES.browse,
        'I can open the marketplace browse page. Do you want me to continue?'
      );
    case 'open_support': {
      const supportDraft = inferSupportTicketDraft(context);
      return buildNavigationPromptResponse(
        context,
        intent,
        'the support page',
        buildSupportPageTarget(context),
        supportDraft
          ? 'I can open the support page and prefill a message to the admin. Do you want me to continue?'
          : 'I can open the support page for you. Do you want me to continue?'
      );
    }
    case 'open_admin_analytics':
      return buildNavigationPromptResponse(
        context,
        intent,
        'the admin analytics dashboard',
        SAFE_ADMIN_ROUTES.analytics,
        'I can open the admin analytics dashboard. Do you want me to continue?'
      );
    case 'open_admin_reports':
      return buildNavigationPromptResponse(
        context,
        intent,
        'the admin reports page',
        SAFE_ADMIN_ROUTES.reports,
        'I can open the admin reports page. Do you want me to continue?'
      );
    case 'open_admin_messages':
      return buildNavigationPromptResponse(
        context,
        intent,
        'the admin messages page',
        SAFE_ADMIN_ROUTES.messages,
        'I can open the admin messages page. Do you want me to continue?'
      );
    case 'open_admin_users':
      return buildNavigationPromptResponse(
        context,
        intent,
        'the admin users page',
        SAFE_ADMIN_ROUTES.users,
        'I can open the admin users page. Do you want me to continue?'
      );
    case 'show_admin_profit_yesterday': {
      const note = buildRequestedRoleNote(context);
      const text = combineText(
        note,
        'Profit calculation is not available yet, but I can show yesterday\'s sales or revenue.'
      );

      return createAssistantResponse({
        context,
        model: DEFAULT_ASSISTANT_MODEL,
        route: 'direct',
        blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
        toolCalls: [],
        quickReplies: createQuickReplies([
          { id: 'profit-fallback-sales', label: 'Yesterday sales', message: 'Show sales yesterday.' },
          { id: 'profit-fallback-revenue', label: 'Yesterday revenue', message: 'Show revenue yesterday.' },
        ]),
        lastIntent: intent,
        message: text,
      });
    }
    case 'report_problem':
      if (context.selectedEntityContext?.listingId) {
        return buildNavigationPromptResponse(
          context,
          intent,
          'the report form',
          `${SAFE_MEMBER_ROUTES.report}?listingId=${encodeURIComponent(
            context.selectedEntityContext.listingId
          )}&source=assistant`,
          'I can open the report form for this listing. Do you want me to continue?'
        );
      }

      return buildReportScopeResponse(context);
    default:
      return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getProviderStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const candidate = (error as { status?: unknown }).status;

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  if (error instanceof Error) {
    const parsedMessage = extractProviderMessage(error);
    if (!parsedMessage || parsedMessage === error.message) {
      return undefined;
    }

    const parsedCode = /"code"\s*:\s*(\d+)/.exec(error.message);
    if (parsedCode) {
      return Number(parsedCode[1]);
    }
  }

  return undefined;
}

function extractProviderMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const rawMessage = error.message?.trim();
  if (!rawMessage) {
    return undefined;
  }

  if (!rawMessage.startsWith('{')) {
    return rawMessage;
  }

  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: {
        message?: string;
      };
      message?: string;
    };

    return parsed.error?.message || parsed.message || rawMessage;
  } catch {
    return rawMessage;
  }
}

function isTransientProviderError(error: unknown): boolean {
  const status = getProviderStatus(error);
  const message = extractProviderMessage(error)?.toLowerCase() || '';

  if (status !== undefined && [429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  return (
    message.includes('high demand') ||
    message.includes('unavailable') ||
    message.includes('temporarily') ||
    message.includes('overloaded') ||
    message.includes('timeout')
  );
}

function toAssistantProviderError(error: unknown): AssistantServiceError {
  const status = getProviderStatus(error);
  const message = extractProviderMessage(error)?.toLowerCase() || '';

  if (status === 429) {
    return new AssistantServiceError(
      'The assistant is handling too many requests right now. Please try again in a moment.',
      429
    );
  }

  if (status === 503 || isTransientProviderError(error)) {
    return new AssistantServiceError(
      'The assistant is temporarily busy right now. Please try again in a moment.',
      503
    );
  }

  if (status === 401 || status === 403) {
    return new AssistantServiceError(
      'The assistant provider rejected the request. Please verify the Gemini server configuration.',
      502
    );
  }

  if (message.includes('api key')) {
    return new AssistantServiceError(
      'The assistant provider is not configured correctly right now.',
      500
    );
  }

  return new AssistantServiceError(
    'The assistant could not complete that request right now.',
    502
  );
}

async function generateAssistantContent(params: {
  model: string;
  fallbackModel?: string | null;
  contents: string | object;
  systemInstruction: string;
  tools: FunctionDeclaration[];
}): Promise<{
  model: string;
  response: Awaited<ReturnType<typeof geminiClient.models.generateContent>>;
}> {
  const modelsToTry = [
    params.model,
    ...(params.fallbackModel && params.fallbackModel !== params.model
      ? [params.fallbackModel]
      : []),
  ];
  let lastError: unknown;

  for (const candidateModel of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await geminiClient.models.generateContent({
          model: candidateModel,
          contents: params.contents as any,
          config: {
            systemInstruction: params.systemInstruction,
            tools: [{ functionDeclarations: params.tools }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
            temperature: 0.2,
          },
        });

        return {
          model: candidateModel,
          response,
        };
      } catch (error) {
        lastError = error;

        if (!isTransientProviderError(error)) {
          throw toAssistantProviderError(error);
        }

        if (attempt === 0) {
          await sleep(450);
          continue;
        }

        break;
      }
    }
  }

  throw toAssistantProviderError(lastError);
}

function buildPrompt(
  input: AssistantChatRequestBody,
  context: Pick<
    AssistantContext,
    | 'conversationId'
    | 'threadId'
    | 'threadState'
    | 'actualRole'
    | 'requestedRole'
    | 'roleContext'
    | 'latestReportDraft'
    | 'history'
    | 'hasExplicitReportConfirmation'
  >
): string | object {
  const recentHistory = context.history.slice(-6).map((entry) => ({
    role: entry.role,
    message: entry.message,
  }));

  const textPayload = JSON.stringify(
    {
      userMessage: input.message,
      requestedRole: input.userRole,
      roleContext: context.roleContext,
      threadId: context.threadId,
      conversationId: context.conversationId ?? input.conversationId ?? null,
      actualRole: context.actualRole,
      currentPageContext: input.currentPageContext ?? null,
      selectedEntityContext: input.selectedEntityContext ?? null,
      threadState: context.threadState,
      recentHistory,
      latestReportDraft: context.latestReportDraft ?? null,
      hasExplicitReportConfirmation: context.hasExplicitReportConfirmation,
    },
    null,
    2
  );

  // When an image is attached, send it as a real multimodal content block.
  if (input.imageBase64 && input.imageMimeType) {
    return [
      {
        role: 'user',
        parts: [
          { text: textPayload },
          {
            inlineData: {
              mimeType: input.imageMimeType,
              data: input.imageBase64,
            },
          },
        ],
      },
    ];
  }

  return textPayload;
}

function buildPlannerSystemInstruction(actualRole: AssistantRole): string {
  return `
You are the ReMarket marketplace assistant.

You are operating as a backend tool-calling assistant. Never expose internal tool names or backend details to the user.

Core rules:
- Treat the authenticated actualRole as the source of truth for permissions.
- Use tools whenever the user asks for account-specific records, marketplace metrics, reports, orders, purchases, sold items, offer status, or moderation analytics.
- Prefer a single best tool call. Only call a second tool when the first tool cannot finish the task.
- If no tool is needed, answer directly in concise plain text.
- Keep the wording clear and helpful.

Image analysis:
- You CAN see images attached by the user. Analyse them fully and respond with specific, helpful details.
- If the user sends a screenshot of a listing, report, or marketplace page, extract visible information (title, price, status, seller, reporter, dates, etc.) and present it clearly.
- Never say you cannot access or see images — you have full vision capability.

Safety:
- If a user says they were scammed or suspects fraud, do not accuse anyone or declare wrongdoing as fact.
- Start or continue a guided report flow instead.
- createReportDraft only prepares a draft. It does not submit anything.
- submitReport must only be used after the user explicitly confirms submission and a ready draft exists.
- If listing context or enough report detail is missing, do not submit. Ask for the missing information through the response instead.

Role guidance:
- Actual role: ${actualRole}.
- If actualRole is user, stay within the user's own purchases, sold items, offers, orders, and report flow.
- If actualRole is admin, stay within analytics and moderation summaries allowed by admin tools.
- Treat roleContext as the user's task context for this thread: user means buyer/member tasks, seller means selling/listing tasks, and admin means moderation/admin tasks.
- If actualRole is user and roleContext is seller, prefer seller workflow wording when the request is ambiguous.

Direct-response guidance:
- For user education questions like listing actions, offer actions, chat actions, or writing a listing, direct text is fine if no tool is required.
- When answering directly, be concise and action oriented.
- If the user asks whether a shown price is good, give a cautious practical opinion from the visible item, condition, and price. Mention when you do not have live market comparisons, but do not stop at a refusal.
- If the user asks to message or contact an admin, guide them to the support ticket workspace or offer to open support. Do not say there is no way unless support is genuinely unavailable.
`.trim();
}

async function getAssistantActorProfile(userId: string): Promise<AssistantActorProfile> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, username, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Assistant] Failed to resolve actor profile:', error);
    throw new AssistantServiceError('Unable to verify assistant permissions', 500);
  }

  if (!data) {
    throw new AssistantServiceError('Your profile could not be verified', 403);
  }

  return {
    id: data.id,
    role: data.role === 'admin' ? 'admin' : 'user',
    username: data.username ?? null,
    full_name: data.full_name ?? null,
  };
}

function requireRole(context: AssistantContext, allowedRoles: AssistantRole[]): void {
  if (!allowedRoles.includes(context.actualRole)) {
    throw new AssistantToolBlockedError(
      `This assistant action is only available to ${allowedRoles.join(' or ')} accounts.`
    );
  }
}

function ensureValue(
  value: string | undefined,
  message: string
): string {
  if (!value) {
    throw new AssistantToolBlockedError(message);
  }

  return value;
}

function mapListingToOrderCard(
  listing: RawListingOrder,
  perspective: 'purchase' | 'sale',
  overrideOrderId?: string
): AssistantOrderCard {
  const counterparty =
    perspective === 'purchase'
      ? buildDisplayName(unwrapRelation(listing.seller_profile))
      : buildDisplayName(unwrapRelation(listing.buyer_profile));

  return {
    id: `${perspective}-${listing.id}-${overrideOrderId ?? listing.id}`,
    orderId: overrideOrderId ?? listing.id,
    listingId: listing.id,
    title: listing.title,
    statusLabel: perspective === 'purchase' ? 'Purchased' : 'Sold',
    priceLabel: perspective === 'purchase' ? 'Paid' : 'Sale price',
    price: formatCurrency(listing.price, listing.currency || 'MYR'),
    counterpartyLabel: perspective === 'purchase' ? 'Seller' : 'Buyer',
    counterpartyName: counterparty,
    dateLabel: perspective === 'purchase' ? 'Purchased on' : 'Sold on',
    date: formatDateTime(listing.sold_at || listing.created_at),
    imagePath: buildListingImagePath(listing.cover_image_path),
  };
}

function mapOfferToListingCard(
  offer: RawOffer,
  userId: string
): AssistantListingCard {
  const relatedListing = unwrapRelation(offer.listings);
  const isBuyer = offer.buyer_id === userId;
  const counterparty = buildDisplayName(
    unwrapRelation(isBuyer ? offer.seller_profile : offer.buyer_profile)
  );

  return {
    id: `offer-${offer.id}`,
    listingId: relatedListing?.id ?? offer.listing_id,
    title: relatedListing?.title ?? 'Listing',
    statusLabel: offer.status.charAt(0).toUpperCase() + offer.status.slice(1),
    price: formatCurrency(offer.offer_price, relatedListing?.currency || 'MYR'),
    subtitle:
      offer.offer_kind === 'purchase_request'
        ? 'Purchase request'
        : offer.offer_kind === 'counter_offer'
          ? 'Counter offer'
          : 'Offer',
    imagePath: buildListingImagePath(relatedListing?.cover_image_path),
    meta: [
      `${isBuyer ? 'Seller' : 'Buyer'}: ${counterparty}`,
      `Updated: ${formatDateTime(offer.updated_at || offer.created_at)}`,
    ],
  };
}

async function loadMyPurchases(userId: string, limit = USER_TOOL_LIMIT): Promise<RawListingOrder[]> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(
      `
        id,
        seller_id,
        sold_to_user_id,
        title,
        price,
        currency,
        status,
        sold_at,
        created_at,
        cover_image_path,
        brand,
        categories!listings_category_id_fkey ( id, name, slug ),
        seller_profile:profiles!listings_seller_id_fkey ( id, username, full_name, avatar_path ),
        buyer_profile:profiles!listings_sold_to_user_id_fkey ( id, username, full_name, avatar_path )
      `
    )
    .eq('sold_to_user_id', userId)
    .eq('status', 'sold')
    .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`)
    .order('sold_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Assistant] Failed to load purchases:', error);
    throw new AssistantToolBlockedError('I could not load your purchases right now.');
  }

  return (data ?? []) as RawListingOrder[];
}

async function loadMySoldItems(userId: string, limit = USER_TOOL_LIMIT): Promise<RawListingOrder[]> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(
      `
        id,
        seller_id,
        sold_to_user_id,
        title,
        price,
        currency,
        status,
        sold_at,
        created_at,
        cover_image_path,
        brand,
        categories!listings_category_id_fkey ( id, name, slug ),
        seller_profile:profiles!listings_seller_id_fkey ( id, username, full_name, avatar_path ),
        buyer_profile:profiles!listings_sold_to_user_id_fkey ( id, username, full_name, avatar_path )
      `
    )
    .eq('seller_id', userId)
    .eq('status', 'sold')
    .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`)
    .order('sold_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Assistant] Failed to load sold items:', error);
    throw new AssistantToolBlockedError('I could not load your sold items right now.');
  }

  return (data ?? []) as RawListingOrder[];
}

async function loadAccessibleSoldListingByListingId(
  userId: string,
  listingId: string
): Promise<RawListingOrder | null> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(
      `
        id,
        seller_id,
        sold_to_user_id,
        title,
        price,
        currency,
        status,
        sold_at,
        created_at,
        cover_image_path,
        brand,
        categories!listings_category_id_fkey ( id, name, slug ),
        seller_profile:profiles!listings_seller_id_fkey ( id, username, full_name, avatar_path ),
        buyer_profile:profiles!listings_sold_to_user_id_fkey ( id, username, full_name, avatar_path )
      `
    )
    .eq('id', listingId)
    .eq('status', 'sold')
    .or(`sold_to_user_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    console.error('[Assistant] Failed to find sold listing by listing id:', error);
    throw new AssistantToolBlockedError('I could not look up that order right now.');
  }

  return (data as RawListingOrder | null) ?? null;
}

async function loadAccessibleSoldListingByOfferId(
  userId: string,
  offerId: string
): Promise<{ listing: RawListingOrder; offerId: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('offers')
    .select(
      `
        id,
        listing_id,
        buyer_id,
        seller_id,
        offer_price,
        status,
        offer_kind,
        initiated_by,
        created_at,
        updated_at,
        listings!offers_listing_id_fkey (
          id,
          seller_id,
          sold_to_user_id,
          title,
          price,
          currency,
          status,
          sold_at,
          created_at,
          cover_image_path,
          brand,
          categories!listings_category_id_fkey ( id, name, slug ),
          seller_profile:profiles!listings_seller_id_fkey ( id, username, full_name, avatar_path ),
          buyer_profile:profiles!listings_sold_to_user_id_fkey ( id, username, full_name, avatar_path )
        )
      `
    )
    .eq('id', offerId)
    .eq('status', 'accepted')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    console.error('[Assistant] Failed to find accepted offer:', error);
    throw new AssistantToolBlockedError('I could not look up that order right now.');
  }

  const listing = unwrapRelation((data as { listings: Relation<RawListingOrder> } | null)?.listings);
  if (!listing || listing.status !== 'sold') {
    return null;
  }

  return {
    listing,
    offerId,
  };
}

async function inspectListingForDraft(listingId: string): Promise<{
  id: string;
  seller_id: string;
  title: string;
  cover_image_path: string | null;
  status: string;
  brand: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, title, cover_image_path, status, brand')
    .eq('id', listingId)
    .maybeSingle();

  if (error) {
    console.error('[Assistant] Failed to inspect listing for draft:', error);
    throw new AssistantToolBlockedError('I could not inspect that listing right now.');
  }

  return data ?? null;
}

async function loadOfferStatus(
  userId: string,
  listingId?: string
): Promise<RawOffer[]> {
  let query = supabaseAdmin
    .from('offers')
    .select(
      `
        id,
        listing_id,
        buyer_id,
        seller_id,
        offer_price,
        status,
        offer_kind,
        initiated_by,
        created_at,
        updated_at,
        listings!offers_listing_id_fkey ( id, title, price, currency, status, cover_image_path ),
        buyer_profile:profiles!offers_buyer_id_fkey ( id, username, full_name, avatar_path ),
        seller_profile:profiles!offers_seller_id_fkey ( id, username, full_name, avatar_path )
      `
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(USER_TOOL_LIMIT);

  if (listingId) {
    query = query.eq('listing_id', listingId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Assistant] Failed to load offer status:', error);
    throw new AssistantToolBlockedError('I could not load your offer status right now.');
  }

  return (data ?? []) as RawOffer[];
}

async function loadConversations(
  userId: string,
  listingId?: string,
  otherUserId?: string,
  username?: string
): Promise<RawConversationLookup[]> {
  let query = supabaseAdmin
    .from('conversations')
    .select(
      `
        id,
        listing_id,
        buyer_id,
        seller_id,
        created_at,
        last_message_at,
        listings ( id, title, cover_image_path ),
        buyer_profile:profiles!conversations_buyer_id_fkey ( id, username, full_name, avatar_path ),
        seller_profile:profiles!conversations_seller_id_fkey ( id, username, full_name, avatar_path )
      `
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('last_message_at', { ascending: false })
    .limit(USER_TOOL_LIMIT);

  if (listingId) {
    query = query.eq('listing_id', listingId);
  }

  if (otherUserId) {
    query = query.or(`buyer_id.eq.${otherUserId},seller_id.eq.${otherUserId}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Assistant] Failed to load conversations:', error);
    throw new AssistantToolBlockedError('I could not load your conversation right now.');
  }

  const rows = (data ?? []) as RawConversationLookup[];

  if (!username) {
    return rows;
  }

  return rows.filter((conversation) => {
    const buyer = unwrapRelation(conversation.buyer_profile);
    const seller = unwrapRelation(conversation.seller_profile);
    const usernames = [buyer?.username, seller?.username]
      .map((value) => value?.trim().toLowerCase())
      .filter(Boolean);

    return usernames.includes(username.trim().toLowerCase());
  });
}

async function loadSalesInRange(range: QueryDateRange): Promise<RawListingOrder[]> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(
      `
        id,
        seller_id,
        sold_to_user_id,
        title,
        price,
        currency,
        status,
        sold_at,
        created_at,
        cover_image_path,
        brand,
        category_id,
        state_id,
        categories!listings_category_id_fkey ( id, name, slug ),
        states!listings_state_id_fkey ( id, name ),
        seller_profile:profiles!listings_seller_id_fkey ( id, username, full_name, avatar_path ),
        buyer_profile:profiles!listings_sold_to_user_id_fkey ( id, username, full_name, avatar_path )
      `
    )
    .eq('status', 'sold')
    .gte('sold_at', range.start)
    .lt('sold_at', range.end)
    .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`)
    .order('sold_at', { ascending: false });

  if (error) {
    console.error('[Assistant] Failed to load sales range:', error);
    throw new AssistantToolBlockedError('I could not load sales analytics right now.');
  }

  return (data ?? []) as RawListingOrder[];
}

async function getActiveListingsCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`);

  if (error) {
    console.error('[Assistant] Failed to count active listings:', error);
    throw new AssistantToolBlockedError('I could not load the active listings count right now.');
  }

  return count ?? 0;
}

async function getPendingReportsCountInternal(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    console.error('[Assistant] Failed to count pending reports:', error);
    throw new AssistantToolBlockedError('I could not load pending reports right now.');
  }

  return count ?? 0;
}

async function loadRecentReports(limit = USER_TOOL_LIMIT): Promise<RawReportLookup[]> {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select(
      `
        id,
        reason,
        status,
        created_at,
        listings!reports_listing_id_fkey ( id, title )
      `
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Assistant] Failed to load recent reports:', error);
    throw new AssistantToolBlockedError('I could not load recent reports right now.');
  }

  return (data ?? []) as RawReportLookup[];
}

async function loadPausedListings(limit = USER_TOOL_LIMIT): Promise<RawListingOrder[]> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(
      `
        id,
        seller_id,
        sold_to_user_id,
        title,
        price,
        currency,
        status,
        sold_at,
        created_at,
        cover_image_path,
        brand,
        state_id,
        states!listings_state_id_fkey ( id, name ),
        categories!listings_category_id_fkey ( id, name, slug ),
        seller_profile:profiles!listings_seller_id_fkey ( id, username, full_name, avatar_path ),
        buyer_profile:profiles!listings_sold_to_user_id_fkey ( id, username, full_name, avatar_path )
      `
    )
    .eq('status', 'archived')
    .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Assistant] Failed to load paused listings:', error);
    throw new AssistantToolBlockedError('I could not load paused listings right now.');
  }

  return (data ?? []) as RawListingOrder[];
}

async function loadNewUsers(range: QueryDateRange): Promise<AssistantActorProfile[]> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, username, full_name')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('created_at', { ascending: false })
    .limit(USER_TOOL_LIMIT);

  if (error) {
    console.error('[Assistant] Failed to load new users:', error);
    throw new AssistantToolBlockedError('I could not load new user analytics right now.');
  }

  return ((data ?? []) as AssistantActorProfile[]).map((profile) => ({
    id: profile.id,
    role: profile.role === 'admin' ? 'admin' : 'user',
    username: profile.username ?? null,
    full_name: profile.full_name ?? null,
  }));
}

async function loadTopCategories(limit = 5): Promise<Array<{ id: number; name: string; count: number }>> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(
      `
        category_id,
        brand,
        status,
        categories!listings_category_id_fkey ( id, name, slug )
      `
    )
    .in('status', ['active', 'reserved', 'sold', 'archived']);

  if (error) {
    console.error('[Assistant] Failed to load top categories:', error);
    throw new AssistantToolBlockedError('I could not load top categories right now.');
  }

  const counts = new Map<number, { id: number; name: string; count: number }>();

  for (const row of (data ?? []) as Array<{
    brand: string | null;
    categories: Relation<RawCategory>;
  }>) {
    if (row.brand === MODERATION_LISTING_BRAND) {
      continue;
    }

    const category = unwrapRelation(row.categories);
    if (!category) {
      continue;
    }

    const current = counts.get(category.id) ?? {
      id: category.id,
      name: category.name,
      count: 0,
    };
    current.count += 1;
    counts.set(category.id, current);
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

async function loadTopStates(limit = 5): Promise<Array<{ id: number; name: string; count: number }>> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(
      `
        state_id,
        brand,
        status,
        states!listings_state_id_fkey ( id, name )
      `
    )
    .in('status', ['active', 'reserved', 'sold', 'archived']);

  if (error) {
    console.error('[Assistant] Failed to load top states:', error);
    throw new AssistantToolBlockedError('I could not load top states right now.');
  }

  const counts = new Map<number, { id: number; name: string; count: number }>();

  for (const row of (data ?? []) as Array<{
    brand: string | null;
    states: Relation<RawState>;
  }>) {
    if (row.brand === MODERATION_LISTING_BRAND) {
      continue;
    }

    const state = unwrapRelation(row.states);
    if (!state) {
      continue;
    }

    const current = counts.get(state.id) ?? {
      id: state.id,
      name: state.name,
      count: 0,
    };
    current.count += 1;
    counts.set(state.id, current);
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function buildReportDraft(
  listing: {
    id: string;
    seller_id: string;
    title: string;
    cover_image_path: string | null;
    status: string;
    brand: string | null;
  } | null,
  userId: string,
  reason: ReportReason | null,
  details: string
): AssistantReportDraftCard {
  const missingFields: string[] = [];

  if (!listing) {
    missingFields.push('listing');
  }

  if (!reason) {
    missingFields.push('reason');
  }

  if (!details.trim() || details.trim().length < 20) {
    missingFields.push('details');
  }

  if (listing && listing.brand === MODERATION_LISTING_BRAND) {
    missingFields.push('listing');
  }

  if (listing && !REPORTABLE_LISTING_STATUSES.has(listing.status)) {
    missingFields.push('listing');
  }

  if (listing && listing.seller_id === userId) {
    missingFields.push('listing');
  }

  const listingProblem =
    !listing
      ? 'Choose the listing you want to report before submitting.'
      : listing.brand === MODERATION_LISTING_BRAND ||
        !REPORTABLE_LISTING_STATUSES.has(listing.status) ||
        listing.seller_id === userId
        ? 'This listing is not eligible for a user report.'
        : null;

  const guidance = listingProblem
    ? listingProblem
    : missingFields.includes('details')
      ? 'Add a few concrete details so the admin can review what happened.'
      : missingFields.includes('reason')
        ? 'Choose the reason that best matches the issue.'
        : 'Your draft is ready. Review it and confirm if you want me to submit it.';

  return {
    listingId: listing?.id ?? null,
    listingTitle: listing?.title ?? null,
    listingImagePath: buildListingImagePath(listing?.cover_image_path),
    reason,
    reasonLabel: reason ? REPORT_REASON_LABELS[reason] : null,
    details: details.trim(),
    readyToSubmit: missingFields.length === 0,
    missingFields,
    guidance,
    safetyNote:
      'Reports are reviewed by admins. This draft does not accuse anyone automatically and will only be submitted after your confirmation.',
  };
}

async function executeTool(
  toolDefinition: AssistantToolDefinition,
  functionCall: AssistantToolCallRequest,
  context: AssistantContext
): Promise<ToolExecutionResult> {
  const args = (functionCall.args ?? {}) as Record<string, unknown>;

  try {
    requireRole(context, toolDefinition.allowedRoles);
    const result = await toolDefinition.execute(args, context);

    await logAssistantToolCall({
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      conversationId: context.conversationId,
      userId: context.userId,
      actualRole: context.actualRole,
      requestedRole: context.requestedRole,
      toolName: result.name,
      status: result.status,
      summary: result.summary,
      args,
      currentPageContext: context.currentPageContext,
      selectedEntityContext: context.selectedEntityContext,
    });

    return result;
  } catch (error) {
    const safeMessage =
      error instanceof AssistantToolBlockedError
        ? error.message
        : error instanceof ReportServiceError
          ? error.message
          : 'I hit a problem while using that assistant tool.';

    const status: ToolStatus =
      error instanceof AssistantToolBlockedError || error instanceof ReportServiceError
        ? 'blocked'
        : 'failed';

    await logAssistantToolCall({
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      conversationId: context.conversationId,
      userId: context.userId,
      actualRole: context.actualRole,
      requestedRole: context.requestedRole,
      toolName: functionCall.name || 'unknown',
      status,
      summary: safeMessage,
      args,
      currentPageContext: context.currentPageContext,
      selectedEntityContext: context.selectedEntityContext,
    });

    return {
      name: functionCall.name || 'unknown',
      status,
      summary: safeMessage,
    };
  }
}

function getToolRegistry(): Record<string, AssistantToolDefinition> {
  return {
    getMyOrders: {
      allowedRoles: ['user'],
      declaration: {
        name: 'getMyOrders',
        description:
          'User only. Returns a combined overview of the signed-in user purchases and sold items.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      async execute(_args, context) {
        const [purchases, soldItems] = await Promise.all([
          loadMyPurchases(context.userId, 4),
          loadMySoldItems(context.userId, 4),
        ]);

        return {
          name: 'getMyOrders',
          status: 'completed',
          summary: `Loaded ${purchases.length} purchase(s) and ${soldItems.length} sold item(s).`,
          payload: {
            purchases,
            soldItems,
          },
        };
      },
    },
    getMyPurchases: {
      allowedRoles: ['user'],
      declaration: {
        name: 'getMyPurchases',
        description:
          'User only. Returns the signed-in user purchases and purchased items.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      },
      async execute(args, context) {
        const purchases = await loadMyPurchases(
          context.userId,
          normalizePositiveInteger(args.limit) ?? USER_TOOL_LIMIT
        );

        return {
          name: 'getMyPurchases',
          status: 'completed',
          summary: `Loaded ${purchases.length} purchase(s).`,
          payload: purchases,
        };
      },
    },
    getMySoldItems: {
      allowedRoles: ['user'],
      declaration: {
        name: 'getMySoldItems',
        description:
          'User only. Returns the signed-in user sold items.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      },
      async execute(args, context) {
        const soldItems = await loadMySoldItems(
          context.userId,
          normalizePositiveInteger(args.limit) ?? USER_TOOL_LIMIT
        );

        return {
          name: 'getMySoldItems',
          status: 'completed',
          summary: `Loaded ${soldItems.length} sold item(s).`,
          payload: soldItems,
        };
      },
    },
    findMyOrderById: {
      allowedRoles: ['user'],
      declaration: {
        name: 'findMyOrderById',
        description:
          'User only. Finds an accessible sold order by order id, accepted offer id, or listing id.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
      async execute(args, context) {
        const orderId = ensureValue(
          normalizeString(args.orderId) || context.selectedEntityContext?.orderId,
          'Please share the order ID you want me to check.'
        );

        const directListing = await loadAccessibleSoldListingByListingId(context.userId, orderId);
        if (directListing) {
          return {
            name: 'findMyOrderById',
            status: 'completed',
            summary: 'Found a sold order that matches that ID.',
            payload: {
              listing: directListing,
              matchedBy: 'listing',
              orderId,
            },
          };
        }

        const acceptedOffer = await loadAccessibleSoldListingByOfferId(context.userId, orderId);
        if (acceptedOffer) {
          return {
            name: 'findMyOrderById',
            status: 'completed',
            summary: 'Found an accepted order that matches that offer ID.',
            payload: {
              listing: acceptedOffer.listing,
              matchedBy: 'offer',
              orderId: acceptedOffer.offerId,
            },
          };
        }

        throw new AssistantToolBlockedError('I could not find an accessible order with that ID.');
      },
    },
    findMyOrderByListingId: {
      allowedRoles: ['user'],
      declaration: {
        name: 'findMyOrderByListingId',
        description:
          'User only. Finds the signed-in user sold order or purchase using a listing ID.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
          },
        },
      },
      async execute(args, context) {
        const listingId = ensureValue(
          normalizeString(args.listingId) || context.selectedEntityContext?.listingId,
          'Please share the listing ID you want me to check.'
        );

        const listing = await loadAccessibleSoldListingByListingId(context.userId, listingId);
        if (!listing) {
          throw new AssistantToolBlockedError('I could not find a sold order for that listing ID.');
        }

        return {
          name: 'findMyOrderByListingId',
          status: 'completed',
          summary: 'Found the order for that listing ID.',
          payload: listing,
        };
      },
    },
    findMyConversationWithUser: {
      allowedRoles: ['user'],
      declaration: {
        name: 'findMyConversationWithUser',
        description:
          'User only. Finds an accessible conversation with another user or for a selected listing.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            username: { type: 'string' },
            listingId: { type: 'string' },
          },
        },
      },
      async execute(args, context) {
        const listingId = normalizeString(args.listingId) || context.selectedEntityContext?.listingId;
        const userId = normalizeString(args.userId) || context.selectedEntityContext?.userId;
        const username = normalizeString(args.username);

        if (!listingId && !userId && !username) {
          throw new AssistantToolBlockedError(
            'Tell me which user or listing the conversation is about so I can find it.'
          );
        }

        const conversations = await loadConversations(context.userId, listingId, userId, username);

        return {
          name: 'findMyConversationWithUser',
          status: 'completed',
          summary: `Found ${conversations.length} matching conversation(s).`,
          payload: conversations,
        };
      },
    },
    getMyOfferStatus: {
      allowedRoles: ['user'],
      declaration: {
        name: 'getMyOfferStatus',
        description:
          'User only. Returns recent offer or purchase request statuses for the signed-in user.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
          },
        },
      },
      async execute(args, context) {
        const offers = await loadOfferStatus(
          context.userId,
          normalizeString(args.listingId) || context.selectedEntityContext?.listingId
        );

        return {
          name: 'getMyOfferStatus',
          status: 'completed',
          summary: `Loaded ${offers.length} offer status record(s).`,
          payload: offers,
        };
      },
    },
    createReportDraft: {
      allowedRoles: ['user'],
      declaration: {
        name: 'createReportDraft',
        description:
          'User only. Creates or updates a report draft for a listing without submitting it. Use this when the user wants to report a scam or marketplace issue.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
            reason: {
              type: 'string',
              enum: REPORT_REASONS,
            },
            details: { type: 'string' },
          },
        },
      },
      async execute(args, context) {
        const listingId =
          normalizeString(args.listingId) || context.selectedEntityContext?.listingId || context.latestReportDraft?.listingId || undefined;
        const reason = parseReportReason(args.reason) || context.latestReportDraft?.reason || null;
        const details =
          normalizeString(args.details) ||
          context.latestReportDraft?.details ||
          context.message ||
          '';

        const listing = listingId ? await inspectListingForDraft(listingId) : null;
        const draft = buildReportDraft(listing, context.userId, reason, details);

        return {
          name: 'createReportDraft',
          status: 'completed',
          summary: draft.readyToSubmit
            ? 'Prepared a report draft that is ready for confirmation.'
            : 'Prepared a report draft and identified what is still missing.',
          payload: draft,
        };
      },
    },
    submitReport: {
      allowedRoles: ['user'],
      declaration: {
        name: 'submitReport',
        description:
          'User only. Submits the latest ready report draft after explicit confirmation. Do not use this unless the user clearly confirms they want to submit the report.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
            reason: {
              type: 'string',
              enum: REPORT_REASONS,
            },
            details: { type: 'string' },
          },
        },
      },
      async execute(args, context) {
        if (!context.hasExplicitReportConfirmation) {
          throw new AssistantToolBlockedError(
            'Report submission needs your explicit confirmation. Review the draft first, then confirm when you are ready.'
          );
        }

        const listingId =
          normalizeString(args.listingId) || context.latestReportDraft?.listingId || context.selectedEntityContext?.listingId || undefined;
        const reason =
          parseReportReason(args.reason) || context.latestReportDraft?.reason || null;
        const details =
          normalizeString(args.details) || context.latestReportDraft?.details || '';

        const safeListingId = ensureValue(
          listingId,
          'I do not have a report draft ready yet. Start by telling me which listing you want to report.'
        );

        if (!reason) {
          throw new AssistantToolBlockedError('The report draft still needs a reason before submission.');
        }

        if (!details.trim() || details.trim().length < 20) {
          throw new AssistantToolBlockedError(
            'The report draft still needs a bit more detail before submission.'
          );
        }

        const createdReport = await createListingReport({
          listingId: safeListingId,
          reporterId: context.userId,
          reason,
          details,
        });

        return {
          name: 'submitReport',
          status: 'completed',
          summary: 'Submitted the report successfully.',
          payload: {
            report: createdReport,
            draft: {
              ...(context.latestReportDraft ?? {
                listingId: safeListingId,
                listingTitle: null,
                listingImagePath: null,
                reason,
                reasonLabel: REPORT_REASON_LABELS[reason],
                details,
                readyToSubmit: false,
                missingFields: [],
                guidance: '',
                safetyNote: '',
              }),
              submitted: true,
              readyToSubmit: false,
            } satisfies AssistantReportDraftCard,
          },
        };
      },
    },
    getSalesToday: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getSalesToday',
        description:
          'Admin only. Returns the sold items count and sales value for today.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      async execute() {
        const range = getTodayRange();
        const sales = await loadSalesInRange(range);
        const totalValue = sales.reduce((sum, sale) => sum + toFiniteNumber(sale.price), 0);

        return {
          name: 'getSalesToday',
          status: 'completed',
          summary: `Loaded today's sales totals for ${sales.length} sold item(s).`,
          payload: {
            range,
            count: sales.length,
            totalValue,
          },
        };
      },
    },
    getSalesByDateRange: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getSalesByDateRange',
        description:
          'Admin only. Returns the sold items count and sales value for a date range.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'YYYY-MM-DD' },
            endDate: { type: 'string', description: 'YYYY-MM-DD' },
            label: { type: 'string', description: 'Optional display label for the selected range.' },
          },
        },
      },
      async execute(args) {
        const startDate = ensureValue(
          normalizeString(args.startDate),
          'Please provide a start date in YYYY-MM-DD format.'
        );
        const endDate = ensureValue(
          normalizeString(args.endDate),
          'Please provide an end date in YYYY-MM-DD format.'
        );
        const range = getCustomDateRange(startDate, endDate, normalizeString(args.label));
        const sales = await loadSalesInRange(range);

        return {
          name: 'getSalesByDateRange',
          status: 'completed',
          summary: `Loaded ${sales.length} sale(s) for the selected date range.`,
          payload: {
            range,
            count: sales.length,
            totalValue: sales.reduce((sum, sale) => sum + toFiniteNumber(sale.price), 0),
          },
        };
      },
    },
    getActiveListingsCount: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getActiveListingsCount',
        description:
          'Admin only. Returns the current count of active marketplace listings.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      async execute() {
        const count = await getActiveListingsCount();

        return {
          name: 'getActiveListingsCount',
          status: 'completed',
          summary: `Loaded the active listings count: ${count}.`,
          payload: {
            count,
          },
        };
      },
    },
    getTopCategories: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getTopCategories',
        description:
          'Admin only. Returns the top listing categories by marketplace listing volume.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      },
      async execute(args) {
        const categories = await loadTopCategories(normalizePositiveInteger(args.limit) ?? 5);

        return {
          name: 'getTopCategories',
          status: 'completed',
          summary: `Loaded ${categories.length} top categor${categories.length === 1 ? 'y' : 'ies'}.`,
          payload: categories,
        };
      },
    },
    getTopStates: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getTopStates',
        description:
          'Admin only. Returns the top states by marketplace listing volume.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      },
      async execute(args) {
        const states = await loadTopStates(normalizePositiveInteger(args.limit) ?? 5);

        return {
          name: 'getTopStates',
          status: 'completed',
          summary: `Loaded ${states.length} top state entr${states.length === 1 ? 'y' : 'ies'}.`,
          payload: states,
        };
      },
    },
    getPendingReportsCount: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getPendingReportsCount',
        description:
          'Admin only. Returns the current count of pending marketplace reports.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      async execute() {
        const count = await getPendingReportsCountInternal();

        return {
          name: 'getPendingReportsCount',
          status: 'completed',
          summary: `Loaded the pending reports count: ${count}.`,
          payload: {
            count,
          },
        };
      },
    },
    getRecentReports: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getRecentReports',
        description:
          'Admin only. Returns the most recent marketplace reports.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      },
      async execute(args) {
        const reports = await loadRecentReports(normalizePositiveInteger(args.limit) ?? 5);

        return {
          name: 'getRecentReports',
          status: 'completed',
          summary: `Loaded ${reports.length} recent report(s).`,
          payload: reports,
        };
      },
    },
    getPausedListings: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getPausedListings',
        description:
          'Admin only. Returns paused marketplace listings.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      },
      async execute(args) {
        const listings = await loadPausedListings(normalizePositiveInteger(args.limit) ?? USER_TOOL_LIMIT);

        return {
          name: 'getPausedListings',
          status: 'completed',
          summary: `Loaded ${listings.length} paused listing(s).`,
          payload: listings,
        };
      },
    },
    getNewUsers: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getNewUsers',
        description:
          'Admin only. Returns new user signups for this week.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['this_week'],
            },
          },
        },
      },
      async execute() {
        const range = getCurrentWeekRange();
        const users = await loadNewUsers(range);

        return {
          name: 'getNewUsers',
          status: 'completed',
          summary: `Loaded ${users.length} new user(s) for ${range.label}.`,
          payload: {
            range,
            users,
            count: users.length,
          },
        };
      },
    },
    getMarketplaceSummary: {
      allowedRoles: ['admin'],
      declaration: {
        name: 'getMarketplaceSummary',
        description:
          'Admin only. Returns a short marketplace summary including active listings count, sold items today, pending reports, and the top category.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      async execute() {
        const todayRange = getTodayRange();
        const [activeListings, pendingReports, salesToday, topCategories] = await Promise.all([
          getActiveListingsCount(),
          getPendingReportsCountInternal(),
          loadSalesInRange(todayRange),
          loadTopCategories(1),
        ]);

        return {
          name: 'getMarketplaceSummary',
          status: 'completed',
          summary: 'Loaded the current marketplace summary.',
          payload: {
            activeListings,
            pendingReports,
            salesTodayCount: salesToday.length,
            salesTodayValue: salesToday.reduce((sum, sale) => sum + toFiniteNumber(sale.price), 0),
            topCategory: topCategories[0] ?? null,
          },
        };
      },
    },
  };
}

function formatExecution(
  execution: ToolExecutionResult,
  context: AssistantContext,
  model: string,
  options?: {
    lastIntent?: AssistantIntent;
    quickReplies?: AssistantQuickReply[];
    pendingAction?: AssistantPendingAction | null;
  }
): AssistantResponse {
  const note = buildRequestedRoleNote(context);
  const toolCalls: AssistantToolCallSummary[] = [
    {
      name: execution.name,
      status: execution.status,
      summary: execution.summary,
    },
  ];

  if (execution.status !== 'completed') {
    const text = combineText(note, execution.summary);

    return createAssistantResponse({
      context,
      model,
      route: 'tool',
      blocks: [createTextBlock(text), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
      toolCalls,
      action: {
        type: 'tool_result',
        payload: {
          toolName: execution.name,
          status: execution.status,
        },
      },
      quickReplies: options?.quickReplies,
      pendingAction: options?.pendingAction,
      lastIntent: options?.lastIntent,
      message: text,
    });
  }

  const blocks: AssistantResponseBlock[] = [];
  let requiresConfirmation = false;

  switch (execution.name) {
    case 'getMyOrders': {
      const payload = execution.payload as {
        purchases: RawListingOrder[];
        soldItems: RawListingOrder[];
      };
      const orderCards = [
        ...payload.purchases.map((item) => mapListingToOrderCard(item, 'purchase')),
        ...payload.soldItems.map((item) => mapListingToOrderCard(item, 'sale')),
      ].slice(0, USER_TOOL_LIMIT);

      blocks.push(
        createTextBlock(
          combineText(
            note,
            `You currently have ${payload.purchases.length} purchase(s) and ${payload.soldItems.length} sold item(s) in the marketplace record.`
          )
        )
      );

      if (orderCards.length > 0) {
        blocks.push({
          type: 'order_cards',
          items: orderCards,
        });
      }
      break;
    }
    case 'getMyPurchases': {
      const purchases = execution.payload as RawListingOrder[];
      blocks.push(
        createTextBlock(
          combineText(
            note,
            purchases.length > 0
              ? `I found ${purchases.length} purchase(s) for your account.`
              : 'You do not have any completed purchases yet.'
          )
        )
      );

      if (purchases.length > 0) {
        blocks.push({
          type: 'order_cards',
          items: purchases.map((item) => mapListingToOrderCard(item, 'purchase')),
        });
      }
      break;
    }
    case 'getMySoldItems': {
      const soldItems = execution.payload as RawListingOrder[];
      blocks.push(
        createTextBlock(
          combineText(
            note,
            soldItems.length > 0
              ? `I found ${soldItems.length} sold item(s) for your account.`
              : 'You do not have any completed sales yet.'
          )
        )
      );

      if (soldItems.length > 0) {
        blocks.push({
          type: 'order_cards',
          items: soldItems.map((item) => mapListingToOrderCard(item, 'sale')),
        });
      }
      break;
    }
    case 'findMyOrderById': {
      const payload = execution.payload as {
        listing: RawListingOrder;
        matchedBy: 'listing' | 'offer';
        orderId: string;
      };
      const perspective =
        payload.listing.seller_id === context.userId ? 'sale' : 'purchase';

      blocks.push(
        createTextBlock(
          combineText(
            note,
            payload.matchedBy === 'offer'
              ? 'I found your order by accepted offer ID.'
              : 'I found your order by listing ID.'
          )
        )
      );
      blocks.push({
        type: 'order_cards',
        items: [
          mapListingToOrderCard(
            payload.listing,
            perspective,
            payload.orderId
          ),
        ],
      });
      break;
    }
    case 'findMyOrderByListingId': {
      const listing = execution.payload as RawListingOrder;
      const perspective = listing.seller_id === context.userId ? 'sale' : 'purchase';

      blocks.push(
        createTextBlock(combineText(note, 'I found the order for that listing.'))
      );
      blocks.push({
        type: 'order_cards',
        items: [mapListingToOrderCard(listing, perspective)],
      });
      break;
    }
    case 'findMyConversationWithUser': {
      const conversations = execution.payload as RawConversationLookup[];
      const listingCards = conversations.map((conversation) => {
        const listing = unwrapRelation(conversation.listings);
        const otherUser =
          conversation.buyer_id === context.userId
            ? unwrapRelation(conversation.seller_profile)
            : unwrapRelation(conversation.buyer_profile);

        return {
          id: `conversation-${conversation.id}`,
          listingId: listing?.id ?? conversation.listing_id,
          title: listing?.title ?? 'Conversation',
          statusLabel: 'Conversation',
          price: 'Open',
          subtitle: buildDisplayName(otherUser),
          imagePath: buildListingImagePath(listing?.cover_image_path),
          meta: [`Updated: ${formatDateTime(conversation.last_message_at)}`],
        } satisfies AssistantListingCard;
      });

      blocks.push(
        createTextBlock(
          combineText(
            note,
            conversations.length > 0
              ? `I found ${conversations.length} matching conversation(s).`
              : 'I could not find a matching conversation yet.'
          )
        )
      );

      if (listingCards.length > 0) {
        blocks.push({
          type: 'listing_cards',
          items: listingCards,
        });
      }
      break;
    }
    case 'getMyOfferStatus': {
      const offers = execution.payload as RawOffer[];
      blocks.push(
        createTextBlock(
          combineText(
            note,
            offers.length > 0
              ? `Here are your latest ${offers.length} offer status update(s).`
              : 'I could not find any offer activity that matches this request.'
          )
        )
      );

      if (offers.length > 0) {
        blocks.push({
          type: 'listing_cards',
          items: offers.map((offer) => mapOfferToListingCard(offer, context.userId)),
        });
      }
      break;
    }
    case 'createReportDraft': {
      const draft = execution.payload as AssistantReportDraftCard;
      blocks.push(
        createTextBlock(
          combineText(
            note,
            draft.readyToSubmit
              ? 'Your report draft is ready. Review it below, then confirm if you want me to submit it.'
              : draft.guidance
          )
        )
      );
      blocks.push({
        type: 'report_draft_card',
        draft,
      });

      if (draft.readyToSubmit) {
        const confirmationBlock: AssistantConfirmationPromptBlock = {
          type: 'confirmation_prompt',
          action: 'submit_report',
          prompt: 'Submit this report to the admin team?',
          confirmLabel: 'Submit report',
          confirmMessage: 'Yes, submit the report.',
          cancelLabel: 'Keep editing',
          cancelMessage: 'Not yet. I want to edit the report.',
        };
        blocks.push(confirmationBlock);
        requiresConfirmation = true;
      }
      break;
    }
    case 'submitReport': {
      const payload = execution.payload as {
        report: {
          id: string;
          listingId: string;
          reason: ReportReason;
          status: string;
          createdAt: string;
        };
        draft: AssistantReportDraftCard;
      };

      blocks.push(
        createTextBlock(
          combineText(
            note,
            `Your report has been submitted successfully and is now pending admin review. Report ID: ${payload.report.id}.`
          )
        )
      );
      blocks.push({
        type: 'report_draft_card',
        draft: payload.draft,
      });
      break;
    }
    case 'getSalesToday': {
      const payload = execution.payload as {
        count: number;
        totalValue: number;
      };
      const statCards: AssistantStatCard[] = [
        {
          id: 'sales-today-count',
          label: 'Sold Today',
          value: String(payload.count),
          description: 'Completed sold listings today',
          tone: 'positive',
        },
        {
          id: 'sales-today-value',
          label: 'Sales Value',
          value: formatCurrency(payload.totalValue),
          description: 'Total value of today sold listings',
        },
      ];

      blocks.push(
        createTextBlock(
          combineText(note, `The marketplace recorded ${payload.count} sold item(s) today.`)
        )
      );
      blocks.push({
        type: 'stat_cards',
        items: statCards,
      });
      break;
    }
    case 'getSalesByDateRange': {
      const payload = execution.payload as {
        range: QueryDateRange;
        count: number;
        totalValue: number;
      };
      blocks.push(
        createTextBlock(
          combineText(
            note,
            `From ${payload.range.label}, the marketplace recorded ${payload.count} sold item(s).`
          )
        )
      );
      blocks.push({
        type: 'stat_cards',
        items: [
          {
            id: 'range-sales-count',
            label: 'Sold Items',
            value: String(payload.count),
            description: payload.range.label,
            tone: 'positive',
          },
          {
            id: 'range-sales-value',
            label: 'Sales Value',
            value: formatCurrency(payload.totalValue),
            description: payload.range.label,
          },
        ],
      });
      break;
    }
    case 'getActiveListingsCount': {
      const payload = execution.payload as { count: number };
      blocks.push(
        createTextBlock(
          combineText(note, `There are currently ${payload.count} active listing(s) in the marketplace.`)
        )
      );
      blocks.push({
        type: 'stat_cards',
        items: [
          {
            id: 'active-listings',
            label: 'Active Listings',
            value: String(payload.count),
            description: 'Currently visible inventory',
          },
        ],
      });
      break;
    }
    case 'getTopCategories': {
      const categories = execution.payload as Array<{ id: number; name: string; count: number }>;
      blocks.push(
        createTextBlock(
          combineText(
            note,
            categories.length > 0
              ? 'These are the top categories by marketplace listing volume.'
              : 'I could not find category volume data right now.'
          )
        )
      );

      if (categories.length > 0) {
        blocks.push({
          type: 'stat_cards',
          items: categories.map((category) => ({
            id: `category-${category.id}`,
            label: category.name,
            value: String(category.count),
            description: 'Listings',
          })),
        });
      }
      break;
    }
    case 'getTopStates': {
      const states = execution.payload as Array<{ id: number; name: string; count: number }>;
      blocks.push(
        createTextBlock(
          combineText(
            note,
            states.length > 0
              ? 'These are the top states by marketplace listing volume.'
              : 'I could not find state volume data right now.'
          )
        )
      );

      if (states.length > 0) {
        blocks.push({
          type: 'stat_cards',
          items: states.map((state) => ({
            id: `state-${state.id}`,
            label: state.name,
            value: String(state.count),
            description: 'Listings',
          })),
        });
      }
      break;
    }
    case 'getPendingReportsCount': {
      const payload = execution.payload as { count: number };
      blocks.push(
        createTextBlock(
          combineText(note, `There are currently ${payload.count} pending report(s).`)
        )
      );
      blocks.push({
        type: 'stat_cards',
        items: [
          {
            id: 'pending-reports',
            label: 'Pending Reports',
            value: String(payload.count),
            description: 'Still awaiting admin review',
            tone: payload.count > 0 ? 'warning' : 'neutral',
          },
        ],
      });
      break;
    }
    case 'getRecentReports': {
      const reports = execution.payload as RawReportLookup[];
      blocks.push(
        createTextBlock(
          combineText(
            note,
            reports.length > 0
              ? 'Here are the most recent marketplace reports.'
              : 'There are no recent reports to show right now.'
          )
        )
      );

      if (reports.length > 0) {
        blocks.push({
          type: 'listing_cards',
          items: reports.map((report) => ({
            id: `report-${report.id}`,
            listingId: unwrapRelation(report.listings)?.id ?? report.id,
            title: unwrapRelation(report.listings)?.title ?? 'Reported listing',
            statusLabel: report.status.charAt(0).toUpperCase() + report.status.slice(1),
            price: REPORT_REASON_LABELS[report.reason],
            subtitle: `Report ID ${report.id}`,
            imagePath: null,
            meta: [`Created: ${formatDateTime(report.created_at)}`],
          })),
        });
      }
      break;
    }
    case 'getPausedListings': {
      const listings = execution.payload as RawListingOrder[];
      blocks.push(
        createTextBlock(
          combineText(
            note,
            listings.length > 0
              ? `I found ${listings.length} paused listing(s).`
              : 'There are no paused listings right now.'
          )
        )
      );

      if (listings.length > 0) {
        blocks.push({
          type: 'listing_cards',
          items: listings.map((listing) => ({
            id: `paused-${listing.id}`,
            listingId: listing.id,
            title: listing.title,
            statusLabel: 'Paused',
            price: formatCurrency(listing.price, listing.currency || 'MYR'),
            subtitle: unwrapRelation(listing.states)?.name ?? 'No state',
            imagePath: buildListingImagePath(listing.cover_image_path),
            meta: [`Updated: ${formatDateTime(listing.sold_at || listing.created_at)}`],
          })),
        });
      }
      break;
    }
    case 'getNewUsers': {
      const payload = execution.payload as {
        range: QueryDateRange;
        count: number;
        users: AssistantActorProfile[];
      };
      blocks.push(
        createTextBlock(
          combineText(
            note,
            `${payload.count} new user(s) signed up ${payload.range.label}.`
          )
        )
      );
      blocks.push({
        type: 'stat_cards',
        items: [
          {
            id: 'new-users',
            label: 'New Users',
            value: String(payload.count),
            description: payload.range.label,
            tone: 'positive',
          },
        ],
      });
      break;
    }
    case 'getMarketplaceSummary': {
      const payload = execution.payload as {
        activeListings: number;
        pendingReports: number;
        salesTodayCount: number;
        salesTodayValue: number;
        topCategory: { id: number; name: string; count: number } | null;
      };
      blocks.push(
        createTextBlock(
          combineText(
            note,
            `Here is the current marketplace snapshot: ${payload.activeListings} active listing(s), ${payload.salesTodayCount} sold today, and ${payload.pendingReports} pending report(s).`
          )
        )
      );
      blocks.push({
        type: 'stat_cards',
        items: [
          {
            id: 'summary-active-listings',
            label: 'Active Listings',
            value: String(payload.activeListings),
            description: 'Currently visible inventory',
          },
          {
            id: 'summary-sales-today',
            label: 'Sold Today',
            value: String(payload.salesTodayCount),
            description: formatCurrency(payload.salesTodayValue),
            tone: 'positive',
          },
          {
            id: 'summary-pending-reports',
            label: 'Pending Reports',
            value: String(payload.pendingReports),
            description: 'Awaiting admin review',
            tone: payload.pendingReports > 0 ? 'warning' : 'neutral',
          },
          {
            id: 'summary-top-category',
            label: 'Top Category',
            value: payload.topCategory?.name ?? 'None',
            description: payload.topCategory ? `${payload.topCategory.count} listings` : 'No category data',
          },
        ],
      });
      break;
    }
    default: {
      blocks.push(createTextBlock(combineText(note, execution.summary)));
      break;
    }
  }

  blocks.push(createQuickActionsBlock(context.actualRole, context.selectedEntityContext));

  return createAssistantResponse({
    context,
    model,
    route: 'tool',
    blocks,
    toolCalls,
    requiresConfirmation,
    action: {
      type: 'tool_result',
      payload: {
        toolName: execution.name,
        status: execution.status,
      },
    },
    quickReplies: options?.quickReplies,
    pendingAction: options?.pendingAction,
    lastIntent: options?.lastIntent,
  });
}

function buildDirectResponse(
  text: string | undefined,
  context: AssistantContext,
  model: string,
  options?: {
    lastIntent?: AssistantIntent;
    quickReplies?: AssistantQuickReply[];
    pendingAction?: AssistantPendingAction | null;
    requiresConfirmation?: boolean;
  }
): AssistantResponse {
  const note = buildRequestedRoleNote(context);
  const resolvedText =
    normalizeString(text) ||
    (context.actualRole === 'admin'
      ? 'Ask for sales, pending reports, active listings, or top categories whenever you want a quick admin snapshot.'
      : 'I can help with purchases, sold items, reports, offer status, listing actions, and writing a listing.');

  const message = combineText(note, resolvedText);

  return createAssistantResponse({
    context,
    model,
    route: 'direct',
    blocks: [createTextBlock(message), createQuickActionsBlock(context.actualRole, context.selectedEntityContext)],
    toolCalls: [],
    quickReplies: options?.quickReplies,
    requiresConfirmation: options?.requiresConfirmation,
    pendingAction: options?.pendingAction,
    lastIntent: options?.lastIntent,
    message,
  });
}

function getAvailableToolDeclarations(
  registry: Record<string, AssistantToolDefinition>,
  role: AssistantRole
): FunctionDeclaration[] {
  return Object.values(registry)
    .filter((definition) => definition.allowedRoles.includes(role))
    .map((definition) => definition.declaration);
}

function validateMessage(message: unknown): string {
  if (typeof message !== 'string' || !message.trim()) {
    throw new AssistantServiceError('message is required', 422);
  }

  const trimmed = message.trim();
  if (trimmed.length > 2000) {
    throw new AssistantServiceError('message must be 2000 characters or fewer', 422);
  }

  return trimmed;
}

function validateRole(value: unknown): AssistantRole {
  if (value !== 'user' && value !== 'admin') {
    throw new AssistantServiceError('userRole must be either user or admin', 422);
  }

  return value;
}

function sanitizeRoleContext(value: unknown, fallback: AssistantRole): AssistantRoleContext {
  if (value === 'user' || value === 'seller' || value === 'admin') {
    return value;
  }

  return fallback === 'admin' ? 'admin' : 'user';
}

function sanitizeCurrentPageContext(
  value: unknown
): AssistantCurrentPageContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;

  return {
    path: normalizeString(candidate.path),
    title: normalizeString(candidate.title),
    section: normalizeString(candidate.section),
    pageType: normalizeString(candidate.pageType),
  };
}

function sanitizeSelectedEntityContext(
  value: unknown
): AssistantSelectedEntityContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;

  return {
    listingId: normalizeString(candidate.listingId),
    conversationId: normalizeString(candidate.conversationId),
    orderId: normalizeString(candidate.orderId),
    reportId: normalizeString(candidate.reportId),
    userId: normalizeString(candidate.userId),
  };
}

function isAssistantIntent(value: unknown): value is AssistantIntent {
  switch (value) {
    case 'go_to_add_listing':
    case 'open_messages':
    case 'open_profile':
    case 'open_settings':
    case 'open_my_listings':
    case 'open_offers':
    case 'open_browse':
    case 'open_support':
    case 'open_admin_analytics':
    case 'open_admin_reports':
    case 'open_admin_messages':
    case 'open_admin_users':
    case 'show_my_purchases':
    case 'show_my_sold_items':
    case 'show_my_orders':
    case 'show_admin_sales_today':
    case 'show_admin_sales_yesterday':
    case 'show_admin_revenue_yesterday':
    case 'show_admin_profit_yesterday':
    case 'report_problem':
    case 'unknown':
      return true;
    default:
      return false;
  }
}

function sanitizePendingAction(value: unknown): AssistantPendingAction | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type =
    candidate.type === 'navigate' ||
      candidate.type === 'report_scope' ||
      candidate.type === 'report_order_selection'
      ? candidate.type
      : null;
  const intent = isAssistantIntent(candidate.intent) ? candidate.intent : 'unknown';
  const step = normalizeString(candidate.step) || 'pending';

  if (!type) {
    return null;
  }

  return {
    type,
    intent,
    step,
    target: normalizeString(candidate.target),
    label: normalizeString(candidate.label),
    payload:
      candidate.payload && typeof candidate.payload === 'object'
        ? (candidate.payload as Record<string, unknown>)
        : undefined,
  };
}

function sanitizeThreadState(
  value: unknown,
  fallbackThreadId: string
): AssistantThreadState {
  if (!value || typeof value !== 'object') {
    return {
      threadId: fallbackThreadId,
      pendingAction: null,
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    threadId: normalizeString(candidate.threadId) || fallbackThreadId,
    lastIntent: isAssistantIntent(candidate.lastIntent) ? candidate.lastIntent : undefined,
    pendingAction: sanitizePendingAction(candidate.pendingAction),
  };
}

function extractLatestThreadState(
  history: AssistantHistoryEntry[],
  fallbackThreadId: string
): AssistantThreadState {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.role !== 'assistant' || !entry.response?.threadState) {
      continue;
    }

    return sanitizeThreadState(entry.response.threadState, fallbackThreadId);
  }

  return {
    threadId: fallbackThreadId,
    pendingAction: null,
  };
}

function isAwaitingReportSubmission(history: AssistantHistoryEntry[]): boolean {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.role !== 'assistant' || !entry.response) {
      continue;
    }

    return entry.response.blocks.some(
      (block) => block.type === 'confirmation_prompt' && block.action === 'submit_report'
    );
  }

  return false;
}

function sanitizeHistory(value: unknown): AssistantHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sanitized: AssistantHistoryEntry[] = [];

  for (const item of value.slice(-12)) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : null;
    const message = normalizeString(entry.message);

    if (!role || !message) {
      continue;
    }

    sanitized.push({
      role,
      message,
      response:
        entry.response && typeof entry.response === 'object'
          ? (entry.response as AssistantResponse)
          : undefined,
      createdAt: normalizeString(entry.createdAt),
    });
  }

  return sanitized;
}

export async function chatWithAssistant(input: {
  requestId: string;
  userId: string;
  body: AssistantChatRequestBody;
}): Promise<AssistantResponse> {
  const message = validateMessage(input.body.message);
  const requestedRole = validateRole(input.body.userRole);
  const roleContext = sanitizeRoleContext(input.body.roleContext, requestedRole);
  const threadId =
    normalizeString(input.body.threadId) ||
    normalizeString(input.body.conversationId) ||
    input.requestId;
  const conversationId = normalizeString(input.body.conversationId);
  const currentPageContext = sanitizeCurrentPageContext(input.body.currentPageContext);
  const selectedEntityContext = sanitizeSelectedEntityContext(
    input.body.selectedEntityContext
  );
  const history = sanitizeHistory(input.body.history);
  const threadState = input.body.threadState
    ? sanitizeThreadState(input.body.threadState, threadId)
    : extractLatestThreadState(history, threadId);
  const actorProfile = await getAssistantActorProfile(input.userId);
  const latestReportDraft = extractLatestReportDraft(history);

  const context: AssistantContext = {
    requestId: input.requestId,
    threadId,
    conversationId,
    userId: input.userId,
    message,
    requestedRole,
    actualRole: actorProfile.role,
    roleContext,
    currentPageContext,
    selectedEntityContext,
    history,
    threadState: {
      threadId,
      lastIntent: threadState.lastIntent,
      pendingAction: threadState.pendingAction ?? null,
    },
    latestReportDraft,
    hasExplicitReportConfirmation: hasExplicitReportConfirmation(message),
  };

  const registry = getToolRegistry();
  const currentIntent = detectDeterministicIntent(context);

  const pendingActionResponse = await resolvePendingActionResponse(context, currentIntent);
  if (pendingActionResponse) {
    return pendingActionResponse;
  }

  if (context.hasExplicitReportConfirmation) {
    if (!context.latestReportDraft) {
      return buildDirectResponse(
        'I do not have a report draft ready yet. Tell me which listing you want to report and what happened, and I will prepare the draft first.',
        context,
        DEFAULT_ASSISTANT_MODEL,
        {
          lastIntent: 'report_problem',
        }
      );
    }

    if (context.latestReportDraft.readyToSubmit && isAwaitingReportSubmission(history)) {
      const execution = await executeTool(registry.submitReport, { name: 'submitReport', args: {} }, context);
      return formatExecution(execution, context, DEFAULT_ASSISTANT_MODEL, {
        lastIntent: 'report_problem',
      });
    }
  }

  const purchasePriceFeedbackResponse = buildPurchasePriceFeedbackResponse(context);
  if (purchasePriceFeedbackResponse) {
    return purchasePriceFeedbackResponse;
  }

  const supportDraftClarificationResponse = buildSupportDraftClarificationResponse(context);
  if (supportDraftClarificationResponse) {
    return supportDraftClarificationResponse;
  }

  const deterministicIntentResponse = await resolveDeterministicIntentResponse(context, currentIntent);
  if (deterministicIntentResponse) {
    return deterministicIntentResponse;
  }

  const intentToolCall = buildToolCallFromIntent(currentIntent);
  if (intentToolCall?.name) {
    const intentTool = registry[intentToolCall.name];

    if (intentTool) {
      const execution = await executeTool(intentTool, intentToolCall, context);
      return formatExecution(execution, context, DEFAULT_ASSISTANT_MODEL, {
        lastIntent: currentIntent,
      });
    }
  }

  const deterministicToolCall = resolveDeterministicAdminToolCall(context);

  if (deterministicToolCall?.name) {
    const deterministicTool = registry[deterministicToolCall.name];

    if (deterministicTool) {
      const execution = await executeTool(deterministicTool, deterministicToolCall, context);
      return formatExecution(execution, context, DEFAULT_ASSISTANT_MODEL, {
        lastIntent: currentIntent,
      });
    }
  }

  const tools = getAvailableToolDeclarations(registry, context.actualRole);
  const preferredModel = selectAssistantModel(context.actualRole, message);
  const prompt = buildPrompt(
    {
      message,
      userRole: requestedRole,
      conversationId,
      currentPageContext,
      selectedEntityContext,
      history,
      imageBase64: input.body.imageBase64,
      imageMimeType: input.body.imageMimeType,
    },
    context
  );
  const generated = await generateAssistantContent({
    model: preferredModel,
    fallbackModel:
      context.actualRole === 'admin' ? ADMIN_ANALYTICS_MODEL : null,
    contents: prompt,
    systemInstruction: buildPlannerSystemInstruction(context.actualRole),
    tools,
  });
  const model = generated.model;
  const response = generated.response;

  const functionCalls = response.functionCalls ?? [];

  if (functionCalls.length === 0) {
    return buildDirectResponse(response.text, context, model, {
      lastIntent: currentIntent,
    });
  }

  const selectedCall = functionCalls.find((call) => call.name && registry[call.name]) ?? functionCalls[0];
  const toolDefinition = selectedCall.name ? registry[selectedCall.name] : undefined;

  if (!toolDefinition) {
    return buildDirectResponse(
      'I could not determine the right assistant action for that request. Try asking for purchases, sold items, reports, sales today, or top categories.',
      context,
      model,
      {
        lastIntent: currentIntent,
      }
    );
  }

  const execution = await executeTool(toolDefinition, selectedCall, context);
  return formatExecution(execution, context, model, {
    lastIntent: currentIntent,
  });
}
