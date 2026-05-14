import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { buildDisplayName } from '../utils/profile';
import { unwrapRelation } from '../utils/relation';
import { sanitizeStorageFileName } from '../utils/storageFile';
import { getPublicStorageUrl, removeStorageObjects } from '../utils/storage';
import {
  AVATAR_BUCKET,
  LISTING_IMAGE_BUCKET,
  MESSAGE_ATTACHMENT_BUCKET,
} from '../utils/storageBuckets';
import { toNumber, trimOptional } from '../utils/value';
import {
  buildModerationListingTargetKey,
  isModerationListing,
  MODERATION_LISTING_BRAND,
  parseModerationListingTargetKey,
} from '../utils/moderationThread';
import { isAccountSuspended } from '../utils/accountStatus';
import {
  parseListingModerationMessage,
  toListingModerationDisplayText,
} from '../utils/listingModeration';
import { evaluateAutoNegotiationReply } from './autoNegotiationService';
import { createNotification } from './notificationService';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachments: MessageAttachment[];
  event: MessageEvent | null;
  is_read: boolean;
  created_at: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image';
  url: string;
  path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export interface MessageAttachmentInput {
  fileName: string;
  contentType: string;
  base64Data: string;
}

export type SupportTicketStatus = 'open' | 'resolved' | 'closed';

export interface MessageEvent {
  type: 'ticket_status';
  ticket_status: SupportTicketStatus;
  label: string;
}

export interface ConversationDetail {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  created_at: string;
  other_user: {
    id: string;
    display_name: string;
    username: string | null;
    avatar_path: string | null;
  } | null;
  listing_details: {
    title: string;
    cover_image_path: string | null;
    is_moderation: boolean;
    support_status: SupportTicketStatus | null;
  } | null;
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
    is_read: boolean;
  } | null;
  unread_count: number;
}

export interface SupportConversationResult {
  conversation_id: string;
  listing_id: string;
  listing_title: string;
  admin_id: string;
  admin_name: string;
  message: ChatMessage;
}

export interface SupportTicketStatusResult {
  conversation_id: string;
  status: SupportTicketStatus;
  message: ChatMessage;
}

interface RawProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_path: string | null;
}

interface RawAdminProfile extends RawProfile {
  role: string;
}

interface RawListing {
  seller_id?: string;
  title: string;
  cover_image_path: string | null;
  brand: string | null;
  price?: unknown;
  currency?: string | null;
  negotiable?: boolean | null;
  auto_negotiate_enabled?: boolean | null;
  auto_negotiate_floor_price?: unknown;
  status?: string | null;
  description?: string | null;
  deleted_at?: string | null;
}

interface MessagingActor {
  id: string;
  banned_until?: string | null;
  app_metadata?: {
    account_status?: unknown;
    [key: string]: unknown;
  } | null;
}

interface RawConversation {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  created_at: string;
  listings: RawListing | RawListing[] | null;
  buyer_profile: RawProfile | RawProfile[] | null;
  seller_profile: RawProfile | RawProfile[] | null;
}

interface RawSupportConversation {
  id: string;
  seller_id: string;
  listings:
    | Pick<RawListing, 'brand' | 'title' | 'status'>
    | Pick<RawListing, 'brand' | 'title' | 'status'>[]
    | null;
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface RawConversationNotificationContext {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  listings:
    | Pick<RawListing, 'title' | 'brand' | 'status' | 'description'>
    | Pick<RawListing, 'title' | 'brand' | 'status' | 'description'>[]
    | null;
}

const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, is_read, created_at';
const MESSAGE_ENVELOPE_PREFIX = '__remarket_message_v1__';
const SUPPORT_LISTING_TITLE_PREFIX = 'Support request:';
const MAX_MESSAGE_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGE_ATTACHMENTS = 3;
const MESSAGE_ATTACHMENT_MIME_TYPES = ['image/*'];

interface StoredMessageAttachment {
  id: string;
  type: 'image';
  path: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface StoredMessageEnvelope {
  text: string;
  attachments?: StoredMessageAttachment[];
  event?: MessageEvent | null;
}

let messageAttachmentBucketPromise: Promise<void> | null = null;

export class MessageServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'MessageServiceError';
    this.status = status;
  }
}

function buildSupportListingTitle(subject: string, targetDisplayName: string): string {
  const trimmedSubject = subject.trim();
  if (trimmedSubject) {
    return `${SUPPORT_LISTING_TITLE_PREFIX} ${trimmedSubject.slice(0, 72)}`;
  }

  const name = targetDisplayName.trim();
  return name ? `${SUPPORT_LISTING_TITLE_PREFIX} ${name}` : `${SUPPORT_LISTING_TITLE_PREFIX} Marketplace user`;
}

function isSupportListing(listing: Pick<RawListing, 'brand' | 'title'> | null | undefined): boolean {
  return Boolean(
    listing?.brand === MODERATION_LISTING_BRAND &&
      listing.title.startsWith(SUPPORT_LISTING_TITLE_PREFIX)
  );
}

