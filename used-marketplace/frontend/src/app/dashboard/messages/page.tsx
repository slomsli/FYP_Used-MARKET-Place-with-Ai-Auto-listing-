'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { getPublicListingById } from '@/src/services/listingService';
import * as messageService from '@/src/services/messageService';
import type { ChatMessage, ConversationDetail } from '@/src/services/messageService';
import ImageLightbox from '@/src/components/ui/ImageLightbox';
import ReMarketVerifiedBadge from '@/src/components/identity/ReMarketVerifiedBadge';
import styles from './page.module.css';

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15.55-6.36L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15.55 6.36L3 16" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const DoubleCheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 7 17l-5-5" />
    <path d="m22 10-9.5 9.5-2-2" />
  </svg>
);

const BigMessageIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 10h.01" />
    <path d="M12 10h.01" />
    <path d="M16 10h.01" />
  </svg>
);

type FilterTab = 'all' | 'unread' | 'buying' | 'selling' | 'archived';

const SUPPORT_TICKET_TITLE_PREFIX = 'Support request:';

interface DraftConversationTarget {
  listingId: string;
  recipientId: string | null;
  listingTitle: string;
  otherUserName: string;
  coverImagePath: string | null;
  isModeration: boolean;
}

interface ConversationThread {
  key: string;
  conversations: ConversationDetail[];
}

interface VisibleConversationThread {
  thread: ConversationThread;
  contexts: ConversationDetail[];
  previewConversation: ConversationDetail;
  unreadCount: number;
}

const getRole = (convo: ConversationDetail, userId?: string) =>
  convo.buyer_id === userId ? 'buying' : 'seller';

const isModerationConversation = (convo: ConversationDetail | null | undefined) =>
  Boolean(convo?.listing_details?.is_moderation);

const isSupportTicketConversation = (convo: ConversationDetail | null | undefined) =>
  Boolean(
    convo?.listing_details?.is_moderation &&
      convo.listing_details.title.startsWith(SUPPORT_TICKET_TITLE_PREFIX)
  );

const getConversationName = (convo: ConversationDetail) =>
  convo.other_user?.display_name || convo.other_user?.username || 'Marketplace User';

const getConversationActivityTime = (convo: ConversationDetail) =>
  new Date(convo.last_message?.created_at || convo.created_at).getTime();

const sortConversationsByActivity = (conversations: ConversationDetail[]) =>
  [...conversations].sort((left, right) => getConversationActivityTime(right) - getConversationActivityTime(left));

const getConversationThreadKey = (conversation: ConversationDetail, groupModerationByUser: boolean) => {
  if (!conversation.other_user?.id) {
    return `conversation:${conversation.id}`;
  }

  if (isModerationConversation(conversation) && !groupModerationByUser) {
    return `conversation:${conversation.id}`;
  }

  return `user:${conversation.other_user.id}`;
};

function buildConversationThreads(
  conversations: ConversationDetail[],
  groupModerationByUser: boolean
): ConversationThread[] {
  const threadMap = new Map<string, ConversationDetail[]>();

  for (const conversation of conversations) {
    const key = getConversationThreadKey(conversation, groupModerationByUser);
    threadMap.set(key, [...(threadMap.get(key) ?? []), conversation]);
  }

  return Array.from(threadMap.entries())
    .map(([key, threadConversations]) => ({
      key,
      conversations: sortConversationsByActivity(threadConversations),
    }))
    .sort((left, right) => {
      const leftLatest = left.conversations[0];
      const rightLatest = right.conversations[0];
      return getConversationActivityTime(rightLatest) - getConversationActivityTime(leftLatest);
    });
}

function getThreadRoleLabel(contexts: ConversationDetail[], userId?: string) {
  if (contexts.some(isModerationConversation)) {
    return 'Moderation';
  }

  const hasBuying = contexts.some((conversation) => getRole(conversation, userId) === 'buying');
  const hasSelling = contexts.some((conversation) => getRole(conversation, userId) === 'seller');

  if (hasBuying && hasSelling) {
    return 'Buying & Selling';
  }

  return hasBuying ? 'Buying' : 'Selling';
}

function getThreadProductSummary(contexts: ConversationDetail[]) {
  const titles = Array.from(
    new Set(
      contexts
        .map((conversation) => conversation.listing_details?.title?.trim())
        .filter((title): title is string => Boolean(title))
    )
  );

  if (titles.length === 0) {
    return 'Listing unavailable';
  }

  if (titles.length === 1) {
    return titles[0];
  }

  return `${titles[0]} + ${titles.length - 1} more`;
}

function getContextCountLabel(contexts: ConversationDetail[]) {
  return contexts.some(isModerationConversation) ? `${contexts.length} threads` : `${contexts.length} products`;
}

function getContextOptionLabel(conversation: ConversationDetail) {
  const title = conversation.listing_details?.title || (
    isModerationConversation(conversation) ? 'Account moderation thread' : 'Listing unavailable'
  );
  const activityTime = formatTime(conversation.last_message?.created_at || conversation.created_at);

  return activityTime ? `${title} - ${activityTime}` : title;
}

const conversationMatchesRequest = (
  conversation: ConversationDetail,
  listingId: string | null,
  recipientId: string | null
) => {
  if (!listingId || conversation.listing_id !== listingId) {
    return false;
  }

  if (!recipientId) {
    return true;
  }

  return (
    conversation.other_user?.id === recipientId ||
    conversation.buyer_id === recipientId ||
    conversation.seller_id === recipientId
  );
};

