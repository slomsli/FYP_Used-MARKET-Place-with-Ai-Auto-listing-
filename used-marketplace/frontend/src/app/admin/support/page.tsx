'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  fetchConversations,
  fetchMessages,
  MAX_MESSAGE_ATTACHMENTS,
  markAsRead,
  readImageFileForMessage,
  revokePendingAttachmentPreviews,
  sendReply,
  toAttachmentUploads,
  toPreviewMessageAttachments,
  updateSupportTicketStatus,
  type ChatMessage,
  type ConversationDetail,
  type PendingMessageAttachment,
  type SupportTicketStatus,
} from '@/src/services/messageService';
import ImageLightbox from '@/src/components/ui/ImageLightbox';
import styles from './page.module.css';

const SUPPORT_TICKET_TITLE_PREFIX = 'Support request:';

type TicketCategory = 'system' | 'listing' | 'account' | 'payment' | 'safety' | 'other';
type TicketFilter = 'all' | 'needsReply' | 'resolved' | 'closed' | TicketCategory;
type TicketPriority = 'urgent' | 'normal';
type TicketStateTone = 'new' | 'needs' | 'waiting' | 'resolved' | 'closed';

interface CategoryDefinition {
  key: TicketCategory;
  label: string;
  shortLabel: string;
  description: string;
  keywords: string[];
}

interface TicketView {
  id: string;
  conversation: ConversationDetail;
  title: string;
  requesterName: string;
  requesterUsername: string | null;
  requesterId: string | null;
  preview: string;
  category: TicketCategory;
  priority: TicketPriority;
  supportStatus: SupportTicketStatus;
  needsReply: boolean;
  stateLabel: string;
  stateTone: TicketStateTone;
  lastActivityAt: string;
  searchText: string;
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    key: 'system',
    label: 'System problems',
    shortLabel: 'System',
    description: 'Bugs, broken pages, errors, and loading issues.',
    keywords: ['bug', 'error', 'not working', 'crash', 'loading', 'broken', 'system', 'server', 'page'],
  },
  {
    key: 'listing',
    label: 'Listings',
    shortLabel: 'Listing',
    description: 'Adding, editing, deleting, or uploading listing details.',
    keywords: ['listing', 'post', 'add', 'upload', 'photo', 'image', 'edit', 'delete', 'item', 'product', 'sell'],
  },
  {
    key: 'account',
    label: 'Accounts',
    shortLabel: 'Account',
    description: 'Login, verification, profile, password, or account access.',
    keywords: ['login', 'sign in', 'password', 'verify', 'verification', 'account', 'profile', 'email', 'suspended', 'ban'],
  },
  {
    key: 'payment',
    label: 'Purchases',
    shortLabel: 'Purchase',
    description: 'Payments, refunds, offers, sold items, and purchase confusion.',
    keywords: ['payment', 'pay', 'paid', 'refund', 'offer', 'price', 'sale', 'sold', 'purchase', 'buy'],
  },
  {
    key: 'safety',
    label: 'Safety reports',
    shortLabel: 'Safety',
    description: 'Scams, fake users, abuse, fraud, or unsafe behavior.',
    keywords: ['scam', 'fake', 'fraud', 'report', 'abuse', 'harassment', 'unsafe', 'threat', 'spam'],
  },
  {
    key: 'other',
    label: 'Other help',
    shortLabel: 'Other',
    description: 'Questions that do not fit the main support lanes yet.',
    keywords: [],
  },
];

const FILTER_OPTIONS: Array<{ key: TicketFilter; label: string; description: string }> = [
  { key: 'all', label: 'All tickets', description: 'Everything assigned to you.' },
  { key: 'needsReply', label: 'Needs admin', description: 'User is waiting for an answer.' },
  { key: 'resolved', label: 'Resolved', description: 'Solved but still visible for follow-up.' },
  { key: 'closed', label: 'Closed', description: 'Finished tickets that cannot receive replies.' },
  ...CATEGORY_DEFINITIONS.map((category) => ({
    key: category.key,
    label: category.label,
    description: category.description,
  })),
];