// Support tickets still use listing rows for backward compatibility, so we keep a single
// translation layer between the support-status language and the legacy listing statuses.
function getSupportTicketStatusFromListingStatus(status: string | null | undefined): SupportTicketStatus {
  if (status === 'archived') {
    return 'closed';
  }

  if (status === 'reserved') {
    return 'resolved';
  }

  return 'open';
}

function getListingStatusForSupportTicketStatus(status: SupportTicketStatus): string {
  if (status === 'closed') {
    return 'archived';
  }

  if (status === 'resolved') {
    return 'reserved';
  }

  return 'draft';
}

function getSupportStatusLabel(status: SupportTicketStatus): string {
  switch (status) {
    case 'closed':
      return 'Ticket closed';
    case 'resolved':
      return 'Ticket marked as resolved';
    case 'open':
    default:
      return 'Ticket reopened';
  }
}

function assertValidMessagePayload(content: string, attachments: MessageAttachmentInput[] = []): void {
  if (!content.trim() && attachments.length === 0) {
    throw new MessageServiceError('Message text or an image is required', 422);
  }

  if (content.trim().length > 2000) {
    throw new MessageServiceError('Message must be 2000 characters or fewer', 422);
  }

  if (attachments.length > MAX_MESSAGE_ATTACHMENTS) {
    throw new MessageServiceError(
      `You can upload up to ${MAX_MESSAGE_ATTACHMENTS} images per message`,
      422
    );
  }
}

async function ensureMessageAttachmentBucket(): Promise<void> {
  if (!messageAttachmentBucketPromise) {
    messageAttachmentBucketPromise = (async () => {
      const bucketResult = await supabaseAdmin.storage.getBucket(MESSAGE_ATTACHMENT_BUCKET);

      if (bucketResult.data) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          MESSAGE_ATTACHMENT_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_MESSAGE_ATTACHMENT_SIZE_BYTES,
            allowedMimeTypes: MESSAGE_ATTACHMENT_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Messages] Failed to update message attachment bucket:', updateError);
          throw new MessageServiceError('Unable to prepare message image storage', 500);
        }

        return;
      }

      const bucketErrorMessage = bucketResult.error?.message ?? '';
      const isMissingBucketError = /not found|does not exist|404/i.test(bucketErrorMessage);
      if (bucketResult.error && !isMissingBucketError) {
        console.error('[Messages] Failed to inspect message attachment bucket:', bucketResult.error);
        throw new MessageServiceError('Unable to prepare message image storage', 500);
      }

      const { error: createError } = await supabaseAdmin.storage.createBucket(
        MESSAGE_ATTACHMENT_BUCKET,
        {
          public: true,
          fileSizeLimit: MAX_MESSAGE_ATTACHMENT_SIZE_BYTES,
          allowedMimeTypes: MESSAGE_ATTACHMENT_MIME_TYPES,
        }
      );

      if (createError && !/already exists/i.test(createError.message)) {
        console.error('[Messages] Failed to create message attachment bucket:', createError);
        throw new MessageServiceError('Unable to prepare message image storage', 500);
      }

      if (createError) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          MESSAGE_ATTACHMENT_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_MESSAGE_ATTACHMENT_SIZE_BYTES,
            allowedMimeTypes: MESSAGE_ATTACHMENT_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Messages] Failed to sync message attachment bucket settings:', updateError);
          throw new MessageServiceError('Unable to prepare message image storage', 500);
        }
      }
    })().catch((error) => {
      messageAttachmentBucketPromise = null;
      throw error;
    });
  }

  return messageAttachmentBucketPromise;
}

async function getFallbackCategoryId(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new MessageServiceError('Unable to prepare a support conversation', 500);
  }

  if (typeof data?.id !== 'number') {
    throw new MessageServiceError(
      'Create at least one category before support conversations can be created',
      422
    );
  }

  return data.id;
}

async function getSupportAdmins(): Promise<RawAdminProfile[]> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, username, avatar_path, role')
    .eq('role', 'admin')
    .order('created_at', { ascending: true });

  if (error) {
    throw new MessageServiceError('Unable to load support admins', 500);
  }

  return ((data ?? []) as RawAdminProfile[]).filter((admin) => admin.id);
}

