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

/* ─────────────────────────────────────────────
   Types & Constants
───────────────────────────────────────────── */
const SUPPORT_TICKET_TITLE_PREFIX = 'Support request:';

type TicketCategory = 'system' | 'listing' | 'account' | 'payment' | 'safety' | 'other';
type TicketFilter   = 'all' | 'needsReply' | 'resolved' | 'closed' | TicketCategory;
type TicketPriority = 'urgent' | 'normal';
type TicketStateTone = 'new' | 'needs' | 'waiting' | 'resolved' | 'closed';

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
  unreadCount: number;
  searchText: string;
}

const CATEGORY_DEFINITIONS = [
  { key: 'system'  as TicketCategory, label: 'System problems',  shortLabel: 'System',   keywords: ['bug','error','not working','crash','loading','broken','system','server','page'] },
  { key: 'listing' as TicketCategory, label: 'Listings',          shortLabel: 'Listing',  keywords: ['listing','post','add','upload','photo','image','edit','delete','item','product','sell'] },
  { key: 'account' as TicketCategory, label: 'Accounts',          shortLabel: 'Account',  keywords: ['login','sign in','password','verify','verification','account','profile','email','suspended','ban'] },
  { key: 'payment' as TicketCategory, label: 'Purchases',         shortLabel: 'Purchase', keywords: ['payment','pay','paid','refund','offer','price','sale','sold','purchase','buy'] },
  { key: 'safety'  as TicketCategory, label: 'Safety reports',    shortLabel: 'Safety',   keywords: ['scam','fake','fraud','report','abuse','harassment','unsafe','threat','spam'] },
  { key: 'other'   as TicketCategory, label: 'Other help',        shortLabel: 'Other',    keywords: [] },
];

const QUICK_REPLIES: Record<TicketCategory, string[]> = {
  system:  ['Thanks for reporting this. Please send the exact error message and what page you were using.', 'I am checking this system issue now. If you can, attach a screenshot of the broken screen.'],
  listing: ['I can help with the listing. Please tell me the listing title and what step fails.', 'Please try saving once more and tell me if the same listing error appears.'],
  account: ['I can check your account access. Please confirm the email address on your marketplace account.', 'Thanks. I am reviewing your account status and will update you here.'],
  payment: ['I can review this purchase issue. Please share the item name and the offer or payment details.', 'Thanks for the details. I will check the transaction-related messages and reply here.'],
  safety:  ['Thanks for reporting this. Please do not continue the deal until we review the details.', 'Please send any username, listing title, or message screenshot connected to this safety concern.'],
  other:   ['Thanks for contacting support. Please share one more detail so I can route this correctly.', 'I am reviewing this request now and will keep the update inside this ticket.'],
};

const FILTER_TABS: Array<{ key: TicketFilter; label: string }> = [
  { key: 'all',        label: 'All Tickets' },
  { key: 'needsReply', label: 'Needs Admin' },
  { key: 'resolved',   label: 'Resolved' },
  { key: 'closed',     label: 'Closed' },
  ...CATEGORY_DEFINITIONS.map((c) => ({ key: c.key, label: c.label })),
];

const BAND_CLASS: Record<TicketCategory, string> = {
  system:  styles.bandSystem,
  listing: styles.bandListing,
  account: styles.bandAccount,
  payment: styles.bandPayment,
  safety:  styles.bandSafety,
  other:   styles.bandOther,
};

const CATEGORY_PILL: Record<TicketCategory, string> = {
  system:  styles.pillSystem,
  listing: styles.pillListing,
  account: styles.pillAccount,
  payment: styles.pillPayment,
  safety:  styles.pillSafety,
  other:   styles.pillOther,
};

const STATE_PILL: Record<TicketStateTone, string> = {
  new:      styles.pillNew,
  needs:    styles.pillNeeds,
  waiting:  styles.pillWaiting,
  resolved: styles.pillResolved,
  closed:   styles.pillClosed,
};

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function isSupportTicket(c: ConversationDetail) {
  return Boolean(c.listing_details?.is_moderation && c.listing_details.title.startsWith(SUPPORT_TICKET_TITLE_PREFIX));
}