const QUICK_REPLIES: Record<TicketCategory, string[]> = {
  system: [
    'Thanks for reporting this. Please send the exact error message and what page you were using.',
    'I am checking this system issue now. If you can, attach a screenshot of the broken screen.',
  ],
  listing: [
    'I can help with the listing. Please tell me the listing title and what step fails.',
    'Please try saving once more and tell me if the same listing error appears.',
  ],
  account: [
    'I can check your account access. Please confirm the email address on your marketplace account.',
    'Thanks. I am reviewing your account status and will update you here.',
  ],
  payment: [
    'I can review this purchase issue. Please share the item name and the offer or payment details.',
    'Thanks for the details. I will check the transaction-related messages and reply here.',
  ],
  safety: [
    'Thanks for reporting this. Please do not continue the deal until we review the details.',
    'Please send any username, listing title, or message screenshot connected to this safety concern.',
  ],
  other: [
    'Thanks for contacting support. Please share one more detail so I can route this correctly.',
    'I am reviewing this request now and will keep the update inside this ticket.',
  ],
};

const categoryToneClass: Record<TicketCategory, string> = {
  system: styles.categorySystem,
  listing: styles.categoryListing,
  account: styles.categoryAccount,
  payment: styles.categoryPayment,
  safety: styles.categorySafety,
  other: styles.categoryOther,
};

const priorityToneClass: Record<TicketPriority, string> = {
  urgent: styles.priorityUrgent,
  normal: styles.priorityNormal,
};

const stateToneClass: Record<TicketStateTone, string> = {
  new: styles.stateNew,
  needs: styles.stateNeeds,
  waiting: styles.stateWaiting,
  resolved: styles.stateResolved,
  closed: styles.stateClosed,
};

function TicketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
      <path d="M9 9h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15.55-6.36L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15.55 6.36L3 16" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function isSupportTicket(conversation: ConversationDetail) {
  return Boolean(
    conversation.listing_details?.is_moderation &&
      conversation.listing_details.title.startsWith(SUPPORT_TICKET_TITLE_PREFIX)
  );
}

function getTicketTitle(conversation: ConversationDetail) {
  const listingTitle = conversation.listing_details?.title ?? '';

  if (!listingTitle.startsWith(SUPPORT_TICKET_TITLE_PREFIX)) {
    return listingTitle || 'Support request';
  }

  return listingTitle.slice(SUPPORT_TICKET_TITLE_PREFIX.length).trim() || 'Support request';
}

function getCategoryMeta(category: TicketCategory) {
  return (
    CATEGORY_DEFINITIONS.find((definition) => definition.key === category) ??
    CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1]
  );
}

function inferCategory(text: string): TicketCategory {
  const normalized = text.toLowerCase();
  const orderedCategories: TicketCategory[] = ['listing', 'account', 'payment', 'safety', 'system'];

  for (const categoryKey of orderedCategories) {
    const category = getCategoryMeta(categoryKey);

    if (category.keywords.some((keyword) => normalized.includes(keyword))) {
      return category.key;
    }
  }

  return 'other';
}

function inferPriority(text: string): TicketPriority {
  const normalized = text.toLowerCase();
  const urgentWords = [
    'urgent',
    'blocked',
    'cannot',
    'can not',
    "can't",
    'cant',
    'error',
    'scam',
    'fraud',
    'suspended',
    'hacked',
    'refund',
  ];

  return urgentWords.some((word) => normalized.includes(word)) ? 'urgent' : 'normal';
}

