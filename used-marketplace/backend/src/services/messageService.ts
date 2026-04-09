import { supabaseAdmin } from '../config/supabase';

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
    full_name: string;
  } | null;
  listing_details: {
    title: string;
    cover_image_path: string | null;
  } | null;
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
    is_read: boolean;
  } | null;
  unread_count: number;
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
        cover_image_path
      )
    `)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (convosError) {
    throw new Error(`Failed to fetch conversations: ${convosError.message}`);
  }

  const detailedConvos: ConversationDetail[] = [];

  for (const convo of (convos || [])) {
    const otherUserId = convo.buyer_id === userId ? convo.seller_id : convo.buyer_id;

    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('id, full_name')
      .eq('id', otherUserId)
      .single();
    
    const { data: latestMsgData } = await supabaseAdmin
      .from('messages')
      .select('content, created_at, sender_id, is_read')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let unreadCount = 0;
    const { count: unreadRespCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', convo.id)
      .neq('sender_id', userId)
      .eq('is_read', false);

    unreadCount = unreadRespCount || 0;

    let listingDetails = null;
    if (convo.listings) {
      const listingData = Array.isArray(convo.listings) ? convo.listings[0] : convo.listings;
      if (listingData) {
         listingDetails = {
           title: listingData.title,
           cover_image_path: listingData.cover_image_path
         }
      }
    }

    detailedConvos.push({
      id: convo.id,
      buyer_id: convo.buyer_id,
      seller_id: convo.seller_id,
      listing_id: convo.listing_id,
      created_at: convo.created_at,
      other_user: userData ? { id: userData.id, full_name: userData.full_name } : null,
      listing_details: listingDetails,
      last_message: latestMsgData ? {
        content: latestMsgData.content,
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

export async function getConversationMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
  const { data: convo, error: verifyError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .single();

  if (verifyError || !convo) {
    throw new Error('Conversation not found or access denied');
  }

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return messages || [];
}

export async function sendMessage(senderId: string, payload: { listing_id: string, content: string }): Promise<ChatMessage> {
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('seller_id')
    .eq('id', payload.listing_id)
    .single();
    
  if (listingError || !listing) {
    throw new Error('Listing not found');
  }

  let conversationId = '';
  const isSeller = senderId === listing.seller_id;

  if (isSeller) {
     throw new Error("Sellers cannot initiate a conversation just with listing_id.");
  } else {
     const { data: existingConvo } = await supabaseAdmin
       .from('conversations')
       .select('id')
       .eq('listing_id', payload.listing_id)
       .eq('buyer_id', senderId)
       .single();

     if (existingConvo) {
       conversationId = existingConvo.id;
     } else {
       const { data: newConvo, error: createError } = await supabaseAdmin
         .from('conversations')
         .insert({
            listing_id: payload.listing_id,
            buyer_id: senderId,
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
      sender_id: senderId,
      content: payload.content,
      is_read: false
    })
    .select()
    .single();

  if (messageError || !message) {
    throw new Error('Failed to insert message');
  }

  return message;
}

export async function sendReply(senderId: string, conversationId: string, content: string): Promise<ChatMessage> {
  const { data: convo, error: verifyError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .or(`buyer_id.eq.${senderId},seller_id.eq.${senderId}`)
    .single();

  if (verifyError || !convo) {
    throw new Error('Conversation not found or access denied');
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      is_read: false
    })
    .select()
    .single();

  if (messageError || !message) {
    throw new Error('Failed to insert message');
  }

  return message;
}

export async function markConversationAsRead(senderId: string, conversationId: string): Promise<boolean> {
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