function getTicketTitle(c: ConversationDetail) {
  const t = c.listing_details?.title ?? '';
  if (!t.startsWith(SUPPORT_TICKET_TITLE_PREFIX)) return t || 'Support request';
  return t.slice(SUPPORT_TICKET_TITLE_PREFIX.length).trim() || 'Support request';
}

function getCategoryDef(key: TicketCategory) {
  return CATEGORY_DEFINITIONS.find((d) => d.key === key) ?? CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1];
}

function inferCategory(text: string): TicketCategory {
  const norm = text.toLowerCase();
  for (const cat of ['listing','account','payment','safety','system'] as TicketCategory[]) {
    if (getCategoryDef(cat).keywords.some((k) => norm.includes(k))) return cat;
  }
  return 'other';
}

function inferPriority(text: string): TicketPriority {
  const norm = text.toLowerCase();
  return ['urgent','blocked','cannot','can not',"can't",'cant','error','scam','fraud','suspended','hacked','refund'].some((w) => norm.includes(w)) ? 'urgent' : 'normal';
}

function getRequesterName(c: ConversationDetail) {
  return c.other_user?.display_name || c.other_user?.username || 'Marketplace member';
}

function getInitials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

function getTimestamp(v: string) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatTicketTime(v?: string) {
  if (!v) return 'No activity';
  const t = getTimestamp(v);
  if (!t) return 'Recently';
  return new Intl.DateTimeFormat('en-MY', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t));
}