function getRequesterName(conversation: ConversationDetail) {
  return conversation.other_user?.display_name || conversation.other_user?.username || 'Marketplace member';
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

function getTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatTicketTime(value?: string) {
  if (!value) {
    return 'No activity';
  }

  const timestamp = getTimestamp(value);

  if (!timestamp) {
    return 'Recently';
  }

  return new Intl.DateTimeFormat('en-MY', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatRelativeAge(value?: string) {
  if (!value) {
    return 'No activity yet';
  }

  const timestamp = getTimestamp(value);

  if (!timestamp) {
    return 'Recently';
  }

  const diffMinutes = Math.max(Math.floor((Date.now() - timestamp) / 60000), 0);

  if (diffMinutes < 60) {
    return `${diffMinutes || 1} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function buildTicketView(conversation: ConversationDetail, adminUserId?: string): TicketView {
  const title = getTicketTitle(conversation);
  const requesterName = getRequesterName(conversation);
  const requesterUsername = conversation.other_user?.username ?? null;
  const requesterId = conversation.other_user?.id ?? null;
  const preview = conversation.last_message?.content || 'No message is available yet.';
  const searchBody = [title, requesterName, requesterUsername, preview].filter(Boolean).join(' ');
  const category = inferCategory(searchBody);
  const priority = inferPriority(searchBody);
  const supportStatus = conversation.listing_details?.support_status ?? 'open';
  const needsReply = supportStatus === 'open' && (!conversation.last_message || conversation.last_message.sender_id !== adminUserId);
  const stateTone: TicketStateTone =
    supportStatus === 'closed'
      ? 'closed'
      : supportStatus === 'resolved'
        ? 'resolved'
        : conversation.unread_count > 0
          ? 'new'
          : needsReply
            ? 'needs'
            : 'waiting';
  const stateLabel =
    stateTone === 'closed'
      ? 'Closed'
      : stateTone === 'resolved'
        ? 'Resolved'
        : stateTone === 'new'
      ? 'New user reply'
      : stateTone === 'needs'
        ? 'Needs admin'
        : 'Waiting on user';

  return {
    id: conversation.id,
    conversation,
    title,
    requesterName,
    requesterUsername,
    requesterId,
    preview,
    category,
    priority,
    supportStatus,
    needsReply,
    stateLabel,
    stateTone,
    lastActivityAt: conversation.last_message?.created_at || conversation.created_at,
    searchText: `${searchBody} ${category}`.toLowerCase(),
  };
}

export default function AdminSupportPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [supportConversations, setSupportConversations] = useState<ConversationDetail[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messagesByTicket, setMessagesByTicket] = useState<Record<string, ChatMessage[]>>({});
  const [activeFilter, setActiveFilter] = useState<TicketFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingMessageAttachment[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<SupportTicketStatus | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<PendingMessageAttachment[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const loadTickets = useCallback(
    async (preferredTicketId?: string, showLoader = false) => {
      if (!token) {
        setLoadingTickets(false);
        return;
      }

      if (showLoader) {
        setLoadingTickets(true);
      }

      const response = await fetchConversations(token);

      if (!response.data) {
        setPageError(response.error || 'Unable to load support tickets.');
        setLoadingTickets(false);
        return;
      }

      const nextTickets = response.data.filter(isSupportTicket);
      setSupportConversations(nextTickets);
      setPageError(null);
      setLoadingTickets(false);
      setSelectedTicketId((currentTicketId) => {
        if (preferredTicketId && nextTickets.some((ticket) => ticket.id === preferredTicketId)) {
          return preferredTicketId;
        }

        if (currentTicketId && nextTickets.some((ticket) => ticket.id === currentTicketId)) {
          return currentTicketId;
        }

        return nextTickets[0]?.id ?? null;
      });
    },
    [token]
  );

  useEffect(() => {
    if (authLoading || !token) {
      return;
    }

    void loadTickets(undefined, true);

    const interval = window.setInterval(() => {
      void loadTickets();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [authLoading, loadTickets, token]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(
    () => () => {
      revokePendingAttachmentPreviews(pendingAttachmentsRef.current);
    },
    []
  );

  const ticketViews = useMemo(
    () => supportConversations.map((conversation) => buildTicketView(conversation, user?.id)),
    [supportConversations, user?.id]
  );

  const filterCounts = useMemo<Record<TicketFilter, number>>(
    () => ({
      all: ticketViews.length,
      needsReply: ticketViews.filter((ticket) => ticket.needsReply).length,
      resolved: ticketViews.filter((ticket) => ticket.supportStatus === 'resolved').length,
      closed: ticketViews.filter((ticket) => ticket.supportStatus === 'closed').length,
      system: ticketViews.filter((ticket) => ticket.category === 'system').length,
      listing: ticketViews.filter((ticket) => ticket.category === 'listing').length,
      account: ticketViews.filter((ticket) => ticket.category === 'account').length,
      payment: ticketViews.filter((ticket) => ticket.category === 'payment').length,
      safety: ticketViews.filter((ticket) => ticket.category === 'safety').length,
      other: ticketViews.filter((ticket) => ticket.category === 'other').length,
    }),
    [ticketViews]
  );

  const visibleTickets = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return ticketViews.filter((ticket) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'needsReply'
          ? ticket.needsReply
          : activeFilter === 'resolved' || activeFilter === 'closed'
            ? ticket.supportStatus === activeFilter
            : ticket.category === activeFilter);
      const matchesSearch = !normalizedSearch || ticket.searchText.includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchQuery, ticketViews]);

  const activeTicket = ticketViews.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const activeMessages = activeTicket ? messagesByTicket[activeTicket.id] ?? [] : [];
  const activeCategory = activeTicket ? getCategoryMeta(activeTicket.category) : null;

  useEffect(() => {
    setSelectedTicketId((currentTicketId) => {
      return currentTicketId && visibleTickets.some((ticket) => ticket.id === currentTicketId)
        ? currentTicketId
        : null;
    });
  }, [visibleTickets]);

  useEffect(() => {
    const authToken = token;
    const ticketId = selectedTicketId;

    if (!authToken || !ticketId) {
      setLoadingMessages(false);
      return;
    }

    let cancelled = false;
    const safeToken: string = authToken;
    const safeTicketId: string = ticketId;

    async function loadMessages(showLoader = false) {
      if (showLoader) {
        setLoadingMessages(true);
      }

      const response = await fetchMessages(safeToken, safeTicketId);

      if (cancelled) {
        return;
      }

      if (!response.data) {
        setPageError(response.error || 'Unable to load this ticket conversation.');
        setLoadingMessages(false);
        return;
      }

      setMessagesByTicket((current) => ({
        ...current,
        [safeTicketId]: response.data ?? [],
      }));
      setPageError(null);
      setLoadingMessages(false);

      const readResponse = await markAsRead(safeToken, safeTicketId);

      if (!cancelled && !readResponse.error) {
        setSupportConversations((current) =>
          current.map((conversation) =>
            conversation.id === safeTicketId
              ? {
                  ...conversation,
                  unread_count: 0,
                  last_message: conversation.last_message
                    ? {
                        ...conversation.last_message,
                        is_read: true,
                      }
                    : conversation.last_message,
                }
              : conversation
          )
        );
      }
    }

    void loadMessages(true);

    const interval = window.setInterval(() => {
      void loadMessages();
    }, 7000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedTicketId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeMessages.length, selectedTicketId]);

  function handleQuickReply(text: string) {
    setReplyText((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
  }

  async function handlePasteForAttachments(
    event: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>
  ) {
    const items = event.clipboardData?.items;
    if (!items) return;

    const availableSlots = MAX_MESSAGE_ATTACHMENTS - pendingAttachments.length;
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
        imageFiles.slice(0, availableSlots).map((file) => readImageFileForMessage(file))
      );
      setPendingAttachments((current) => [...current, ...nextAttachments]);
      setPageError(null);
    } catch {
      setPageError('Unable to paste this image.');
    }
  }

  async function handleAttachmentSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    const availableSlots = MAX_MESSAGE_ATTACHMENTS - pendingAttachments.length;

    if (availableSlots <= 0) {
      setPageError(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} images per message.`);
      return;
    }

    try {
      const nextAttachments = await Promise.all(
        files.slice(0, availableSlots).map((file) => readImageFileForMessage(file))
      );
      setPendingAttachments((current) => [...current, ...nextAttachments]);
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to attach this image.');
    }
  }

  function removePendingAttachment(attachmentId: string) {
    setPendingAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId);
      if (attachment) {
        revokePendingAttachmentPreviews([attachment]);
      }

      return current.filter((item) => item.id !== attachmentId);
    });
  }

  async function handleStatusUpdate(status: SupportTicketStatus) {
    if (!token || !activeTicket || updatingStatus) {
      return;
    }

    setUpdatingStatus(status);
    setPageError(null);

    const response = await updateSupportTicketStatus(token, activeTicket.id, status);
    setUpdatingStatus(null);

    if (!response.data) {
      setPageError(response.error || 'Unable to update this support ticket.');
      return;
    }

    setMessagesByTicket((current) => ({
      ...current,
      [activeTicket.id]: [...(current[activeTicket.id] ?? []), response.data!.message],
    }));
    await loadTickets(activeTicket.id);
  }

  async function handleReply() {
    const content = replyText.trim();

    if (
      !token ||
      !user ||
      !activeTicket ||
      (!content && pendingAttachments.length === 0) ||
      activeTicket.supportStatus === 'closed' ||
      sendingReply
    ) {
      return;
    }

    const attachmentsToSend = pendingAttachments;
    const attachmentUploads = toAttachmentUploads(attachmentsToSend);
    const tempAttachments = toPreviewMessageAttachments(attachmentsToSend);
    const fallbackContent =
      content ||
      (attachmentsToSend.length === 1
        ? 'Sent an image'
        : attachmentsToSend.length > 1
          ? `Sent ${attachmentsToSend.length} images`
          : '');
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeTicket.id,
      sender_id: user.id,
      content: fallbackContent,
      attachments: tempAttachments,
      event: null,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    setSendingReply(true);
    setReplyText('');
    setPendingAttachments([]);
    setPageError(null);
    setMessagesByTicket((current) => ({
      ...current,
      [activeTicket.id]: [...(current[activeTicket.id] ?? []), tempMessage],
    }));
    setSupportConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeTicket.id
          ? {
              ...conversation,
              unread_count: 0,
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

    const response = await sendReply(token, activeTicket.id, content, attachmentUploads);
    setSendingReply(false);

    if (!response.data) {
      setPageError(response.error || 'Unable to send the support reply.');
      setReplyText(content);
      setPendingAttachments(attachmentsToSend);
      setMessagesByTicket((current) => ({
        ...current,
        [activeTicket.id]: (current[activeTicket.id] ?? []).filter((message) => message.id !== tempMessage.id),
      }));
      return;
    }

    revokePendingAttachmentPreviews(attachmentsToSend);
    setMessagesByTicket((current) => ({
      ...current,
      [activeTicket.id]: (current[activeTicket.id] ?? []).map((message) =>
        message.id === tempMessage.id ? response.data! : message
      ),
    }));
    await loadTickets(activeTicket.id);
  }

  if (authLoading || !user) {
    return <div className={styles.loadingState}>Preparing support tickets...</div>;
  }

  const urgentCount = ticketViews.filter((ticket) => ticket.priority === 'urgent').length;
  const waitingCount = ticketViews.filter((ticket) => !ticket.needsReply).length;
  const systemCount = filterCounts.system;
  const listingCount = filterCounts.listing;
  const oldestWaitingTicket = ticketViews
    .filter((ticket) => ticket.needsReply)
    .sort((first, second) => getTimestamp(first.lastActivityAt) - getTimestamp(second.lastActivityAt))[0];
  const metrics = [
    {
      label: 'Assigned tickets',
      value: ticketViews.length.toLocaleString(),
      detail: 'Only support requests, not normal chats.',
    },
    {
      label: 'Needs admin',
      value: filterCounts.needsReply.toLocaleString(),
      detail: oldestWaitingTicket ? `Oldest waiting ${formatRelativeAge(oldestWaitingTicket.lastActivityAt)}` : 'Queue is clear.',
    },
    {
      label: 'Urgent flags',
      value: urgentCount.toLocaleString(),
      detail: 'Blockers, fraud, refunds, or suspended access.',
    },
    {
      label: 'System / listing',
      value: `${systemCount}/${listingCount}`,
      detail: 'Separated so issues do not mix together.',
    },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Support Command Center</p>
          <h1 className={styles.title}>Arrange every user problem before it becomes messy.</h1>
          <p className={styles.subtitle}>
            Support tickets are separated from the normal inbox and grouped by problem type, urgency,
            and whether the member is waiting for admin.
          </p>
          <div className={styles.heroBadges}>
            <span>Auto assigned</span>
            <span>Category lanes</span>
            <span>Reply workspace</span>
          </div>
        </div>

        <div className={styles.heroCard}>
          <div className={styles.heroIcon}>
            <TicketIcon />
          </div>
          <span className={styles.heroCardLabel}>Needs admin now</span>
          <strong>{filterCounts.needsReply.toLocaleString()}</strong>
          <p>{waitingCount.toLocaleString()} ticket(s) are waiting on the user.</p>
        </div>
      </section>

      {pageError && <div className={styles.errorBox}>{pageError}</div>}

      <section className={styles.metricsGrid}>
        {metrics.map((metric) => (
          <article key={metric.label} className={styles.metricCard}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.workspace}>
        <div className={`${styles.queueColumn} ${selectedTicketId ? styles.queueColumnHidden : ''}`}>
          <aside className={styles.triageRail}>
            <div className={styles.railHeader}>
              <p className={styles.sectionEyebrow}>Triage lanes</p>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => void loadTickets(selectedTicketId ?? undefined, true)}
              >
                <RefreshIcon />
                Refresh
              </button>
            </div>

            <div className={styles.filterList}>
              {FILTER_OPTIONS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`${styles.filterButton} ${activeFilter === filter.key ? styles.filterButtonActive : ''}`}
                  onClick={() => setActiveFilter(filter.key)}
                >
                  <span>
                    <strong>{filter.label}</strong>
                    <small>{filter.description}</small>
                  </span>
                  <em>{filterCounts[filter.key].toLocaleString()}</em>
                </button>
              ))}
            </div>
          </aside>

          <section className={styles.ticketStack}>
            <div className={styles.stackHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Ticket queue</p>
                <h2>{visibleTickets.length.toLocaleString()} visible ticket(s)</h2>
              </div>
              <span>{loadingTickets ? 'Syncing...' : 'Live'}</span>
            </div>

            <label className={styles.searchBox}>
              <SearchIcon />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search user, subject, issue, or category..."
              />
            </label>

            <div className={styles.ticketList}>
              {loadingTickets && ticketViews.length === 0 ? (
                <div className={styles.emptyState}>Loading support tickets...</div>
              ) : visibleTickets.length === 0 ? (
                <div className={styles.emptyState}>
                  No support tickets match this lane yet. Try all tickets or clear the search.
                </div>
              ) : (
                visibleTickets.map((ticket) => {
                  const category = getCategoryMeta(ticket.category);
                  const isSelected = ticket.id === activeTicket?.id;

                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      className={`${styles.ticketCard} ${isSelected ? styles.ticketCardActive : ''}`}
                      onClick={() => setSelectedTicketId(ticket.id)}
                    >
                      <span className={`${styles.cardStripe} ${categoryToneClass[ticket.category]}`} />
                      <span className={styles.ticketCardTop}>
                        <span className={`${styles.categoryPill} ${categoryToneClass[ticket.category]}`}>
                          {category.shortLabel}
                        </span>
                        <span className={`${styles.priorityPill} ${priorityToneClass[ticket.priority]}`}>
                          {ticket.priority === 'urgent' ? 'Urgent' : 'Normal'}
                        </span>
                      </span>
                      <strong className={styles.ticketTitle}>{ticket.title}</strong>
                      <span className={styles.ticketPreview}>{ticket.preview}</span>
                      <span className={styles.ticketFooter}>
                        <span>{ticket.requesterName}</span>
                        <span className={`${styles.statePill} ${stateToneClass[ticket.stateTone]}`}>
                          {ticket.stateLabel}
                        </span>
                        <time className={styles.ticketTime}>{formatRelativeAge(ticket.lastActivityAt)}</time>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <section className={`${styles.detailPanel} ${!selectedTicketId ? styles.detailPanelHidden : ''}`}>
          {!activeTicket ? (
            <div className={styles.detailEmpty}>
              <TicketIcon />
              <h2>Select a support ticket</h2>
              <p>Choose a lane or ticket from the queue to see the full conversation and reply.</p>
            </div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div className={styles.requesterBlock}>
                  <button
                    type="button"
                    className={styles.closePanelButton}
                    onClick={() => setSelectedTicketId(null)}
                    aria-label="Close ticket view"
                  >
                    <CloseIcon />
                  </button>
                  <div className={styles.requesterAvatar}>{getInitials(activeTicket.requesterName)}</div>
                  <div>
                    <p className={styles.sectionEyebrow}>Ticket owner</p>
                    <h2>{activeTicket.requesterName}</h2>
                    <span>
                      {activeTicket.requesterUsername ? `@${activeTicket.requesterUsername}` : 'No username'} ·{' '}
                      {formatTicketTime(activeTicket.lastActivityAt)}
                    </span>
                  </div>
                </div>

                <div className={styles.detailActions}>
                  <Link
                    href={`${ROUTES.ADMIN_USERS}?q=${encodeURIComponent(
                      activeTicket.requesterUsername || activeTicket.requesterId || activeTicket.requesterName
                    )}`}
                    className={styles.userLink}
                  >
                    Find user
                  </Link>
                  {activeTicket.supportStatus !== 'open' ? (
                    <button
                      type="button"
                      className={styles.statusAction}
                      onClick={() => void handleStatusUpdate('open')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'open' ? 'Reopening...' : 'Reopen'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.statusAction}
                      onClick={() => void handleStatusUpdate('resolved')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'resolved' ? 'Updating...' : 'Mark resolved'}
                    </button>
                  )}
                  {activeTicket.supportStatus !== 'closed' && (
                    <button
                      type="button"
                      className={`${styles.statusAction} ${styles.statusActionDanger}`}
                      onClick={() => void handleStatusUpdate('closed')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'closed' ? 'Closing...' : 'Close ticket'}
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.issueHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Issue summary</p>
                  <h3>{activeTicket.title}</h3>
                </div>
                <div className={styles.issueBadges}>
                  {activeCategory && (
                    <span className={`${styles.categoryPill} ${categoryToneClass[activeTicket.category]}`}>
                      {activeCategory.shortLabel}
                    </span>
                  )}
                  <span className={`${styles.priorityPill} ${priorityToneClass[activeTicket.priority]}`}>
                    {activeTicket.priority === 'urgent' ? 'Urgent' : 'Normal'}
                  </span>
                  <span className={`${styles.statePill} ${stateToneClass[activeTicket.stateTone]}`}>
                    {activeTicket.stateLabel}
                  </span>
                </div>
              </div>

              <div className={styles.summaryGrid}>
                <div>
                  <span>Category</span>
                  <strong>{activeCategory?.label ?? 'Other help'}</strong>
                </div>
                <div>
                  <span>Assigned to</span>
                  <strong>You</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{activeTicket.stateLabel}</strong>
                </div>
                <div>
                  <span>Last activity</span>
                  <strong>{formatRelativeAge(activeTicket.lastActivityAt)}</strong>
                </div>
              </div>

              <div className={styles.messageTimeline}>
                {loadingMessages && activeMessages.length === 0 ? (
                  <div className={styles.emptyState}>Loading conversation...</div>
                ) : activeMessages.length === 0 ? (
                  <div className={styles.emptyState}>No messages are available for this ticket yet.</div>
                ) : (
                  activeMessages.map((message) => {
                    const isMine = message.sender_id === user.id;

                    return (
                      <article
                        key={message.id}
                        className={`${styles.messageBubble} ${isMine ? styles.messageAdmin : styles.messageUser}`}
                      >
                        <span className={styles.messageAuthor}>{isMine ? 'Admin reply' : activeTicket.requesterName}</span>
                        {message.attachments?.length > 0 && (
                          <div className={styles.messageAttachments}>
                            {message.attachments.map((attachment) => (
                              <button
                                key={attachment.id || attachment.url}
                                type="button"
                                className={styles.attachmentThumb}
                                onClick={() => setLightboxSrc(attachment.url)}
                                aria-label="View image"
                              >
                                <img src={attachment.url} alt={attachment.file_name || 'Ticket image'} />
                              </button>
                            ))}
                          </div>
                        )}
                        {message.content && <p>{message.content}</p>}
                        <time>{formatTicketTime(message.created_at)}</time>
                      </article>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className={styles.quickReplyPanel}>
                <p className={styles.sectionEyebrow}>Fast replies</p>
                <div className={styles.quickReplies}>
                  {QUICK_REPLIES[activeTicket.category].map((reply) => (
                    <button key={reply} type="button" onClick={() => handleQuickReply(reply)}>
                      {reply}
                    </button>
                  ))}
                </div>
              </div>

              <form
                className={styles.replyBox}
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleReply();
                }}
              >
                {activeTicket.supportStatus === 'closed' && (
                  <div className={styles.closedNotice}>
                    This ticket is closed. Reopen it before sending another reply.
                  </div>
                )}
                {pendingAttachments.length > 0 && (
                  <div className={styles.pendingAttachments}>
                    {pendingAttachments.map((attachment) => (
                      <div key={attachment.id} className={styles.pendingAttachment}>
                        <img src={attachment.previewUrl} alt={attachment.fileName} />
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(attachment.id)}
                          aria-label={`Remove ${attachment.fileName}`}
                          title="Remove image"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className={styles.hiddenFileInput}
                  onChange={(event) => void handleAttachmentSelect(event)}
                />
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  onPaste={(event) => void handlePasteForAttachments(event)}
                  placeholder="Write the admin response here... (Ctrl+V to paste image)"
                  maxLength={2000}
                  rows={4}
                  disabled={activeTicket.supportStatus === 'closed'}
                />
                <div className={styles.replyActions}>
                  <button
                    type="button"
                    className={styles.attachButton}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={
                      activeTicket.supportStatus === 'closed' ||
                      sendingReply ||
                      pendingAttachments.length >= MAX_MESSAGE_ATTACHMENTS
                    }
                  >
                    <ImageIcon />
                    Add image
                  </button>
                  <button
                    type="submit"
                    disabled={
                      (!replyText.trim() && pendingAttachments.length === 0) ||
                      activeTicket.supportStatus === 'closed' ||
                      sendingReply
                    }
                  >
                    <SendIcon />
                    {sendingReply ? 'Sending...' : 'Send reply'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </section>

      <ImageLightbox
        src={lightboxSrc}
        alt="Ticket image"
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}