async function chooseLeastLoadedSupportAdmin(requesterId: string): Promise<RawAdminProfile> {
  const admins = (await getSupportAdmins()).filter((admin) => admin.id !== requesterId);

  if (admins.length === 0) {
    throw new MessageServiceError('No support admins are available right now', 422);
  }

  const loadByAdminId = new Map(admins.map((admin) => [admin.id, 0]));
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      seller_id,
      listings!conversations_listing_id_fkey (
        brand,
        title,
        status
      )
    `)
    .in('seller_id', admins.map((admin) => admin.id));

  if (error) {
    throw new MessageServiceError('Unable to inspect admin support workload', 500);
  }

  for (const conversation of ((data ?? []) as RawSupportConversation[])) {
    const listing = unwrapRelation(conversation.listings);
    if (!listing) {
      continue;
    }

    if (
      isSupportListing(listing) &&
      getSupportTicketStatusFromListingStatus(listing.status) !== 'closed' &&
      loadByAdminId.has(conversation.seller_id)
    ) {
      loadByAdminId.set(conversation.seller_id, (loadByAdminId.get(conversation.seller_id) ?? 0) + 1);
    }
  }

  const lowestLoad = Math.min(...Array.from(loadByAdminId.values()));
  const leastLoadedAdmins = admins.filter((admin) => loadByAdminId.get(admin.id) === lowestLoad);
  const randomIndex = Math.floor(Math.random() * leastLoadedAdmins.length);

  return leastLoadedAdmins[randomIndex];
}

async function createSupportListing(
  adminUserId: string,
  targetUserId: string,
  targetDisplayName: string,
  subject: string
): Promise<{ id: string; title: string }> {
  const categoryId = await getFallbackCategoryId();
  const title = buildSupportListingTitle(subject, targetDisplayName);
  const { data: createdListing, error: createListingError } = await supabaseAdmin
    .from('listings')
    .insert({
      seller_id: adminUserId,
      category_id: categoryId,
      title,
      description: buildModerationListingTargetKey(targetUserId),
      brand: MODERATION_LISTING_BRAND,
      condition: 'good',
      price: 0,
      currency: 'MYR',
      negotiable: false,
      status: 'draft',
      state_id: null,
      area_id: null,
    })
    .select('id, title')
    .single();

  if (createListingError || !createdListing) {
    throw new MessageServiceError('Unable to create a support conversation', 500);
  }

  return {
    id: createdListing.id,
    title: createdListing.title,
  };
}

async function uploadMessageAttachments(
  senderId: string,
  attachments: MessageAttachmentInput[] = []
): Promise<StoredMessageAttachment[]> {
  if (attachments.length === 0) {
    return [];
  }

  await ensureMessageAttachmentBucket();

  const uploadedAttachments: StoredMessageAttachment[] = [];

  try {
    for (const attachment of attachments) {
      const fileName = trimOptional(attachment.fileName);
      const contentType = trimOptional(attachment.contentType)?.toLowerCase();
      const base64Data = trimOptional(attachment.base64Data)?.replace(/\s/g, '');

      if (!fileName || !contentType || !base64Data) {
        throw new MessageServiceError(
          'Image fileName, contentType, and base64Data are required',
          422
        );
      }

      if (!contentType.startsWith('image/')) {
        throw new MessageServiceError('Only image attachments are supported', 422);
      }

      let fileBuffer: Buffer;
      try {
        fileBuffer = Buffer.from(base64Data, 'base64');
      } catch {
        throw new MessageServiceError('Image data is not valid base64', 422);
      }

      if (fileBuffer.byteLength === 0) {
        throw new MessageServiceError('Image data is empty', 422);
      }

      if (fileBuffer.byteLength > MAX_MESSAGE_ATTACHMENT_SIZE_BYTES) {
        throw new MessageServiceError('Each message image must be 4 MB or smaller', 422);
      }

      const storagePath = `messages/${senderId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeStorageFileName(
        fileName,
        'message-image'
      )}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(MESSAGE_ATTACHMENT_BUCKET)
        .upload(storagePath, fileBuffer, {
          cacheControl: '3600',
          contentType,
          upsert: false,
        });

      if (uploadError) {
        console.error('[Messages] Failed to upload message image:', uploadError);
        throw new MessageServiceError('Unable to upload one of the message images', 500);
      }

      uploadedAttachments.push({
        id: randomUUID(),
        type: 'image',
        path: storagePath,
        fileName,
        contentType,
        sizeBytes: fileBuffer.byteLength,
      });
    }
  } catch (error) {
    try {
      await removeStorageObjects(
        MESSAGE_ATTACHMENT_BUCKET,
        uploadedAttachments.map((attachment) => attachment.path)
      );
    } catch (cleanupError) {
      console.error('[Messages] Failed to clean up uploaded message images:', cleanupError);
    }

    throw error;
  }

  return uploadedAttachments;
}

function buildStoredMessageBody(envelope: StoredMessageEnvelope): string {
  const text = envelope.text.trim();
  const attachments = envelope.attachments ?? [];

  if (attachments.length === 0 && !envelope.event) {
    return text;
  }

  return `${MESSAGE_ENVELOPE_PREFIX}${JSON.stringify({
    text,
    attachments,
    event: envelope.event ?? null,
  })}`;
}

function parseStoredMessageBody(body: string): StoredMessageEnvelope {
  if (!body.startsWith(MESSAGE_ENVELOPE_PREFIX)) {
    return {
      text: body,
      attachments: [],
      event: null,
    };
  }

  try {
    const parsed = JSON.parse(body.slice(MESSAGE_ENVELOPE_PREFIX.length)) as Partial<StoredMessageEnvelope>;
    const text = typeof parsed.text === 'string' ? parsed.text : '';
    const attachments = Array.isArray(parsed.attachments)
      ? parsed.attachments.filter(
          (attachment): attachment is StoredMessageAttachment =>
            attachment?.type === 'image' &&
            typeof attachment.path === 'string' &&
            typeof attachment.fileName === 'string' &&
            typeof attachment.contentType === 'string' &&
            typeof attachment.sizeBytes === 'number'
        )
      : [];
    const event =
      parsed.event?.type === 'ticket_status' &&
      ['open', 'resolved', 'closed'].includes(parsed.event.ticket_status)
        ? parsed.event
        : null;

    return { text, attachments, event };
  } catch {
    return {
      text: body,
      attachments: [],
      event: null,
    };
  }
}