function formatRelativeAge(v?: string) {
  if (!v) return 'No activity';
  const t = getTimestamp(v);
  if (!t) return 'Recently';
  const diffMin = Math.max(Math.floor((Date.now() - t) / 60000), 0);
  if (diffMin < 60) return `${diffMin || 1}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function buildTicketView(conv: ConversationDetail, adminUserId?: string): TicketView {
  const title         = getTicketTitle(conv);
  const requesterName = getRequesterName(conv);
  const requesterUsername = conv.other_user?.username ?? null;
  const requesterId   = conv.other_user?.id ?? null;
  const preview       = conv.last_message?.content || 'No message yet.';
  const searchBody    = [title, requesterName, requesterUsername, requesterId, preview].filter(Boolean).join(' ');
  const category      = inferCategory(searchBody);
  const priority      = inferPriority(searchBody);
  const supportStatus = conv.listing_details?.support_status ?? 'open';
  const needsReply    = supportStatus === 'open' && (!conv.last_message || conv.last_message.sender_id !== adminUserId);
  const stateTone: TicketStateTone =
    supportStatus === 'closed'   ? 'closed' :
    supportStatus === 'resolved' ? 'resolved' :
    conv.unread_count > 0        ? 'new' :
    needsReply                   ? 'needs' : 'waiting';
  const stateLabel =
    stateTone === 'closed'   ? 'Closed' :
    stateTone === 'resolved' ? 'Resolved' :
    stateTone === 'new'      ? 'New reply' :
    stateTone === 'needs'    ? 'Needs admin' : 'Waiting';

  return {
    id: conv.id, conversation: conv, title, requesterName, requesterUsername,
    requesterId, preview, category, priority, supportStatus, needsReply,
    stateLabel, stateTone, unreadCount: conv.unread_count,
    lastActivityAt: conv.last_message?.created_at || conv.created_at,
    searchText: `${searchBody} ${category}`.toLowerCase(),
  };
}

/* ─────────────────────────────────────────────
   SVG Icons
───────────────────────────────────────────── */
function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>;
}
function RefreshIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15.55-6.36L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15.55 6.36L3 16"/></svg>;
}
function SendIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function ImageIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>;
}
function ArrowRightIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>;
}
function UserIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>;
}
function ResolveIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
}
function ReopenIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>;
}

/* ─────────────────────────────────────────────
   Stat Icons
───────────────────────────────────────────── */
function TicketIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z"/><path d="M9 9h6"/><path d="M9 15h4"/></svg>; }
function BellIcon()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function AlertIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>; }
function CheckIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14 9 11"/></svg>; }

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
export default function AdminSupportPage() {
  const { user, token, loading: authLoading } = useRequireAuth();

  /* Data */
  const [supportConversations, setSupportConversations] = useState<ConversationDetail[]>([]);
  const [messagesByTicket, setMessagesByTicket]         = useState<Record<string, ChatMessage[]>>({});
  const [loadingTickets, setLoadingTickets]             = useState(true);
  const [loadingMessages, setLoadingMessages]           = useState(false);
  const [pageError, setPageError]                       = useState<string | null>(null);

  /* UI state */
  const [activeFilter, setActiveFilter]   = useState<TicketFilter>('all');
  const [searchQuery, setSearchQuery]     = useState('');
  const [openTicketId, setOpenTicketId]   = useState<string | null>(null);

  /* Composer */
  const [replyText, setReplyText]           = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingMessageAttachment[]>([]);
  const [sendingReply, setSendingReply]     = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<SupportTicketStatus | null>(null);

  /* Refs */
  const messagesEndRef         = useRef<HTMLDivElement>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef  = useRef<PendingMessageAttachment[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  /* ── Load tickets ── */
  const loadTickets = useCallback(async (preferredId?: string, showLoader = false) => {
    if (!token) { setLoadingTickets(false); return; }
    if (showLoader) setLoadingTickets(true);
    const res = await fetchConversations(token);
    if (!res.data) { setPageError(res.error || 'Unable to load support tickets.'); setLoadingTickets(false); return; }
    const next = res.data.filter(isSupportTicket);
    setSupportConversations(next);
    setPageError(null);
    setLoadingTickets(false);
    setOpenTicketId((cur) => {
      if (preferredId && next.some((t) => t.id === preferredId)) return preferredId;
      if (cur && next.some((t) => t.id === cur)) return cur;
      return null;
    });
  }, [token]);

  useEffect(() => {
    if (authLoading || !token) return;
    void loadTickets(undefined, true);
    const iv = window.setInterval(() => void loadTickets(), 15000);
    return () => window.clearInterval(iv);
  }, [authLoading, loadTickets, token]);

  useEffect(() => { pendingAttachmentsRef.current = pendingAttachments; }, [pendingAttachments]);
  useEffect(() => () => revokePendingAttachmentPreviews(pendingAttachmentsRef.current), []);

  /* ── Build views ── */
  const ticketViews = useMemo(() => supportConversations.map((c) => buildTicketView(c, user?.id)), [supportConversations, user?.id]);

  const filterCounts = useMemo(() => ({
    all:        ticketViews.length,
    needsReply: ticketViews.filter((t) => t.needsReply).length,
    resolved:   ticketViews.filter((t) => t.supportStatus === 'resolved').length,
    closed:     ticketViews.filter((t) => t.supportStatus === 'closed').length,
    system:     ticketViews.filter((t) => t.category === 'system').length,
    listing:    ticketViews.filter((t) => t.category === 'listing').length,
    account:    ticketViews.filter((t) => t.category === 'account').length,
    payment:    ticketViews.filter((t) => t.category === 'payment').length,
    safety:     ticketViews.filter((t) => t.category === 'safety').length,
    other:      ticketViews.filter((t) => t.category === 'other').length,
  }), [ticketViews]);

  const visibleTickets = useMemo(() => {
    const norm = searchQuery.trim().toLowerCase();
    return ticketViews.filter((t) => {
      const matchFilter =
        activeFilter === 'all' ? true :
        activeFilter === 'needsReply' ? t.needsReply :
        activeFilter === 'resolved' || activeFilter === 'closed' ? t.supportStatus === activeFilter :
        t.category === activeFilter;
      return matchFilter && (!norm || t.searchText.includes(norm));
    });
  }, [activeFilter, searchQuery, ticketViews]);

  const openTicket   = ticketViews.find((t) => t.id === openTicketId) ?? null;
  const openMessages = openTicket ? messagesByTicket[openTicket.id] ?? [] : [];
  const openCategory = openTicket ? getCategoryDef(openTicket.category) : null;

  /* ── Load messages when ticket opens ── */
  useEffect(() => {
    const authToken = token;
    const ticketId  = openTicketId;
    if (!authToken || !ticketId) { setLoadingMessages(false); return; }

    let cancelled = false;

    async function loadMessages(showLoader = false) {
      if (showLoader) setLoadingMessages(true);
      const res = await fetchMessages(authToken!, ticketId!);
      if (cancelled) return;
      if (!res.data) { setPageError(res.error || 'Unable to load conversation.'); setLoadingMessages(false); return; }
      setMessagesByTicket((cur) => ({ ...cur, [ticketId!]: res.data ?? [] }));
      setPageError(null);
      setLoadingMessages(false);
      const readRes = await markAsRead(authToken!, ticketId!);
      if (!cancelled && !readRes.error) {
        setSupportConversations((cur) => cur.map((c) => c.id === ticketId ? { ...c, unread_count: 0, last_message: c.last_message ? { ...c.last_message, is_read: true } : c.last_message } : c));
      }
    }

    void loadMessages(true);
    const iv = window.setInterval(() => void loadMessages(), 7000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [openTicketId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [openMessages.length, openTicketId]);

  /* ── Close modal on Escape ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpenTicketId(null); }
    if (openTicketId) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openTicketId]);

  /* ── Actions ── */
  function handleQuickReply(text: string) {
    setReplyText((cur) => (cur.trim() ? `${cur.trim()}\n\n${text}` : text));
  }

  async function handlePasteForAttachments(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const slots = MAX_MESSAGE_ATTACHMENTS - pendingAttachments.length;
    if (slots <= 0) return;
    const imgs: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) imgs.push(f); }
    }
    if (!imgs.length) return;
    e.preventDefault();
    try {
      const next = await Promise.all(imgs.slice(0, slots).map((f) => readImageFileForMessage(f)));
      setPendingAttachments((cur) => [...cur, ...next]);
    } catch { setPageError('Unable to paste image.'); }
  }

  async function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const slots = MAX_MESSAGE_ATTACHMENTS - pendingAttachments.length;
    if (slots <= 0) { setPageError(`Max ${MAX_MESSAGE_ATTACHMENTS} images per message.`); return; }
    try {
      const next = await Promise.all(files.slice(0, slots).map((f) => readImageFileForMessage(f)));
      setPendingAttachments((cur) => [...cur, ...next]);
      setPageError(null);
    } catch (err) { setPageError(err instanceof Error ? err.message : 'Unable to attach image.'); }
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((cur) => {
      const a = cur.find((x) => x.id === id);
      if (a) revokePendingAttachmentPreviews([a]);
      return cur.filter((x) => x.id !== id);
    });
  }

  async function handleStatusUpdate(status: SupportTicketStatus) {
    if (!token || !openTicket || updatingStatus) return;
    setUpdatingStatus(status);
    setPageError(null);
    const res = await updateSupportTicketStatus(token, openTicket.id, status);
    setUpdatingStatus(null);
    if (!res.data) { setPageError(res.error || 'Unable to update ticket.'); return; }
    setMessagesByTicket((cur) => ({ ...cur, [openTicket.id]: [...(cur[openTicket.id] ?? []), res.data!.message] }));
    await loadTickets(openTicket.id);
  }

  async function handleReply() {
    const content = replyText.trim();
    if (!token || !user || !openTicket || (!content && pendingAttachments.length === 0) || openTicket.supportStatus === 'closed' || sendingReply) return;

    const attachsToSend = pendingAttachments;
    const uploads       = toAttachmentUploads(attachsToSend);
    const tempAttachs   = toPreviewMessageAttachments(attachsToSend);
    const fallback      = content || (attachsToSend.length === 1 ? 'Sent an image' : `Sent ${attachsToSend.length} images`);
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`, conversation_id: openTicket.id, sender_id: user.id,
      content: fallback, attachments: tempAttachs, event: null, is_read: false, created_at: new Date().toISOString(),
    };

    setSendingReply(true);
    setReplyText('');
    setPendingAttachments([]);
    setPageError(null);
    setMessagesByTicket((cur) => ({ ...cur, [openTicket.id]: [...(cur[openTicket.id] ?? []), tempMsg] }));
    setSupportConversations((cur) => cur.map((c) => c.id === openTicket.id ? { ...c, unread_count: 0, last_message: { content: fallback, created_at: tempMsg.created_at, sender_id: user.id, is_read: false } } : c));

    const res = await sendReply(token, openTicket.id, content, uploads);
    setSendingReply(false);
    if (!res.data) {
      setPageError(res.error || 'Unable to send reply.');
      setReplyText(content);
      setPendingAttachments(attachsToSend);
      setMessagesByTicket((cur) => ({ ...cur, [openTicket.id]: (cur[openTicket.id] ?? []).filter((m) => m.id !== tempMsg.id) }));
      return;
    }
    revokePendingAttachmentPreviews(attachsToSend);
    setMessagesByTicket((cur) => ({ ...cur, [openTicket.id]: (cur[openTicket.id] ?? []).map((m) => m.id === tempMsg.id ? res.data! : m) }));
    await loadTickets(openTicket.id);
  }

  /* ── Stats ── */
  const urgentCount  = ticketViews.filter((t) => t.priority === 'urgent').length;
  const resolvedCount = filterCounts.resolved;
  const needsCount   = filterCounts.needsReply;

  if (authLoading || !user) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>Preparing support tickets...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Support Command Center</p>
          <h1 className={styles.title}>Support Queue</h1>
          <p className={styles.subtitle}>
            Browse support tickets as cards. Click any ticket to open the full conversation and reply in a focused view.
          </p>
        </div>
        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void loadTickets(undefined, true)}
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {pageError && (
        <div style={{ padding: '0.85rem 1.1rem', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: '0.85rem', border: '1px solid rgba(239,68,68,0.2)' }}>
          {pageError}
        </div>
      )}

      {/* ── Stats ── */}
      <section className={styles.statsGrid}>
        <article className={`${styles.statCard} ${styles.statCardInk}`}>
          <div className={styles.statIcon}><TicketIcon /></div>
          <p className={styles.statLabel}>Total Tickets</p>
          <h2 className={styles.statValue}>{ticketViews.length}</h2>
          <p className={styles.statDetail}>All active support requests from users.</p>
        </article>
        <article className={`${styles.statCard} ${styles.statCardPeach}`}>
          <div className={styles.statIcon}><BellIcon /></div>
          <p className={styles.statLabel}>Needs Admin</p>
          <h2 className={styles.statValue}>{needsCount}</h2>
          <p className={styles.statDetail}>Users waiting on an admin response.</p>
        </article>
        <article className={`${styles.statCard} ${styles.statCardSoft}`}>
          <div className={styles.statIcon}><AlertIcon /></div>
          <p className={styles.statLabel}>Urgent Flags</p>
          <h2 className={styles.statValue}>{urgentCount}</h2>
          <p className={styles.statDetail}>Blockers, fraud, refunds, and suspended access.</p>
        </article>
        <article className={`${styles.statCard} ${styles.statCardMint}`}>
          <div className={styles.statIcon}><CheckIcon /></div>
          <p className={styles.statLabel}>Resolved</p>
          <h2 className={styles.statValue}>{resolvedCount}</h2>
          <p className={styles.statDetail}>Tickets marked resolved — still visible for follow-up.</p>
        </article>
      </section>

      {/* ── Tab Bar ── */}
      <div className={styles.tabBar} role="tablist">
        {FILTER_TABS.map((tab) => {
          const count = filterCounts[tab.key as TicketFilter] ?? 0;
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              type="button"
              className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''} ${tab.key === 'needsReply' && needsCount > 0 ? styles.tabItemUrgent : ''}`}
              onClick={() => { setActiveFilter(tab.key as TicketFilter); setSearchQuery(''); }}
            >
              <span className={styles.tabLabel}>{tab.label}</span>
              {count > 0 && (
                <span className={`${styles.tabBadge} ${tab.key === 'needsReply' && count > 0 ? styles.tabBadgeUrgent : ''}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Ticket Grid ── */}
      <section className={styles.queue}>
        {loadingTickets ? (
          <div className={styles.loadingGrid}>
            {[1,2,3,4,5,6].map((i) => <div key={i} className={styles.skeletonCard} />)}
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className={styles.emptyState}>
            No support tickets match the current filter. Try switching to All Tickets.
          </div>
        ) : (
          <div className={styles.ticketGrid}>
            {visibleTickets.map((ticket) => {
              const catDef = getCategoryDef(ticket.category);
              return (
                <article
                  key={ticket.id}
                  className={styles.ticketCard}
                  onClick={() => setOpenTicketId(ticket.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenTicketId(ticket.id); }}
                  aria-label={`Open ticket: ${ticket.title}`}
                >
                  {/* Color band by category */}
                  <div className={`${styles.cardBand} ${BAND_CLASS[ticket.category]}`} />

                  {/* Header */}
                  <div className={styles.cardHeader}>
                    <div className={styles.cardAvatar}>{getInitials(ticket.requesterName)}</div>
                    <div className={styles.cardUserInfo}>
                      <span className={styles.cardUserName}>{ticket.requesterName}</span>
                      {ticket.requesterUsername && (
                        <span className={styles.cardUserHandle}>@{ticket.requesterUsername}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {ticket.unreadCount > 0 && (
                        <span className={styles.unreadBadge}>{ticket.unreadCount}</span>
                      )}
                      <span className={styles.cardTimestamp}>{formatRelativeAge(ticket.lastActivityAt)}</span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className={styles.cardBody}>
                    <strong className={styles.cardTitle}>{ticket.title}</strong>
                    <p className={styles.cardPreview}>{ticket.preview}</p>

                    <div className={styles.cardBadges}>
                      <span className={`${styles.pill} ${CATEGORY_PILL[ticket.category]}`}>
                        {catDef.shortLabel}
                      </span>
                      <span className={`${styles.pill} ${ticket.priority === 'urgent' ? styles.pillUrgent : styles.pillNormal}`}>
                        {ticket.priority === 'urgent' && <span className={styles.urgentDot} />}
                        {ticket.priority === 'urgent' ? 'Urgent' : 'Normal'}
                      </span>
                      <span className={`${styles.pill} ${STATE_PILL[ticket.stateTone]}`}>
                        {ticket.stateLabel}
                      </span>
                    </div>
                  </div>

                  {/* Footer CTA */}
                  <div className={styles.cardFooter}>
                    <span className={styles.openHint}>Open conversation</span>
                    <span className={styles.openArrow}><ArrowRightIcon /></span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════
          FULL-SCREEN CONVERSATION MODAL
      ══════════════════════════════════════════ */}
      {openTicketId && openTicket && (
        <div
          className={styles.modalBackdrop}
          onClick={(e) => { if (e.target === e.currentTarget) setOpenTicketId(null); }}
          role="dialog"
          aria-modal
          aria-label={`Conversation: ${openTicket.title}`}
        >
          <div className={styles.modalPanel}>

            {/* ── Top Bar ── */}
            <div className={styles.modalTopBar}>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setOpenTicketId(null)}
                aria-label="Close conversation"
              >
                <CloseIcon />
              </button>

              <div className={styles.modalAvatar}>{getInitials(openTicket.requesterName)}</div>
              <div className={styles.modalUserInfo}>
                <span className={styles.modalUserName}>{openTicket.requesterName}</span>
                <span className={styles.modalUserMeta}>
                  {openTicket.requesterUsername ? `@${openTicket.requesterUsername}` : 'No username'} · {formatTicketTime(openTicket.lastActivityAt)}
                </span>
              </div>

              <div className={styles.modalTopActions}>
                <Link
                  href={`${ROUTES.ADMIN_USERS}?q=${encodeURIComponent(openTicket.requesterId || openTicket.requesterUsername || openTicket.requesterName)}`}
                  className={styles.modalActionBtn}
                >
                  <UserIcon /> Find user
                </Link>

                {openTicket.supportStatus !== 'open' ? (
                  <button
                    type="button"
                    className={styles.modalActionBtn}
                    onClick={() => void handleStatusUpdate('open')}
                    disabled={Boolean(updatingStatus)}
                  >
                    <ReopenIcon /> {updatingStatus === 'open' ? 'Reopening...' : 'Reopen'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.modalActionBtn}
                    onClick={() => void handleStatusUpdate('resolved')}
                    disabled={Boolean(updatingStatus)}
                  >
                    <ResolveIcon /> {updatingStatus === 'resolved' ? 'Updating...' : 'Mark resolved'}
                  </button>
                )}

                {openTicket.supportStatus !== 'closed' && (
                  <button
                    type="button"
                    className={`${styles.modalActionBtn} ${styles.modalActionDanger}`}
                    onClick={() => void handleStatusUpdate('closed')}
                    disabled={Boolean(updatingStatus)}
                  >
                    <CloseIcon /> {updatingStatus === 'closed' ? 'Closing...' : 'Close ticket'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Issue Strip ── */}
            <div className={styles.modalIssueStrip}>
              <span className={styles.modalIssueTitle}>{openTicket.title}</span>
              <div className={styles.modalBadges}>
                {openCategory && (
                  <span className={`${styles.pill} ${CATEGORY_PILL[openTicket.category]}`}>
                    {openCategory.shortLabel}
                  </span>
                )}
                <span className={`${styles.pill} ${openTicket.priority === 'urgent' ? styles.pillUrgent : styles.pillNormal}`}>
                  {openTicket.priority === 'urgent' && <span className={styles.urgentDot} />}
                  {openTicket.priority === 'urgent' ? 'Urgent' : 'Normal'}
                </span>
                <span className={`${styles.pill} ${STATE_PILL[openTicket.stateTone]}`}>
                  {openTicket.stateLabel}
                </span>
              </div>
            </div>

            {/* ── Message Timeline ── */}
            <div className={styles.modalBody}>
              {loadingMessages && openMessages.length === 0 ? (
                <div className={styles.messageLoadingState}>Loading conversation...</div>
              ) : openMessages.length === 0 ? (
                <div className={styles.messageEmptyState}>No messages yet for this ticket.</div>
              ) : (
                openMessages.map((msg) => {
                  const isMine = msg.sender_id === user.id;
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.msgRow} ${isMine ? styles.msgRowAdmin : styles.msgRowUser}`}
                    >
                      {!isMine && (
                        <div className={styles.msgAvatar}>{getInitials(openTicket.requesterName)}</div>
                      )}
                      <article className={`${styles.msgBubble} ${isMine ? styles.msgAdmin : styles.msgUser}`}>
                        <span className={styles.msgAuthor}>
                          {isMine ? 'Admin reply' : openTicket.requesterName}
                        </span>
                        {msg.attachments?.length > 0 && (
                          <div className={styles.msgAttachments}>
                            {msg.attachments.map((att) => (
                              <button
                                key={att.id || att.url}
                                type="button"
                                className={styles.attachThumb}
                                onClick={() => setLightboxSrc(att.url)}
                                aria-label="View image"
                              >
                                <img src={att.url} alt={att.file_name || 'Ticket image'} />
                              </button>
                            ))}
                          </div>
                        )}
                        {msg.content && <p>{msg.content}</p>}
                        <time className={styles.msgTime}>{formatTicketTime(msg.created_at)}</time>
                      </article>
                      {isMine && (
                        <div className={`${styles.msgAvatar} ${styles.msgAvatarAdmin}`}>AD</div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Quick Replies ── */}
            {openTicket.supportStatus !== 'closed' && (
              <div className={styles.quickReplyBar}>
                <span className={styles.quickReplyLabel}>Quick:</span>
                {QUICK_REPLIES[openTicket.category].map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    className={styles.quickReplyBtn}
                    onClick={() => handleQuickReply(reply)}
                    title={reply}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

            {/* ── Composer ── */}
            <form
              className={styles.modalComposer}
              onSubmit={(e) => { e.preventDefault(); void handleReply(); }}
            >
              {openTicket.supportStatus === 'closed' && (
                <div className={styles.closedNotice}>
                  This ticket is closed. Reopen it to send another reply.
                </div>
              )}

              {pendingAttachments.length > 0 && (
                <div className={styles.pendingAttachments}>
                  {pendingAttachments.map((att) => (
                    <div key={att.id} className={styles.pendingAttachment}>
                      <img src={att.previewUrl} alt={att.fileName} />
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(att.id)}
                        aria-label={`Remove ${att.fileName}`}
                      >✕</button>
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
                onChange={(e) => void handleAttachmentSelect(e)}
              />

              <textarea
                className={styles.composerTextarea}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onPaste={(e) => void handlePasteForAttachments(e)}
                placeholder="Write the admin response here... (Ctrl+V to paste image)"
                maxLength={2000}
                rows={3}
                disabled={openTicket.supportStatus === 'closed'}
              />

              <div className={styles.composerActions}>
                <button
                  type="button"
                  className={styles.attachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={openTicket.supportStatus === 'closed' || sendingReply || pendingAttachments.length >= MAX_MESSAGE_ATTACHMENTS}
                >
                  <ImageIcon /> Add image
                </button>
                <button
                  type="submit"
                  className={styles.sendBtn}
                  disabled={(!replyText.trim() && pendingAttachments.length === 0) || openTicket.supportStatus === 'closed' || sendingReply}
                >
                  <SendIcon />
                  {sendingReply ? 'Sending...' : 'Send reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImageLightbox
        src={lightboxSrc}
        alt="Ticket image"
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}