const getInitials = (name?: string | null) => {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const COLORS = ['avatarGreen', 'avatarAmber', 'avatarPurple', 'avatarNavy', 'avatarPink', 'avatarBlue'] as const;

const getAvatarColor = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = id.charCodeAt(index) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

const formatTime = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function areMessagesEqual(current: ChatMessage[], next: ChatMessage[]) {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((message, index) => {
    const nextMessage = next[index];

    return (
      message.id === nextMessage.id &&
      message.sender_id === nextMessage.sender_id &&
      message.content === nextMessage.content &&
      message.created_at === nextMessage.created_at &&
      message.is_read === nextMessage.is_read
    );
  });
}

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth > 900;
}

export default function MessagesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, token, loading: authLoading } = useRequireAuth();
  const isAdminWorkspace = pathname.startsWith('/admin');
  const inboxRoute = isAdminWorkspace ? ROUTES.ADMIN_MESSAGES : ROUTES.MESSAGES;
  const browseRoute = isAdminWorkspace ? ROUTES.ADMIN : ROUTES.BROWSE;
  const secondaryRoute = isAdminWorkspace ? ROUTES.ADMIN_USERS : ROUTES.OFFERS;
  const secondaryLabel = isAdminWorkspace ? 'User Directory' : 'Open Offers';

  const requestedConversationId = searchParams.get('conversationId');
  const requestedListingId = searchParams.get('listingId');
  const requestedListingTitle = searchParams.get('listingTitle')?.trim() || null;
  const requestedRecipientId = searchParams.get('recipientId') ?? searchParams.get('sellerId');
  const requestedRecipientName = searchParams.get('recipientName')?.trim() || null;
  const requestedTopicType = searchParams.get('topicType')?.trim() || null;

  const [conversations, setConversations] = useState<ConversationDetail[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftTarget, setDraftTarget] = useState<DraftConversationTarget | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [messageInput, setMessageInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<messageService.PendingMessageAttachment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingArchives, setLoadingArchives] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [archivedConversationIds, setArchivedConversationIds] = useState<string[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<messageService.PendingMessageAttachment[]>([]);
  const conversationRequestIdRef = useRef(0);
  const messageRequestIdRef = useRef(0);
  const handledRequestKeyRef = useRef<string | null>(null);
  const archivedConversationIdSet = useMemo(
    () => new Set(archivedConversationIds),
    [archivedConversationIds]
  );
  const requestKey =
    requestedConversationId ||
    requestedListingId ||
    requestedListingTitle ||
    requestedRecipientId ||
    requestedRecipientName ||
    requestedTopicType
      ? [
          requestedConversationId ?? '',
          requestedListingId ?? '',
          requestedListingTitle ?? '',
          requestedRecipientId ?? '',
          requestedRecipientName ?? '',
          requestedTopicType ?? '',
        ].join('|')
      : null;

  const completeInboxRequest = useCallback(() => {
    if (!requestKey || handledRequestKeyRef.current === requestKey) {
      return;
    }

    handledRequestKeyRef.current = requestKey;
    router.replace(inboxRoute, { scroll: false });
  }, [inboxRoute, requestKey, router]);

  useEffect(() => {
    if (!requestKey) {
      handledRequestKeyRef.current = null;
    }
  }, [requestKey]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(
    () => () => {
      messageService.revokePendingAttachmentPreviews(pendingAttachmentsRef.current);
    },
    []
  );

  const removeArchivedConversationId = useCallback((conversationId: string) => {
    setArchivedConversationIds((current) =>
      current.filter((archivedConversationId) => archivedConversationId !== conversationId)
    );
  }, []);

  const persistArchiveState = useCallback(
    async (conversationId: string, archived: boolean) => {
      if (!token) {
        setPageError('No auth session found. Please sign in again.');
        return;
      }

      const response = archived
        ? await messageService.archiveConversation(token, conversationId)
        : await messageService.unarchiveConversation(token, conversationId);

      if (response.error) {
        setPageError(response.error);
        return;
      }

      setPageError(null);
    },
    [token]
  );

  useEffect(() => {
    if (!user?.id || !token) {
      setArchivedConversationIds([]);
      setLoadingArchives(false);
      return;
    }

    let cancelled = false;
    setLoadingArchives(true);

    messageService.fetchArchivedConversationIds(token).then(({ data, error }) => {
      if (cancelled) {
        return;
      }

      if (error || !data) {
        setPageError(error || 'Failed to load archived conversations');
        setLoadingArchives(false);
        return;
      }

      setArchivedConversationIds(data);
      setPageError(null);
      setLoadingArchives(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, user?.id]);

  useEffect(() => {
    if (loadingConversations) {
      return;
    }

    const validConversationIds = new Set(conversations.map((conversation) => conversation.id));

    setArchivedConversationIds((current) => {
      const next = current.filter((conversationId) => validConversationIds.has(conversationId));
      return next.length === current.length ? current : next;
    });
  }, [conversations, loadingConversations]);

  const loadConversations = useCallback(async () => {
    if (!token) return null;

    const requestId = conversationRequestIdRef.current + 1;
    conversationRequestIdRef.current = requestId;

    const { data, error } = await messageService.fetchConversations(token);

    if (requestId !== conversationRequestIdRef.current) {
      return null;
    }

    if (error || !data) {
      setPageError(error || 'Failed to load conversations');
      setLoadingConversations(false);
      return null;
    }

    const visibleConversations = data.filter((conversation) =>
      !isSupportTicketConversation(conversation)
    );

    setConversations(visibleConversations);
    setPageError(null);
    setLoadingConversations(false);
    return visibleConversations;
  }, [token]);

  const loadMessages = useCallback(
    async (
      conversationId: string,
      options: {
        showLoader?: boolean;
        reportErrors?: boolean;
      } = {}
    ) => {
      if (!token) return null;

      const { showLoader = false, reportErrors = false } = options;
      const requestId = messageRequestIdRef.current + 1;
      messageRequestIdRef.current = requestId;

      if (showLoader) {
        setLoadingMessages(true);
      }

      const { data, error } = await messageService.fetchMessages(token, conversationId);

      if (requestId !== messageRequestIdRef.current) {
        return null;
      }

      if (error || !data) {
        if (reportErrors) {
          setPageError(error || 'Failed to load messages');
        }
        if (showLoader) {
          setLoadingMessages(false);
        }
        return null;
      }

      setPageError(null);
      setMessages((current) => (areMessagesEqual(current, data) ? current : data));

      if (showLoader) {
        setLoadingMessages(false);
      }

      return data;
    },
    [token]
  );

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      if (!token) {
        return;
      }

      const { error } = await messageService.markAsRead(token, conversationId);

      if (error) {
        return;
      }

      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation;
          }

          return {
            ...conversation,
            unread_count: 0,
            last_message:
              conversation.last_message && conversation.last_message.sender_id !== user?.id
                ? {
                    ...conversation.last_message,
                    is_read: true,
                  }
                : conversation.last_message,
          };
        })
      );

      setMessages((current) =>
        current.map((message) =>
          message.sender_id === user?.id
            ? message
            : {
                ...message,
                is_read: true,
              }
        )
      );
    },
    [token, user?.id]
  );

  const refreshCurrentView = useCallback(async () => {
    const nextConversations = await loadConversations();

    if (!selectedConversation || !token) {
      return;
    }

    if (nextConversations && !nextConversations.some((conv) => conv.id === selectedConversation)) {
      setSelectedConversation(null);
      setMessages([]);
      return;
    }

    const nextMessages = await loadMessages(selectedConversation, {
      showLoader: true,
      reportErrors: true,
    });

    if (nextMessages) {
      await markConversationRead(selectedConversation);
    }
  }, [loadConversations, loadMessages, markConversationRead, selectedConversation, token]);

  useEffect(() => {
    if (!token || authLoading) return;

    void loadConversations();

    const interval = window.setInterval(() => {
      void loadConversations();
    }, 10000);

    return () => {
      conversationRequestIdRef.current += 1;
      window.clearInterval(interval);
    };
  }, [authLoading, loadConversations, token]);

  useEffect(() => {
    if (!selectedConversation) {
      messageRequestIdRef.current += 1;
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    let cancelled = false;

    void loadMessages(selectedConversation, {
      showLoader: true,
      reportErrors: true,
    }).then((data) => {
      if (!cancelled && data) {
        void markConversationRead(selectedConversation);
      }
    });

    const interval = window.setInterval(() => {
      void loadMessages(selectedConversation).then((data) => {
        if (!cancelled && data) {
          void markConversationRead(selectedConversation);
        }
      });
    }, 5000);

    return () => {
      cancelled = true;
      messageRequestIdRef.current += 1;
      window.clearInterval(interval);
    };
  }, [loadMessages, markConversationRead, selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedConversation]);

  useEffect(() => {
    let cancelled = false;

    const hasPendingRequest =
      requestKey !== null && handledRequestKeyRef.current !== requestKey;

    async function resolveDraftTarget() {
      if (!requestedListingId || !hasPendingRequest || loadingConversations || loadingArchives) {
        return;
      }

      const matchingConversation = conversations.find((conversation) =>
        conversationMatchesRequest(conversation, requestedListingId, requestedRecipientId)
      );

      if (matchingConversation) {
        if (archivedConversationIdSet.has(matchingConversation.id)) {
          removeArchivedConversationId(matchingConversation.id);
          void persistArchiveState(matchingConversation.id, false);
        }
        setDraftTarget(null);
        setSelectedConversation(matchingConversation.id);
        setMobileChatOpen(true);
        completeInboxRequest();
        return;
      }

      const result = await getPublicListingById(requestedListingId);

      if (cancelled) {
        return;
      }

      setSelectedConversation(null);
      setMessages([]);
      setFilterTab('all');
      setMobileChatOpen(true);

      if (result.data) {
        const inferredName =
          requestedRecipientName ||
          (requestedRecipientId && requestedRecipientId !== result.data.seller.id
            ? 'Buyer'
            : result.data.seller.displayName);

        setDraftTarget({
          listingId: requestedListingId,
          recipientId: requestedRecipientId,
          listingTitle: result.data.listing.title,
          otherUserName: inferredName,
          coverImagePath: result.data.listing.coverImagePath,
          isModeration: requestedTopicType === 'moderation',
        });
      } else {
        setDraftTarget({
          listingId: requestedListingId,
          recipientId: requestedRecipientId,
          listingTitle: requestedListingTitle || 'Listing',
          otherUserName: requestedRecipientName || 'Marketplace User',
          coverImagePath: null,
          isModeration: requestedTopicType === 'moderation',
        });
      }
      completeInboxRequest();
    }

    void resolveDraftTarget();

    return () => {
      cancelled = true;
    };
  }, [
    archivedConversationIdSet,
    completeInboxRequest,
    conversations,
    loadingArchives,
    loadingConversations,
    persistArchiveState,
    requestKey,
    removeArchivedConversationId,
    requestedListingId,
    requestedListingTitle,
    requestedRecipientId,
    requestedRecipientName,
    requestedTopicType,
  ]);

  useEffect(() => {
    if (draftTarget && selectedConversation) {
      return;
    }

    const activeConversations = conversations.filter(
      (conversation) => !archivedConversationIdSet.has(conversation.id)
    );
    const hasPendingRequest =
      requestKey !== null && handledRequestKeyRef.current !== requestKey;

    if (conversations.length === 0) {
      if (draftTarget) {
        return;
      }

      if (!requestedListingId) {
        setSelectedConversation(null);
      }
      setMessages([]);
      return;
    }

    const requestedConversation =
      hasPendingRequest && requestedConversationId
        ? conversations.find((conversation) => conversation.id === requestedConversationId)
        : null;
    const requestedListingConversation =
      hasPendingRequest && requestedListingId
        ? conversations.find((conversation) =>
            conversationMatchesRequest(
              conversation,
              requestedListingId,
              requestedRecipientId
            )
          )
        : null;
    const activeStillExists = selectedConversation
      ? conversations.find((conversation) => conversation.id === selectedConversation)
      : null;
    const activeConversationArchived = activeStillExists
      ? archivedConversationIdSet.has(activeStillExists.id)
      : false;

    let nextConversationId = selectedConversation;
    let shouldOpenChat = false;

    if (requestedConversation) {
      if (archivedConversationIdSet.has(requestedConversation.id)) {
        removeArchivedConversationId(requestedConversation.id);
        void persistArchiveState(requestedConversation.id, false);
      }
      nextConversationId = requestedConversation.id;
      shouldOpenChat = true;
      completeInboxRequest();
    } else if (requestedListingConversation) {
      if (archivedConversationIdSet.has(requestedListingConversation.id)) {
        removeArchivedConversationId(requestedListingConversation.id);
        void persistArchiveState(requestedListingConversation.id, false);
      }
      nextConversationId = requestedListingConversation.id;
      shouldOpenChat = true;
      completeInboxRequest();
    } else if (hasPendingRequest && requestedListingId) {
      nextConversationId = null;
      shouldOpenChat = true;
    } else if (!draftTarget && (!activeStillExists || (activeConversationArchived && filterTab !== 'archived'))) {
      nextConversationId = isDesktopViewport()
        ? activeConversations[0]?.id ?? null
        : null;
    }

    if (nextConversationId === selectedConversation) {
      if (!nextConversationId && shouldOpenChat) {
        setMobileChatOpen(true);
      }
      return;
    }

    setSelectedConversation(nextConversationId);
    if (nextConversationId && shouldOpenChat) {
      setMobileChatOpen(true);
    }
    if (!nextConversationId) {
      setMessages([]);
      if (shouldOpenChat) {
        setMobileChatOpen(true);
      }
    }
  }, [
    filterTab,
    completeInboxRequest,
    archivedConversationIdSet,
    conversations,
    requestKey,
    persistArchiveState,
    removeArchivedConversationId,
    requestedConversationId,
    requestedListingId,
    requestedRecipientId,
    selectedConversation,
    draftTarget,
  ]);

  useEffect(() => {
    if (!draftTarget || !selectedConversation) {
      return;
    }

    const selectedConversationExists = conversations.some(
      (conversation) => conversation.id === selectedConversation
    );

    if (selectedConversationExists) {
      setDraftTarget(null);
    }
  }, [conversations, draftTarget, selectedConversation]);

  useEffect(() => {
    if (filterTab === 'archived') {
      if (selectedConversation && archivedConversationIdSet.has(selectedConversation)) {
        return;
      }

      const firstArchivedConversationId =
        conversations.find((conversation) => archivedConversationIdSet.has(conversation.id))?.id ?? null;

      setSelectedConversation(firstArchivedConversationId);
      if (!firstArchivedConversationId) {
        setMessages([]);
      }
      return;
    }

    if (selectedConversation && archivedConversationIdSet.has(selectedConversation)) {
      setSelectedConversation(null);
      setMessages([]);
    }
  }, [
    archivedConversationIdSet,
    conversations,
    filterTab,
    selectedConversation,
  ]);

  const conversationThreads = useMemo(
    () => buildConversationThreads(conversations, true),
    [conversations]
  );

  const filteredConversationThreads = useMemo<VisibleConversationThread[]>(() => {
    const query = searchQuery.trim().toLowerCase();

    return conversationThreads
      .map((thread) => {
        const contexts = thread.conversations.filter((conversation) => {
          const isArchived = archivedConversationIdSet.has(conversation.id);

          if (filterTab === 'archived') {
            return isArchived;
          }

          if (isArchived) {
            return false;
          }

          const role = getRole(conversation, user?.id);
          if (filterTab === 'unread') return conversation.unread_count > 0;
          if (filterTab === 'buying') return role === 'buying';
          if (filterTab === 'selling') return role === 'seller';
          return true;
        });

        if (contexts.length === 0) {
          return null;
        }

        if (query) {
          const matchesName = thread.conversations.some((conversation) =>
            getConversationName(conversation).toLowerCase().includes(query)
          );
          const matchesProduct = contexts.some((conversation) =>
            (conversation.listing_details?.title || '').toLowerCase().includes(query)
          );
          const matchesMessage = contexts.some((conversation) =>
            (conversation.last_message?.content || '').toLowerCase().includes(query)
          );

          if (!matchesName && !matchesProduct && !matchesMessage) {
            return null;
          }
        }

        const sortedContexts = sortConversationsByActivity(contexts);
        return {
          thread,
          contexts: sortedContexts,
          previewConversation: sortedContexts[0],
          unreadCount: sortedContexts.reduce(
            (total, conversation) => total + conversation.unread_count,
            0
          ),
        };
      })
      .filter((thread): thread is VisibleConversationThread => Boolean(thread));
  }, [archivedConversationIdSet, conversationThreads, filterTab, searchQuery, user?.id]);

  const activeConversation =
    conversations.find((conversation) => conversation.id === selectedConversation) ?? null;
  const activeThread = activeConversation
    ? conversationThreads.find((thread) =>
        thread.conversations.some((conversation) => conversation.id === activeConversation.id)
      ) ?? null
    : draftTarget?.recipientId
      ? conversationThreads.find((thread) =>
          thread.conversations.some(
            (conversation) => conversation.other_user?.id === draftTarget.recipientId
          )
        ) ?? null
      : null;
  const isActiveConversationArchived = activeConversation
    ? archivedConversationIdSet.has(activeConversation.id)
    : false;
  const activeContextOptions = activeThread
    ? activeThread.conversations.filter((conversation) => {
        if (conversation.id === activeConversation?.id) {
          return true;
        }

        return isActiveConversationArchived
          ? archivedConversationIdSet.has(conversation.id)
          : !archivedConversationIdSet.has(conversation.id);
      })
    : [];
  const isActiveModerationThread =
    isModerationConversation(activeConversation) || Boolean(draftTarget?.isModeration);
  const activeListingId = activeConversation?.listing_id ?? draftTarget?.listingId ?? null;
  const activeListingTitle =
    activeConversation?.listing_details?.title ?? draftTarget?.listingTitle ?? 'Listing';
  const activeOtherUserName =
    activeConversation ? getConversationName(activeConversation) : draftTarget?.otherUserName ?? 'Seller';
  const activeOtherUserAvatar = activeConversation?.other_user?.avatar_path ?? null;
  const activeOtherUserUsername = activeConversation?.other_user?.username ?? null;
  const activeRoleLabel = activeConversation
    ? isModerationConversation(activeConversation)
      ? 'User'
      : getRole(activeConversation, user?.id) === 'buying'
        ? 'Seller'
        : 'Buyer'
    : draftTarget?.isModeration
      ? 'User'
      : 'Seller';
  const canOpenActiveListing = Boolean(activeListingId) && !isActiveModerationThread;

  const handleArchiveConversation = useCallback(
    (conversationId: string) => {
      const currentConversation =
        conversations.find((conversation) => conversation.id === conversationId) ?? null;
      const sameThreadNextConversationId =
        currentConversation?.other_user?.id
          ? conversations.find(
              (conversation) =>
                conversation.id !== conversationId &&
                conversation.other_user?.id === currentConversation.other_user?.id &&
                !archivedConversationIdSet.has(conversation.id)
            )?.id ?? null
          : null;
      const nextAvailableConversationId =
        conversations.find(
          (conversation) =>
            conversation.id !== conversationId &&
            !archivedConversationIdSet.has(conversation.id)
        )?.id ?? null;
      const nextConversationId = sameThreadNextConversationId ?? nextAvailableConversationId;

      setArchivedConversationIds((current) => {
        if (current.includes(conversationId)) {
          return current;
        }

        return [...current, conversationId];
      });
      void persistArchiveState(conversationId, true);

      if (selectedConversation === conversationId) {
        if (isDesktopViewport() && nextConversationId) {
          setSelectedConversation(nextConversationId);
          setMobileChatOpen(true);
        } else {
          setSelectedConversation(null);
          setMessages([]);
          setMobileChatOpen(false);
        }
      }
    },
    [
      archivedConversationIdSet,
      conversations,
      persistArchiveState,
      selectedConversation,
    ]
  );

  const handleRestoreConversation = useCallback((conversationId: string) => {
    removeArchivedConversationId(conversationId);
    void persistArchiveState(conversationId, false);
    setFilterTab('all');
    setSelectedConversation(conversationId);
    setMobileChatOpen(true);
  }, [persistArchiveState, removeArchivedConversationId]);

  const handleArchiveAction = () => {
    if (!activeConversation) {
      return;
    }

    if (isActiveConversationArchived) {
      handleRestoreConversation(activeConversation.id);
      return;
    }

    handleArchiveConversation(activeConversation.id);
  };

  const handleAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    const availableSlots = messageService.MAX_MESSAGE_ATTACHMENTS - pendingAttachments.length;

    if (availableSlots <= 0) {
      setPageError(`You can attach up to ${messageService.MAX_MESSAGE_ATTACHMENTS} images per message.`);
      return;
    }

    const acceptedFiles = files.slice(0, availableSlots);

    try {
      const nextAttachments = await Promise.all(
        acceptedFiles.map((file) => messageService.readImageFileForMessage(file))
      );
      setPendingAttachments((current) => [...current, ...nextAttachments]);
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to attach this image.');
    }
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId);
      if (attachment) {
        messageService.revokePendingAttachmentPreviews([attachment]);
      }

      return current.filter((item) => item.id !== attachmentId);
    });
  };

  const handleSendMessage = async () => {
    if ((!messageInput.trim() && pendingAttachments.length === 0) || !token || !user) return;

    const content = messageInput.trim();
    const attachmentsToSend = pendingAttachments;
    const attachmentUploads = messageService.toAttachmentUploads(attachmentsToSend);
    const tempAttachments = messageService.toPreviewMessageAttachments(attachmentsToSend);
    const fallbackContent =
      content ||
      (attachmentsToSend.length === 1
        ? 'Sent an image'
        : attachmentsToSend.length > 1
          ? `Sent ${attachmentsToSend.length} images`
          : '');
    setIsSending(true);
    setMessageInput('');
    setPendingAttachments([]);
    inputRef.current?.focus();

    if (selectedConversation) {
      const tempMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: selectedConversation,
        sender_id: user.id,
        content: fallbackContent,
        attachments: tempAttachments,
        event: null,
        is_read: false,
        created_at: new Date().toISOString(),
      };

      setMessages((current) => [...current, tempMessage]);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversation
            ? {
                ...conversation,
                last_message: {
                  content: fallbackContent,
                  created_at: tempMessage.created_at,
                  sender_id: user.id,
                  is_read: false,
                },
              }
            : conversation
        )
      );

      const { data, error } = await messageService.sendReply(
        token,
        selectedConversation,
        content,
        attachmentUploads
      );

      if (error || !data) {
        setPageError(error || 'Failed to send message');
        setMessages((current) => current.filter((item) => item.id !== tempMessage.id));
        setMessageInput(content);
        setPendingAttachments(attachmentsToSend);
        await loadConversations();
      } else {
        messageService.revokePendingAttachmentPreviews(attachmentsToSend);
        setMessages((current) => current.map((item) => (item.id === tempMessage.id ? data : item)));
        window.setTimeout(() => {
          void loadMessages(selectedConversation);
          void loadConversations();
        }, 1200);
      }

      setIsSending(false);
      return;
    }

    if (!draftTarget) {
      setIsSending(false);
      return;
    }

    const { data, error } = await messageService.sendMessage(
      token,
      draftTarget.listingId,
      content,
      draftTarget.recipientId ?? undefined,
      attachmentUploads
    );

    if (error || !data) {
      setPageError(error || 'Failed to start conversation');
      setPendingAttachments(attachmentsToSend);
      setIsSending(false);
      return;
    }

    messageService.revokePendingAttachmentPreviews(attachmentsToSend);
    setMessages([data]);
    setSelectedConversation(data.conversation_id);
    setMobileChatOpen(true);
    const nextConversations = await loadConversations();
    if (nextConversations?.some((conversation) => conversation.id === data.conversation_id)) {
      setDraftTarget(null);
    }
    window.setTimeout(() => {
      void loadMessages(data.conversation_id);
      void loadConversations();
    }, 1200);
    setIsSending(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const availableSlots = messageService.MAX_MESSAGE_ATTACHMENTS - pendingAttachments.length;
    if (availableSlots <= 0) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;

    event.preventDefault();

    try {
      const nextAttachments = await Promise.all(
        imageFiles.slice(0, availableSlots).map((file) => messageService.readImageFileForMessage(file))
      );
      setPendingAttachments((current) => [...current, ...nextAttachments]);
      setPageError(null);
    } catch {
      setPageError('Unable to paste this image.');
    }
  };

  const handleConversationSelect = (conversationId: string) => {
    setDraftTarget(null);
    setSelectedConversation(conversationId);
    setMobileChatOpen(true);
  };

  if (authLoading || loadingConversations || loadingArchives) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Loading messages...</div>;
  }

  return (
    <div className={styles.messagesPage}>
      <div className={styles.messagesContainer}>
        <div className={styles.conversationPanel}>
          <div className={styles.conversationHeader}>
            <div className={styles.headerRow}>
              <h1 className={styles.conversationTitle}>Messages</h1>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => void refreshCurrentView()}
              >
                <RefreshIcon />
                Refresh
              </button>
            </div>

            <div className={styles.filterTabs}>
              {(['all', 'unread', 'buying', 'selling', 'archived'] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`${styles.filterTab} ${filterTab === tab ? styles.filterTabActive : ''}`}
                  onClick={() => setFilterTab(tab)}
                  type="button"
                  id={`filter-${tab}`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.conversationSearch}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}>
                <SearchIcon />
              </span>
              <input
                type="text"
                placeholder="Search conversations..."
                className={styles.searchInput}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                id="search-conversations"
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.clearSearchButton}
                  onClick={() => setSearchQuery('')}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {pageError && <div className={styles.pageError}>{pageError}</div>}

          <div className={styles.conversationList}>
            {filteredConversationThreads.length === 0 ? (
              <div className={styles.emptyConversations}>
                <div className={styles.emptyConversationsIcon}>Chat</div>
                <div className={styles.emptyConversationsTitle}>
                  {filterTab === 'archived' ? 'No archived conversations' : 'No conversations found'}
                </div>
                <div className={styles.emptyConversationsDesc}>
                  {searchQuery
                    ? 'Try a different search term.'
                    : filterTab === 'archived'
                      ? 'Archived chats stay here until you restore them.'
                      : isAdminWorkspace
                        ? 'Use moderation threads to coordinate with marketplace members.'
                        : 'Start browsing to connect with other users.'}
                </div>
              </div>
            ) : (
              filteredConversationThreads.map(({ thread, contexts, previewConversation, unreadCount }) => {
                const conversation = previewConversation;
                const isUnread = unreadCount > 0;
                const isThreadActive = activeConversation
                  ? thread.conversations.some((item) => item.id === activeConversation.id)
                  : draftTarget?.recipientId
                    ? thread.conversations.some(
                        (item) => item.other_user?.id === draftTarget.recipientId
                      )
                    : false;
                const name = getConversationName(conversation);
                const avatarColor = getAvatarColor(conversation.other_user?.id || conversation.id);
                const initials = getInitials(name);
                const roleLabel = getThreadRoleLabel(contexts, user?.id);
                const productSummary = getThreadProductSummary(contexts);

                return (
                  <div
                    key={thread.key}
                    className={`${styles.conversationItem} ${
                      isThreadActive ? styles.conversationItemActive : ''
                    }`}
                    onClick={() => handleConversationSelect(conversation.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleConversationSelect(conversation.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    id={`conversation-thread-${thread.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                  >
                    <div className={`${styles.conversationAvatar} ${styles[avatarColor]}`}>
                      {conversation.other_user?.avatar_path ? (
                        <img
                          src={conversation.other_user.avatar_path}
                          alt={name}
                          className={styles.avatarImage}
                        />
                      ) : (
                        initials
                      )}
                    </div>

                    <div className={styles.conversationContent}>
                      <div className={styles.conversationTop}>
                        <span className={styles.conversationName}>
                          {name}
                          {conversation.other_user?.identity_verification_badge && (
                            <ReMarketVerifiedBadge compact className={styles.verifiedBadgeInline} />
                          )}
                        </span>
                        <span className={styles.conversationTime}>
                          {formatTime(conversation.last_message?.created_at || conversation.created_at)}
                        </span>
                      </div>

                      <div className={styles.conversationMetaRow}>
                        <span className={styles.rolePill}>{roleLabel}</span>
                        {contexts.length > 1 && (
                          <span className={styles.contextPill}>
                            {getContextCountLabel(contexts)}
                          </span>
                        )}
                        {conversation.other_user?.username && (
                          <span className={styles.usernameLabel}>@{conversation.other_user.username}</span>
                        )}
                      </div>

                      <div className={styles.conversationProduct}>
                        {productSummary}
                      </div>
                      <div className={styles.conversationPreview}>
                        {conversation.last_message ? conversation.last_message.content : 'No messages yet'}
                      </div>
                    </div>

                    {isUnread && (
                      <span className={styles.unreadBadge}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {activeConversation || draftTarget ? (
          <div className={`${styles.chatPanel} ${mobileChatOpen ? styles.chatPanelActive : ''}`}>
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderLeft}>
                <button
                  className={styles.mobileBackBtn}
                  onClick={() => setMobileChatOpen(false)}
                  type="button"
                  aria-label="Back to conversations"
                  id="mobile-back-btn"
                >
                  <ArrowLeftIcon />
                </button>

                <div
                  className={`${styles.chatHeaderAvatar} ${styles[getAvatarColor(activeConversation?.other_user?.id || activeListingId || 'draft-conversation')]}`}
                >
                  {activeOtherUserAvatar ? (
                    <img
                      src={activeOtherUserAvatar}
                      alt={activeOtherUserName}
                      className={styles.avatarImage}
                    />
                  ) : (
                    getInitials(activeOtherUserName)
                  )}
                </div>

                <div className={styles.chatHeaderInfo}>
                  <span className={styles.chatHeaderName}>
                    {activeOtherUserName}
                    {activeConversation?.other_user?.identity_verification_badge && (
                      <ReMarketVerifiedBadge className={styles.verifiedBadgeInline} />
                    )}
                  </span>
                  <span className={styles.chatHeaderSubline}>
                    {activeOtherUserUsername ? `@${activeOtherUserUsername} | ` : ''}
                    {draftTarget
                      ? 'New conversation'
                      : isActiveModerationThread
                        ? 'Account moderation thread'
                      : isActiveConversationArchived
                        ? 'Archived conversation'
                        : `${activeRoleLabel} for this listing`}
                  </span>
                </div>

                <div className={styles.chatHeaderProduct}>
                  <div className={styles.productThumbnail}>
                    {activeConversation?.listing_details?.cover_image_path || draftTarget?.coverImagePath ? (
                      <img
                        src={activeConversation?.listing_details?.cover_image_path || draftTarget?.coverImagePath || ''}
                        alt={activeListingTitle}
                      />
                    ) : (
                      <span className={styles.productThumbnailFallback}>
                        {activeListingTitle.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className={styles.productInfo}>
                    <span className={styles.productDiscussLabel}>
                      {isActiveModerationThread ? 'Topic' : 'Discussing'}
                    </span>
                    {activeConversation && activeContextOptions.length > 1 ? (
                      <select
                        className={styles.productContextSelect}
                        value={activeConversation.id}
                        onChange={(event) => {
                          setSelectedConversation(event.target.value);
                          setDraftTarget(null);
                          setMobileChatOpen(true);
                        }}
                        aria-label="Choose product context"
                      >
                        {activeContextOptions.map((conversation) => (
                          <option key={conversation.id} value={conversation.id}>
                            {getContextOptionLabel(conversation)}
                            {archivedConversationIdSet.has(conversation.id) ? ' (archived)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.productDiscussName}>{activeListingTitle}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.chatHeaderActions}>
                {canOpenActiveListing && (
                  <Link
                    href={`/product/${activeListingId}`}
                    className={`${styles.chatHeaderActionLink} ${styles.chatHeaderActionPrimary}`}
                  >
                    <ExternalLinkIcon />
                    View Listing
                  </Link>
                )}
                {activeConversation && (
                  <button
                    className={`${styles.chatHeaderActionLink} ${styles.chatHeaderActionArchive}`}
                    type="button"
                    onClick={handleArchiveAction}
                  >
                    {isActiveConversationArchived ? 'Restore Chat' : 'Archive Chat'}
                  </button>
                )}
                <button
                  className={styles.chatHeaderActionLink}
                  type="button"
                  onClick={() => void refreshCurrentView()}
                >
                  <RefreshIcon />
                  Refresh
                </button>
              </div>
            </div>

            <div className={styles.chatMessages}>
              {draftTarget && messages.length === 0 ? (
                <div className={styles.composerCard}>
                  <h2 className={styles.composerTitle}>Start the conversation</h2>
                  <p className={styles.composerText}>
                    {draftTarget.isModeration
                      ? `Send the first moderation message to ${draftTarget.otherUserName} about this account review.`
                      : `Send the first message to ${draftTarget.otherUserName} about ${draftTarget.listingTitle}.`}
                  </p>
                </div>
              ) : loadingMessages && messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  Loading messages...
                </div>
              ) : (
                messages.map((message) => {
                  const isMe = message.sender_id === user?.id;

                  return (
                    <div
                      key={message.id}
                      className={`${styles.messageGroup} ${
                        isMe ? styles.messageGroupSent : styles.messageGroupReceived
                      }`}
                    >
                      {!isMe && (
                        <div
                          className={`${styles.messageAvatar} ${styles[getAvatarColor(activeConversation?.other_user?.id || activeListingId || message.id)]}`}
                        >
                          {activeOtherUserAvatar ? (
                            <img
                              src={activeOtherUserAvatar}
                              alt={activeOtherUserName}
                              className={styles.avatarImage}
                            />
                          ) : (
                            getInitials(activeOtherUserName).charAt(0)
                          )}
                        </div>
                      )}

                      <div className={styles.messageContent}>
                        <div
                          className={`${styles.messageBubble} ${
                            isMe ? styles.messageBubbleSent : styles.messageBubbleReceived
                          }`}
                        >
                          {message.attachments?.length > 0 && (
                            <div className={styles.messageAttachments}>
                              {message.attachments.map((attachment) => (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <button
                                  key={attachment.id || attachment.url}
                                  type="button"
                                  className={styles.messageAttachmentLink}
                                  onClick={() => setLightboxSrc(attachment.url)}
                                  aria-label="View image"
                                >
                                  <img src={attachment.url} alt={attachment.file_name || 'Message attachment'} />
                                </button>
                              ))}
                            </div>
                          )}
                          {message.content && <p className={styles.messageText}>{message.content}</p>}
                        </div>
                        <div
                          className={`${styles.messageTime} ${
                            isMe ? styles.messageTimeSent : styles.messageTimeReceived
                          }`}
                        >
                          {formatTime(message.created_at)}
                          {isMe && (
                            <span className={styles.readReceipt}>
                              {message.is_read ? <DoubleCheckIcon /> : <CheckIcon />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.chatInputArea}>
              {pendingAttachments.length > 0 && (
                <div className={styles.pendingAttachments}>
                  {pendingAttachments.map((attachment) => (
                    <div key={attachment.id} className={styles.pendingAttachment}>
                      <img src={attachment.previewUrl} alt={attachment.fileName} />
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(attachment.id)}
                        aria-label={`Remove ${attachment.fileName}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.chatInputRow}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className={styles.hiddenFileInput}
                  onChange={(event) => void handleAttachmentSelect(event)}
                />
                <button
                  type="button"
                  className={styles.chatAttachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || pendingAttachments.length >= messageService.MAX_MESSAGE_ATTACHMENTS}
                  aria-label="Attach images"
                >
                  <ImageIcon />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={
                    draftTarget
                      ? `Message ${draftTarget.otherUserName}...`
                      : 'Write a message... (Ctrl+V to paste image)'
                  }
                  className={styles.chatInput}
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={(event) => void handlePaste(event)}
                  id="message-input"
                  disabled={isSending}
                />
                <button
                  className={`${styles.chatSendBtn} ${
                    (!messageInput.trim() && pendingAttachments.length === 0) || isSending ? styles.chatSendBtnDisabled : ''
                  }`}
                  onClick={() => void handleSendMessage()}
                  disabled={(!messageInput.trim() && pendingAttachments.length === 0) || isSending}
                  type="button"
                  aria-label="Send message"
                  id="send-message-btn"
                >
                  <SendIcon />
                </button>
              </div>

              <div className={styles.chatActionsBar}>
                <div className={styles.chatActionsLeft}>
                  {canOpenActiveListing && (
                    <Link href={`/product/${activeListingId}`} className={styles.chatActionBtn}>
                      <ExternalLinkIcon />
                      View Listing
                    </Link>
                  )}
                    <Link href={secondaryRoute} className={styles.chatActionBtn}>
                      <ExternalLinkIcon />
                      {secondaryLabel}
                    </Link>
                  </div>
                  <span className={styles.chatActionHint}>Press Enter to send</span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyChatPanel}>
            <div className={styles.emptyChatIcon}>
              <BigMessageIcon />
            </div>
            <div className={styles.emptyChatTitle}>Select a conversation</div>
            <div className={styles.emptyChatDesc}>
              {isAdminWorkspace
                ? 'Choose a moderation conversation from the sidebar to continue helping marketplace members.'
                : 'Choose a conversation from the sidebar to start messaging, or browse listings to connect with sellers.'}
            </div>
            <div className={styles.emptyChatActions}>
              <Link href={browseRoute} className={styles.emptyChatAction}>
                {isAdminWorkspace ? 'Open Overview' : 'Browse Listings'}
              </Link>
              <Link href={secondaryRoute} className={styles.emptyChatActionSecondary}>
                {isAdminWorkspace ? 'Review Users' : 'View Offers'}
              </Link>
            </div>
          </div>
        )}
      </div>

      <ImageLightbox
        src={lightboxSrc}
        alt="Message image"
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}