function buildMessagePreview(envelope: StoredMessageEnvelope): string {
  const text = toListingModerationDisplayText(envelope.text).trim();

  if (text) {
    return text;
  }

  if (envelope.event) {
    return envelope.event.label;
  }

  if ((envelope.attachments ?? []).length > 0) {
    return envelope.attachments!.length === 1 ? 'Sent an image' : `Sent ${envelope.attachments!.length} images`;
  }

  return '';
}

function mapMessageRow(message: RawMessageRow): ChatMessage {
  const envelope = parseStoredMessageBody(message.body);

  return {
    id: message.id,
    conversation_id: message.conversation_id,
    sender_id: message.sender_id,
    content: buildMessagePreview(envelope),
    attachments: (envelope.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      url: getPublicStorageUrl(MESSAGE_ATTACHMENT_BUCKET, attachment.path) ?? '',
      path: attachment.path,
      file_name: attachment.fileName,
      content_type: attachment.contentType,
      size_bytes: attachment.sizeBytes,
    })),
    event: envelope.event ?? null,
    is_read: message.is_read,
    created_at: message.created_at,
  };
}

function toSingleLineNotificationText(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function buildConversationMessageLinkPath(
  conversationId: string,
  recipientId: string,
  conversation: Pick<RawConversationNotificationContext, 'buyer_id' | 'seller_id'>,
  listing: Pick<RawListing, 'brand' | 'title'> | null
): string {
  if (listing && isSupportListing(listing)) {
    return recipientId === conversation.seller_id
      ? '/admin/support'
      : '/dashboard/support';
  }

  if (listing && isModerationListing(listing)) {
    return recipientId === conversation.seller_id
      ? `/admin/messages?conversationId=${encodeURIComponent(conversationId)}`
      : `/dashboard/messages?conversationId=${encodeURIComponent(conversationId)}`;
  }

  return `/dashboard/messages?conversationId=${encodeURIComponent(conversationId)}`;
}

async function createConversationMessageNotification(
  senderId: string,
  conversationId: string,
  rawText: string,
  previewText: string
): Promise<void> {
  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      buyer_id,
      seller_id,
      listing_id,
      listings (
        title,
        brand,
        status,
        description
      )
    `)
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to inspect conversation for notifications: ${error.message}`);
  }

  if (!conversation) {
    return;
  }

  const conversationContext = conversation as RawConversationNotificationContext;
  const recipientId =
    conversationContext.buyer_id === senderId
      ? conversationContext.seller_id
      : conversationContext.buyer_id;

  if (!recipientId || recipientId === senderId) {
    return;
  }

  const listing = unwrapRelation(conversationContext.listings);
  const genericPreview = toSingleLineNotificationText(
    previewText,
    'You have a new message in one of your conversations.'
  );
  const linkPath = buildConversationMessageLinkPath(
    conversationId,
    recipientId,
    conversationContext,
    listing
  );

  if (listing && isModerationListing(listing)) {
    const parsedModerationMessage = parseListingModerationMessage(rawText);

    if (parsedModerationMessage) {
      let title = 'Listing moderation update';

      switch (parsedModerationMessage.eventType) {
        case 'paused':
          title = 'Listing paused by admin';
          break;
        case 'approved':
          title = 'Listing approved';
          break;
        case 'rejected':
          title = 'Listing needs more changes';
          break;
        case 'resubmitted':
          title = 'Listing resubmitted for review';
          break;
        case 'deleted':
          title = 'Listing removed by admin';
          break;
        default:
          title = 'Listing moderation update';
      }

      const moderationLinkPath =
        recipientId === conversationContext.seller_id
          ? `/admin/listings/${encodeURIComponent(parsedModerationMessage.listingId)}`
          : '/dashboard/my-listings';

      await createNotification({
        userId: recipientId,
        type: 'system',
        title,
        body: toSingleLineNotificationText(
          toListingModerationDisplayText(rawText),
          'There is a new update on one of your listings.'
        ),
        linkPath: moderationLinkPath,
      });

      return;
    }

    await createNotification({
      userId: recipientId,
      type: 'system',
      title: 'New moderation message',
      body: genericPreview,
      linkPath,
    });

    return;
  }

  if (listing && isSupportListing(listing)) {
    await createNotification({
      userId: recipientId,
      type: 'message',
      title:
        senderId === conversationContext.seller_id
          ? 'Support replied to your ticket'
          : 'New support ticket message',
      body: genericPreview,
      linkPath,
    });

    return;
  }

  await createNotification({
    userId: recipientId,
    type: 'message',
    title: `New message about "${listing?.title?.trim() || 'your listing'}"`,
    body: genericPreview,
    linkPath,
  });
}

async function assertMessagingAllowed(
  sender: MessagingActor,
  listing: Pick<RawListing, 'brand' | 'title'>
): Promise<void> {
  if (isModerationListing(listing)) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', sender.id)
    .maybeSingle();

  if (error) {
    throw new MessageServiceError('Unable to verify messaging access', 500);
  }

  if (data?.role === 'admin') {
    return;
  }

  if (!isAccountSuspended(sender)) {
    return;
  }

  throw new MessageServiceError(
    'Your account is suspended. You can still browse the marketplace, but new offers, listings, and messages are disabled until an admin reactivates your account.',
    403
  );
}

