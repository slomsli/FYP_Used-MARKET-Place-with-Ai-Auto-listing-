import { supabaseAdmin } from '../config/supabase';
import { getPublicStorageUrl } from '../utils/storage';
import {
  buildModerationListingTargetKey,
  isModerationListing,
  MODERATION_LISTING_BRAND,
  parseModerationListingTargetKey,
} from '../utils/moderationThread';
import { isAccountSuspended } from '../utils/accountStatus';
import { toListingModerationDisplayText } from '../utils/listingModeration';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
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
  description?: string | null;
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
  listings: Pick<RawListing, 'brand'> | Pick<RawListing, 'brand'>[] | null;
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

const MESSAGE_SELECT = 'id, conversation_id, sender_id, body, is_read, created_at';
const LISTING_IMAGE_BUCKET =
  process.env.SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  'listing-images';
const AVATAR_BUCKET =
  process.env.SUPABASE_AVATARS_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET?.trim() ||
  'avatars';
const SUPPORT_LISTING_TITLE_PREFIX = 'Support request:';

function unwrapRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
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

function buildSupportListingTitle(subject: string, targetDisplayName: string): string {
  const trimmedSubject = subject.trim();
  if (trimmedSubject) {
    return `${SUPPORT_LISTING_TITLE_PREFIX} ${trimmedSubject.slice(0, 72)}`;
  }

  const name = targetDisplayName.trim();
  return name ? `${SUPPORT_LISTING_TITLE_PREFIX} ${name}` : `${SUPPORT_LISTING_TITLE_PREFIX} Marketplace user`;
}

async function getFallbackCategoryId(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error('Unable to prepare a support conversation');
  }

  if (typeof data?.id !== 'number') {
    throw new Error('Create at least one category before support conversations can be created');
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
    throw new Error('Unable to load support admins');
  }

  return ((data ?? []) as RawAdminProfile[]).filter((admin) => admin.id);
}

async function chooseLeastLoadedSupportAdmin(requesterId: string): Promise<RawAdminProfile> {
  const admins = (await getSupportAdmins()).filter((admin) => admin.id !== requesterId);

  if (admins.length === 0) {
    throw new Error('No support admins are available right now');
  }

  const loadByAdminId = new Map(admins.map((admin) => [admin.id, 0]));
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      seller_id,
      listings!conversations_listing_id_fkey (
        brand
      )
    `)
    .in('seller_id', admins.map((admin) => admin.id));

  if (error) {
    throw new Error('Unable to inspect admin support workload');
  }

  for (const conversation of ((data ?? []) as RawSupportConversation[])) {
    const listing = unwrapRelation(conversation.listings);
    if (listing?.brand === MODERATION_LISTING_BRAND && loadByAdminId.has(conversation.seller_id)) {
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
    throw new Error('Unable to create a support conversation');
  }

  return {
    id: createdListing.id,
    title: createdListing.title,
  };
}

function mapMessageRow(message: RawMessageRow): ChatMessage {
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    sender_id: message.sender_id,
    content: toListingModerationDisplayText(message.body),
    is_read: message.is_read,
    created_at: message.created_at,
  };
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
    throw new Error('Unable to verify messaging access');
  }

  if (data?.role === 'admin') {
    return;
  }

  if (!isAccountSuspended(sender)) {
    return;
  }

  throw new Error(
    'Your account is suspended. You can still browse the marketplace, but new offers, listings, and messages are disabled until an admin reactivates your account.'
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
    throw new Error('This moderation thread is misconfigured');
  }

  const isSeller = senderId === listing.seller_id;

  if (isSeller) {
    if (!recipientId || recipientId !== targetUserId) {
      throw new Error('This moderation thread can only contact its assigned user');
    }
    return;
  }

  if (senderId !== targetUserId) {
    throw new Error('This moderation thread is not available for your account');
  }
}

async function assertConversationAccess(userId: string, conversationId: string): Promise<void> {
  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle();

  if (error || !conversation) {
    throw new Error('Conversation not found or access denied');
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
        brand
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
    throw new Error(`Failed to fetch conversations: ${convosError.message}`);
  }

  const detailedConvos: ConversationDetail[] = [];

  for (const convo of ((convos ?? []) as RawConversation[])) {
    const otherProfile = convo.buyer_id === userId
      ? unwrapRelation(convo.seller_profile)
      : unwrapRelation(convo.buyer_profile);

    const { data: latestMsgData, error: latestMsgError } = await supabaseAdmin
      .from('messages')
      .select('body, created_at, sender_id, is_read')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMsgError) {
      throw new Error(`Failed to fetch the latest message: ${latestMsgError.message}`);
    }

    let unreadCount = 0;
    const { count: unreadRespCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', convo.id)
      .neq('sender_id', userId)
      .eq('is_read', false);

    unreadCount = unreadRespCount || 0;

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
            display_name: buildDisplayName(otherProfile),
            username: otherProfile.username ?? null,
            avatar_path: getPublicStorageUrl(AVATAR_BUCKET, otherProfile.avatar_path ?? null),
          }
        : null,
      listing_details: listingDetails,
      last_message: latestMsgData ? {
        content: toListingModerationDisplayText(latestMsgData.body),
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
    throw new Error(`Failed to fetch archived conversations: ${error.message}`);
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
    .select('id')
    .in('id', archivedConversationIds)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  if (accessError) {
    throw new Error(`Failed to validate archived conversations: ${accessError.message}`);
  }

  const accessibleConversationIds = new Set(
    ((accessibleConversations ?? []) as Array<{ id: string }>).map(
      (conversation) => conversation.id
    )
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
    throw new Error(`Failed to archive conversation: ${error.message}`);
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
    throw new Error(`Failed to restore conversation archive state: ${error.message}`);
  }
}

export async function getConversationMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
  await assertConversationAccess(userId, conversationId);

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return ((messages ?? []) as RawMessageRow[]).map(mapMessageRow);
}

async function touchConversation(conversationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to update conversation activity: ${error.message}`);
  }
}