function assertModerationThreadAccess(
  senderId: string,
  listing: Pick<RawListing, 'seller_id' | 'brand' | 'description' | 'title'>,
  recipientId?: string
): void {
  if (!isModerationListing(listing)) {
    return;
  }

  const targetUserId = parseModerationListingTargetKey(listing.description);

  if (!targetUserId) {
    throw new MessageServiceError('This moderation thread is misconfigured', 500);
  }

  const isSeller = senderId === listing.seller_id;

  if (isSeller) {
    if (!recipientId || recipientId !== targetUserId) {
      throw new MessageServiceError(
        'This moderation thread can only contact its assigned user',
        403
      );
    }
    return;
  }

  if (senderId !== targetUserId) {
    throw new MessageServiceError('This moderation thread is not available for your account', 403);
  }
}

async function assertConversationAccess(userId: string, conversationId: string): Promise<void> {
  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      listings (
        deleted_at
      )
    `)
    .eq('id', conversationId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle();

  if (error || !conversation) {
    throw new MessageServiceError('Conversation not found or access denied', 403);
  }

  const listing = unwrapRelation(
    (conversation as { listings: { deleted_at: string | null }[] | { deleted_at: string | null } | null })
      .listings
  );
  if (!listing || listing.deleted_at !== null) {
    throw new MessageServiceError('Conversation not found or access denied', 403);
  }
}

export async function getConversationsForUser(userId: string): Promise<ConversationDetail[]> {
  const { data: convos, error: convosError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      buyer_id,
      seller_id,
      listing_id,
      created_at,
      listings (
        title,
        cover_image_path,
        brand,
        status,
        deleted_at
      ),
      buyer_profile:profiles!conversations_buyer_id_fkey (
        id,
        full_name,
        username,
        avatar_path
      ),
      seller_profile:profiles!conversations_seller_id_fkey (
        id,
        full_name,
        username,
        avatar_path
      )
    `)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (convosError) {
    throw new MessageServiceError('Unable to load conversations', 500);
  }

  const visibleConversations = ((convos ?? []) as RawConversation[]).filter(
    (convo) => unwrapRelation(convo.listings)?.deleted_at === null
  );
  const conversationIds = visibleConversations.map((convo) => convo.id);

  const [latestMessagesResult, unreadMessagesResult] = await Promise.all([
    conversationIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
        .from('messages')
        .select('conversation_id, body, created_at, sender_id, is_read')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false }),
    conversationIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId)
        .eq('is_read', false),
  ]);

  if (latestMessagesResult.error) {
    throw new MessageServiceError('Unable to load conversations', 500);
  }

  if (unreadMessagesResult.error) {
    throw new MessageServiceError('Unable to load conversations', 500);
  }

  const latestMessageMap = new Map<
    string,
    {
      body: string;
      created_at: string;
      sender_id: string;
      is_read: boolean;
    }
  >();

  for (const message of (latestMessagesResult.data ?? []) as Array<{
    conversation_id: string;
    body: string;
    created_at: string;
    sender_id: string;
    is_read: boolean;
  }>) {
    if (!latestMessageMap.has(message.conversation_id)) {
      latestMessageMap.set(message.conversation_id, message);
    }
  }

  const unreadCountMap = new Map<string, number>();
  for (const message of (unreadMessagesResult.data ?? []) as Array<{ conversation_id: string }>) {
    unreadCountMap.set(
      message.conversation_id,
      (unreadCountMap.get(message.conversation_id) ?? 0) + 1
    );
  }

  const detailedConvos: ConversationDetail[] = [];

  for (const convo of visibleConversations) {
    const otherProfile = convo.buyer_id === userId
      ? unwrapRelation(convo.seller_profile)
      : unwrapRelation(convo.buyer_profile);
    const latestMsgData = latestMessageMap.get(convo.id) ?? null;
    const unreadCount = unreadCountMap.get(convo.id) ?? 0;

    let listingDetails = null;
    const listingData = unwrapRelation(convo.listings);
    if (listingData) {
         listingDetails = {
           title: listingData.title,
           cover_image_path: getPublicStorageUrl(
             LISTING_IMAGE_BUCKET,
             listingData.cover_image_path
           ),
           is_moderation: isModerationListing(listingData),
           support_status: isSupportListing(listingData)
             ? getSupportTicketStatusFromListingStatus(listingData.status)
             : null,
         };
    }

    detailedConvos.push({
      id: convo.id,
      buyer_id: convo.buyer_id,
      seller_id: convo.seller_id,
      listing_id: convo.listing_id,
      created_at: convo.created_at,
      other_user: otherProfile
        ? {
            id: otherProfile.id,
            display_name: buildDisplayName(otherProfile, 'Marketplace User'),
            username: otherProfile.username ?? null,
            avatar_path: getPublicStorageUrl(AVATAR_BUCKET, otherProfile.avatar_path ?? null),
          }
        : null,
      listing_details: listingDetails,
      last_message: latestMsgData ? {
        content: buildMessagePreview(parseStoredMessageBody(latestMsgData.body)),
        created_at: latestMsgData.created_at,
        sender_id: latestMsgData.sender_id,
        is_read: latestMsgData.is_read
      } : null,
      unread_count: unreadCount
    });
  }

  return detailedConvos.sort((a, b) => {
    const timeA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime();
    const timeB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime();
    return timeB - timeA;
  });
}

export async function getArchivedConversationIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('conversation_archives')
    .select('conversation_id')
    .eq('user_id', userId);

  if (error) {
    throw new MessageServiceError('Unable to load archived conversations', 500);
  }

  const archivedConversationIds = Array.from(
    new Set(
      ((data ?? []) as Array<{ conversation_id: string }>)
        .map((item) => item.conversation_id)
        .filter(Boolean)
    )
  );

  if (archivedConversationIds.length === 0) {
    return [];
  }

  const { data: accessibleConversations, error: accessError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      listings (
        deleted_at
      )
    `)
    .in('id', archivedConversationIds)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  if (accessError) {
    throw new MessageServiceError('Unable to load archived conversations', 500);
  }

  const accessibleConversationIds = new Set(
    ((accessibleConversations ?? []) as Array<{
      id: string;
      listings: RawListing | RawListing[] | null;
    }>)
      .filter((conversation) => unwrapRelation(conversation.listings)?.deleted_at === null)
      .map((conversation) => conversation.id)
  );

  const validArchivedConversationIds = archivedConversationIds.filter((conversationId) =>
    accessibleConversationIds.has(conversationId)
  );

  const staleConversationIds = archivedConversationIds.filter(
    (conversationId) => !accessibleConversationIds.has(conversationId)
  );

  if (staleConversationIds.length > 0) {
    await supabaseAdmin
      .from('conversation_archives')
      .delete()
      .eq('user_id', userId)
      .in('conversation_id', staleConversationIds);
  }

  return validArchivedConversationIds;
}

export async function archiveConversation(userId: string, conversationId: string): Promise<void> {
  await assertConversationAccess(userId, conversationId);

  const { error } = await supabaseAdmin
    .from('conversation_archives')
    .upsert(
      {
        user_id: userId,
        conversation_id: conversationId,
      },
      {
        onConflict: 'user_id,conversation_id',
        ignoreDuplicates: true,
      }
    );

  if (error) {
    throw new MessageServiceError('Unable to archive this conversation', 500);
  }
}

export async function unarchiveConversation(userId: string, conversationId: string): Promise<void> {
  await assertConversationAccess(userId, conversationId);

  const { error } = await supabaseAdmin
    .from('conversation_archives')
    .delete()
    .eq('user_id', userId)
    .eq('conversation_id', conversationId);

  if (error) {
    throw new MessageServiceError('Unable to restore this conversation', 500);
  }
}

export async function getConversationMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
  await assertConversationAccess(userId, conversationId);

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new MessageServiceError('Unable to load messages', 500);
  }
  return ((messages ?? []) as RawMessageRow[]).map(mapMessageRow);
}

async function touchConversation(conversationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) {
    throw new MessageServiceError('Unable to update conversation activity', 500);
  }
}

async function createConversationMessage(
  senderId: string,
  conversationId: string,
  payload: {
    content: string;
    attachments?: MessageAttachmentInput[];
    event?: MessageEvent | null;
  }
): Promise<ChatMessage> {
  const content = payload.content.trim();
  const attachments = payload.attachments ?? [];
  assertValidMessagePayload(content, attachments);

  const uploadedAttachments = await uploadMessageAttachments(senderId, attachments);
  const body = buildStoredMessageBody({
    text: content,
    attachments: uploadedAttachments,
    event: payload.event ?? null,
  });

  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body,
      is_read: false,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (messageError || !message) {
    if (uploadedAttachments.length > 0) {
      try {
        await removeStorageObjects(
          MESSAGE_ATTACHMENT_BUCKET,
          uploadedAttachments.map((attachment) => attachment.path)
        );
      } catch (cleanupError) {
        console.error('[Messages] Failed to clean up message images after insert failure:', cleanupError);
      }
    }

    throw new MessageServiceError('Unable to send this message', 500);
  }

  await touchConversation(conversationId);
  const mappedMessage = mapMessageRow(message as RawMessageRow);

  try {
    await createConversationMessageNotification(
      senderId,
      conversationId,
      content,
      mappedMessage.content
    );
  } catch (notificationError) {
    console.error('[Messages] Failed to create message notification:', notificationError);
  }

  return mappedMessage;
}

async function maybeCreateAutoNegotiationReply(input: {
  conversationId: string;
  buyerId: string;
  listing: RawListing;
  buyerMessage: string;
  hasAttachments: boolean;
}): Promise<void> {
  const { conversationId, buyerId, listing, buyerMessage, hasAttachments } = input;
  const sellerId = listing.seller_id;
  const trimmedMessage = buyerMessage.trim();

  if (
    !sellerId ||
    buyerId === sellerId ||
    !trimmedMessage ||
    hasAttachments ||
    isModerationListing(listing) ||
    isSupportListing(listing) ||
    listing.auto_negotiate_enabled !== true ||
    listing.negotiable !== true ||
    !['active', 'reserved'].includes(listing.status ?? '')
  ) {
    return;
  }

  const askingPrice = toNumber(listing.price, Number.NaN);
  const floorPrice = toNumber(listing.auto_negotiate_floor_price, Number.NaN);

  if (
    !Number.isFinite(askingPrice) ||
    askingPrice <= 0 ||
    !Number.isFinite(floorPrice) ||
    floorPrice <= 0 ||
    floorPrice > askingPrice
  ) {
    return;
  }

  try {
    const autoReply = await evaluateAutoNegotiationReply({
      buyerMessage: trimmedMessage,
      listingTitle: listing.title,
      askingPrice,
      floorPrice,
      currency: listing.currency?.trim() || 'MYR',
    });

    if (!autoReply?.reply) {
      return;
    }

    await createConversationMessage(sellerId, conversationId, {
      content: autoReply.reply,
    });
  } catch (error) {
    console.error('[Auto Negotiation] Failed to create seller auto-reply:', error);
  }
}

export async function createSupportConversation(
  sender: MessagingActor,
  payload: { subject?: string; content: string; attachments?: MessageAttachmentInput[] }
): Promise<SupportConversationResult> {
  const trimmedContent = payload.content.trim();
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';

  assertValidMessagePayload(trimmedContent, payload.attachments ?? []);

  const [assignedAdmin, requesterProfileResult] = await Promise.all([
    chooseLeastLoadedSupportAdmin(sender.id),
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, username, avatar_path')
      .eq('id', sender.id)
      .maybeSingle(),
  ]);

  if (requesterProfileResult.error) {
    throw new MessageServiceError('Unable to load your profile for support', 500);
  }

  const requesterProfile = requesterProfileResult.data as RawProfile | null;
  const requesterName = buildDisplayName(requesterProfile, 'Marketplace User');
  const supportListing = await createSupportListing(assignedAdmin.id, sender.id, requesterName, subject);
  const { data: createdConversation, error: createConversationError } = await supabaseAdmin
    .from('conversations')
    .insert({
      listing_id: supportListing.id,
      buyer_id: sender.id,
      seller_id: assignedAdmin.id,
    })
    .select('id')
    .single();

  if (createConversationError || !createdConversation) {
    throw new MessageServiceError('Unable to create a support conversation', 500);
  }

  const conversationId = createdConversation.id as string | undefined;

  if (!conversationId) {
    throw new MessageServiceError('Unable to prepare a support conversation', 500);
  }

  const message = await createConversationMessage(sender.id, conversationId, {
    content: trimmedContent,
    attachments: payload.attachments,
  });

  return {
    conversation_id: conversationId,
    listing_id: supportListing.id,
    listing_title: supportListing.title,
    admin_id: assignedAdmin.id,
    admin_name: buildDisplayName(assignedAdmin, 'Marketplace User'),
    message,
  };
}

export async function sendMessage(
  sender: MessagingActor,
  payload: {
    listing_id: string;
    content: string;
    recipient_id?: string;
    attachments?: MessageAttachmentInput[];
  }
): Promise<ChatMessage> {
  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  assertValidMessagePayload(content, payload.attachments ?? []);

  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select(`
      seller_id,
      title,
      brand,
      description,
      price,
      currency,
      negotiable,
      status,
      cover_image_path,
      auto_negotiate_enabled,
      auto_negotiate_floor_price
    `)
    .eq('id', payload.listing_id)
    .is('deleted_at', null)
    .single();

  if (listingError || !listing) {
    throw new MessageServiceError('Listing not found', 404);
  }

  await assertMessagingAllowed(sender, listing as RawListing);
  assertModerationThreadAccess(sender.id, listing as RawListing, payload.recipient_id?.trim());

  let conversationId = '';
  const isSeller = sender.id === listing.seller_id;

  if (isSeller) {
     const recipientId = payload.recipient_id?.trim();

     if (!recipientId) {
       throw new MessageServiceError(
         'recipient_id is required when the seller starts a conversation',
         422
       );
     }

     if (recipientId === sender.id) {
       throw new MessageServiceError('You cannot start a conversation with yourself', 422);
     }

     const { data: existingConvo, error: existingConvoError } = await supabaseAdmin
       .from('conversations')
       .select('id')
       .eq('listing_id', payload.listing_id)
       .eq('buyer_id', recipientId)
       .eq('seller_id', sender.id)
       .maybeSingle();

     if (existingConvoError) {
       throw new MessageServiceError('Unable to prepare this conversation', 500);
     }

     if (existingConvo) {
       conversationId = existingConvo.id;
     } else {
       const { data: newConvo, error: createError } = await supabaseAdmin
         .from('conversations')
         .insert({
            listing_id: payload.listing_id,
            buyer_id: recipientId,
            seller_id: sender.id
         })
         .select()
         .single();

       if (createError || !newConvo) {
          throw new MessageServiceError('Unable to prepare this conversation', 500);
       }

       conversationId = newConvo.id;
     }
  } else {
     const { data: existingConvo, error: existingConvoError } = await supabaseAdmin
       .from('conversations')
       .select('id')
       .eq('listing_id', payload.listing_id)
       .eq('buyer_id', sender.id)
       .eq('seller_id', listing.seller_id)
       .maybeSingle();

     if (existingConvoError) {
       throw new MessageServiceError('Unable to prepare this conversation', 500);
     }

     if (existingConvo) {
       conversationId = existingConvo.id;
     } else {
       const { data: newConvo, error: createError } = await supabaseAdmin
         .from('conversations')
         .insert({
            listing_id: payload.listing_id,
            buyer_id: sender.id,
            seller_id: listing.seller_id
         })
         .select()
         .single();
       if (createError || !newConvo) {
          throw new MessageServiceError('Unable to prepare this conversation', 500);
       }
       conversationId = newConvo.id;
     }
  }

  const createdMessage = await createConversationMessage(sender.id, conversationId, {
    content,
    attachments: payload.attachments,
  });

  if (!isSeller) {
    await maybeCreateAutoNegotiationReply({
      conversationId,
      buyerId: sender.id,
      listing: listing as RawListing,
      buyerMessage: content,
      hasAttachments: (payload.attachments ?? []).length > 0,
    });
  }

  return createdMessage;
}

export async function sendReply(
  sender: MessagingActor,
  conversationId: string,
  content: string,
  attachments: MessageAttachmentInput[] = []
): Promise<ChatMessage> {
  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  assertValidMessagePayload(trimmedContent, attachments);

  const { data: convo, error: verifyError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      listing_id,
      buyer_id,
      seller_id,
      listings (
        seller_id,
        title,
        brand,
        price,
        currency,
        negotiable,
        status,
        cover_image_path,
        auto_negotiate_enabled,
        auto_negotiate_floor_price,
        description,
        deleted_at
      )
    `)
    .eq('id', conversationId)
    .or(`buyer_id.eq.${sender.id},seller_id.eq.${sender.id}`)
    .single();

  if (verifyError || !convo) {
    throw new MessageServiceError('Conversation not found or access denied', 403);
  }

  const listing = unwrapRelation(convo.listings);

  if (!listing || listing.deleted_at !== null) {
    throw new MessageServiceError('Conversation not found or access denied', 403);
  }

  await assertMessagingAllowed(sender, listing);

  if (isSupportListing(listing)) {
    const supportStatus = getSupportTicketStatusFromListingStatus(listing.status);

    if (supportStatus === 'closed') {
      throw new MessageServiceError('This support ticket is closed. Reopen it before replying.', 403);
    }

    if (supportStatus === 'resolved') {
      const { error: reopenError } = await supabaseAdmin
        .from('listings')
        .update({ status: getListingStatusForSupportTicketStatus('open') })
        .eq('id', convo.listing_id);

      if (reopenError) {
        console.error('[Messages] Failed to reopen support ticket before reply:', reopenError);
        throw new MessageServiceError('Unable to reopen this support ticket', 500);
      }
    }
  }

  const createdMessage = await createConversationMessage(sender.id, conversationId, {
    content: trimmedContent,
    attachments,
  });

  if (sender.id === convo.buyer_id && sender.id !== listing.seller_id) {
    await maybeCreateAutoNegotiationReply({
      conversationId,
      buyerId: sender.id,
      listing,
      buyerMessage: trimmedContent,
      hasAttachments: attachments.length > 0,
    });
  }

  return createdMessage;
}