export async function createSupportConversation(
  sender: MessagingActor,
  payload: { subject?: string; content: string }
): Promise<SupportConversationResult> {
  const trimmedContent = payload.content.trim();
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';

  if (!trimmedContent) {
    throw new Error('Support message is required');
  }

  if (trimmedContent.length > 2000) {
    throw new Error('Support message must be 2000 characters or fewer');
  }

  const [assignedAdmin, requesterProfileResult] = await Promise.all([
    chooseLeastLoadedSupportAdmin(sender.id),
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, username, avatar_path')
      .eq('id', sender.id)
      .maybeSingle(),
  ]);

  if (requesterProfileResult.error) {
    throw new Error('Unable to load your profile for support');
  }

  const requesterProfile = requesterProfileResult.data as RawProfile | null;
  const requesterName = buildDisplayName(requesterProfile);
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
    throw new Error('Unable to create a support conversation');
  }

  const conversationId = createdConversation.id as string | undefined;

  if (!conversationId) {
    throw new Error('Unable to prepare a support conversation');
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: sender.id,
      body: trimmedContent,
      is_read: false,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (messageError || !message) {
    throw new Error('Unable to send your support message');
  }

  await touchConversation(conversationId);

  return {
    conversation_id: conversationId,
    listing_id: supportListing.id,
    listing_title: supportListing.title,
    admin_id: assignedAdmin.id,
    admin_name: buildDisplayName(assignedAdmin),
    message: mapMessageRow(message as RawMessageRow),
  };
}

export async function sendMessage(
  sender: MessagingActor,
  payload: { listing_id: string; content: string; recipient_id?: string }
): Promise<ChatMessage> {
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('seller_id, title, brand, description')
    .eq('id', payload.listing_id)
    .single();

  if (listingError || !listing) {
    throw new Error('Listing not found');
  }

  await assertMessagingAllowed(sender, listing as RawListing);
  assertModerationThreadAccess(sender.id, listing as RawListing, payload.recipient_id?.trim());

  let conversationId = '';
  const isSeller = sender.id === listing.seller_id;

  if (isSeller) {
     const recipientId = payload.recipient_id?.trim();

     if (!recipientId) {
       throw new Error('recipient_id is required when the seller starts a conversation');
     }

     if (recipientId === sender.id) {
       throw new Error('You cannot start a conversation with yourself');
     }

     const { data: existingConvo, error: existingConvoError } = await supabaseAdmin
       .from('conversations')
       .select('id')
       .eq('listing_id', payload.listing_id)
       .eq('buyer_id', recipientId)
       .eq('seller_id', sender.id)
       .maybeSingle();

     if (existingConvoError) {
       throw new Error('Failed to check for an existing conversation');
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
          throw new Error('Failed to create conversation');
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
       throw new Error('Failed to check for an existing conversation');
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
          throw new Error('Failed to create conversation');
       }
       conversationId = newConvo.id;
     }
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: sender.id,
      body: payload.content,
      is_read: false
    })
    .select(MESSAGE_SELECT)
    .single();

  if (messageError || !message) {
    throw new Error('Failed to insert message');
  }

  await touchConversation(conversationId);

  return mapMessageRow(message as RawMessageRow);
}

export async function sendReply(
  sender: MessagingActor,
  conversationId: string,
  content: string
): Promise<ChatMessage> {
  const { data: convo, error: verifyError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      listing_id,
      listings (
        seller_id,
        title,
        brand,
        description
      )
    `)
    .eq('id', conversationId)
    .or(`buyer_id.eq.${sender.id},seller_id.eq.${sender.id}`)
    .single();

  if (verifyError || !convo) {
    throw new Error('Conversation not found or access denied');
  }

  const listing = unwrapRelation(convo.listings);

  if (!listing) {
    throw new Error('Conversation listing was not found');
  }

  await assertMessagingAllowed(sender, listing);

  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: sender.id,
      body: content,
      is_read: false
    })
    .select(MESSAGE_SELECT)
    .single();

  if (messageError || !message) {
    throw new Error('Failed to insert message');
  }

  await touchConversation(conversationId);

  return mapMessageRow(message as RawMessageRow);
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
    throw new Error(`Failed to mark messages as read: ${error.message}`);
  }
  
  return true;
}