export async function updateSupportTicketStatus(
  sender: MessagingActor,
  conversationId: string,
  status: SupportTicketStatus
): Promise<SupportTicketStatusResult> {
  if (!['open', 'resolved', 'closed'].includes(status)) {
    throw new MessageServiceError('Unsupported support ticket status', 422);
  }

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      listing_id,
      buyer_id,
      seller_id,
      listings (
        title,
        brand,
        status,
        description,
        deleted_at
      )
    `)
    .eq('id', conversationId)
    .or(`buyer_id.eq.${sender.id},seller_id.eq.${sender.id}`)
    .maybeSingle();

  if (conversationError || !conversation) {
    throw new MessageServiceError('Conversation not found or access denied', 403);
  }

  const listing = unwrapRelation(conversation.listings);

  if (!listing || listing.deleted_at !== null) {
    throw new MessageServiceError('Conversation not found or access denied', 403);
  }

  if (!isSupportListing(listing)) {
    throw new MessageServiceError('This action is only available for support tickets', 403);
  }

  const { error: updateError } = await supabaseAdmin
    .from('listings')
    .update({ status: getListingStatusForSupportTicketStatus(status) })
    .eq('id', conversation.listing_id);

  if (updateError) {
    console.error('[Messages] Failed to update support ticket status:', updateError);
    throw new MessageServiceError('Unable to update support ticket status', 500);
  }

  const message = await createConversationMessage(sender.id, conversationId, {
    content: getSupportStatusLabel(status),
    event: {
      type: 'ticket_status',
      ticket_status: status,
      label: getSupportStatusLabel(status),
    },
  });

  return {
    conversation_id: conversationId,
    status,
    message,
  };
}

export async function markConversationAsRead(senderId: string, conversationId: string): Promise<boolean> {
  await assertConversationAccess(senderId, conversationId);

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', senderId)
    .eq('is_read', false);

  if (error) {
    throw new MessageServiceError('Unable to mark these messages as read', 500);
  }
  
  return true;
}
