'use client';

import { useEffect, useRef, useState } from 'react';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  createSupportConversation,
  fetchConversations,
  fetchMessages,
  MAX_MESSAGE_ATTACHMENTS,
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
import styles from './support.module.css';

const SUPPORT_TICKET_TITLE_PREFIX = 'Support request:';

/* ── Icons ─────────────────────────────────────── */
function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 3H9l-3-3H2" />
      <path d="M5.45 5.11 2 12v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function SupportHeadsetIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11a9 9 0 0 1 18 0" />
      <path d="M21 11v3a1 1 0 0 1-1 1h-1a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h2Z" />
      <path d="M3 11v3a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H3Z" />
      <path d="M12 20a3 3 0 0 0 3-3v-1" />
      <circle cx="12" cy="20" r="1" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* ── Helpers ─────────────────────────────────────── */
function isSupportTicket(conversation: ConversationDetail) {
  return Boolean(
    conversation.listing_details?.is_moderation &&
      conversation.listing_details.title.startsWith(SUPPORT_TICKET_TITLE_PREFIX)
  );
}

function getTicketTitle(conversation: ConversationDetail) {
  return (
    conversation.listing_details?.title
      .replace(SUPPORT_TICKET_TITLE_PREFIX, '')
      .trim() || 'Support request'
  );
}

function formatTicketTime(value?: string) {
  if (!value) return 'No activity yet';
  return new Intl.DateTimeFormat('en-MY', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusPillClass(status: string) {
  if (status === 'resolved') return styles.pillResolved;
  if (status === 'closed') return styles.pillClosed;
  return styles.pillOpen;
}

/* ── Component ─────────────────────────────────────── */
export default function SupportTicketsPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [tickets, setTickets] = useState<ConversationDetail[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [messagesByTicket, setMessagesByTicket] = useState<Record<string, ChatMessage[]>>({});
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [replyText, setReplyText] = useState('');
  const [newTicketAttachments, setNewTicketAttachments] = useState<PendingMessageAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<PendingMessageAttachment[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [replying, setReplying] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<SupportTicketStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const newTicketFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const newTicketAttachmentsRef = useRef<PendingMessageAttachment[]>([]);
  const replyAttachmentsRef = useRef<PendingMessageAttachment[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  async function loadTickets(preferredTicketId?: string) {
    if (!token) return;
    setLoadingTickets(true);
    const response = await fetchConversations(token);
    setLoadingTickets(false);
    if (!response.data) {
      setError(response.error || 'Unable to load support tickets.');
      return;
    }
    const nextTickets = response.data.filter(isSupportTicket);
    setTickets(nextTickets);
    setError(null);
    setActiveTicketId((currentTicketId) => {
      if (preferredTicketId && nextTickets.some((t) => t.id === preferredTicketId)) return preferredTicketId;
      if (currentTicketId && nextTickets.some((t) => t.id === currentTicketId)) return currentTicketId;
      return nextTickets[0]?.id ?? null;
    });
  }

  useEffect(() => { if (token) void loadTickets(); }, [token]);

  useEffect(() => { newTicketAttachmentsRef.current = newTicketAttachments; }, [newTicketAttachments]);
  useEffect(() => { replyAttachmentsRef.current = replyAttachments; }, [replyAttachments]);
  useEffect(
    () => () => {
      revokePendingAttachmentPreviews(newTicketAttachmentsRef.current);
      revokePendingAttachmentPreviews(replyAttachmentsRef.current);
    },
    []
  );

  useEffect(() => {
    if (!token || !activeTicketId || messagesByTicket[activeTicketId]) return;
    let cancelled = false;
    setLoadingMessages(true);
    fetchMessages(token, activeTicketId)
      .then((response) => {
        if (cancelled) return;
        if (response.data) {
          setMessagesByTicket((c) => ({ ...c, [activeTicketId]: response.data ?? [] }));
          setError(null);
        } else {
          setError(response.error || 'Unable to load this ticket.');
        }
      })
      .finally(() => { if (!cancelled) setLoadingMessages(false); });
    return () => { cancelled = true; };
  }, [activeTicketId, messagesByTicket, token]);

  // Auto-scroll messages
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messagesByTicket, activeTicketId]);

  async function handleAttachmentSelect(
    event: React.ChangeEvent<HTMLInputElement>,
    currentAttachments: PendingMessageAttachment[],
    setAttachments: React.Dispatch<React.SetStateAction<PendingMessageAttachment[]>>
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const slots = MAX_MESSAGE_ATTACHMENTS - currentAttachments.length;
    if (slots <= 0) { setError(`Max ${MAX_MESSAGE_ATTACHMENTS} images per message.`); return; }
    try {
      const next = await Promise.all(files.slice(0, slots).map(readImageFileForMessage));
      setAttachments((c) => [...c, ...next]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to attach this image.');
    }
  }

  async function handlePasteForAttachments(
    event: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    currentAttachments: PendingMessageAttachment[],
    setAttachments: React.Dispatch<React.SetStateAction<PendingMessageAttachment[]>>
  ) {
    const items = event.clipboardData?.items;
    if (!items) return;
    const slots = MAX_MESSAGE_ATTACHMENTS - currentAttachments.length;
    if (slots <= 0) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) imageFiles.push(f); }
    }
    if (!imageFiles.length) return;
    event.preventDefault();
    try {
      const next = await Promise.all(imageFiles.slice(0, slots).map(readImageFileForMessage));
      setAttachments((c) => [...c, ...next]);
      setError(null);
    } catch { setError('Unable to paste this image.'); }
  }

  function removePendingAttachment(
    attachmentId: string,
    setAttachments: React.Dispatch<React.SetStateAction<PendingMessageAttachment[]>>
  ) {
    setAttachments((c) => {
      const a = c.find((i) => i.id === attachmentId);
      if (a) revokePendingAttachmentPreviews([a]);
      return c.filter((i) => i.id !== attachmentId);
    });
  }

  async function handleStatusUpdate(status: SupportTicketStatus) {
    if (!token || !activeTicketId || updatingStatus) return;
    setUpdatingStatus(status);
    setError(null);
    const response = await updateSupportTicketStatus(token, activeTicketId, status);
    setUpdatingStatus(null);
    if (!response.data) { setError(response.error || 'Unable to update this ticket.'); return; }
    setMessagesByTicket((c) => ({
      ...c,
      [activeTicketId]: [...(c[activeTicketId] ?? []), response.data!.message],
    }));
    await loadTickets(activeTicketId);
  }

  async function handleCreateTicket() {
    const trimmedSubject = subject.trim();
    const trimmedDetails = details.trim();
    if (!token || !trimmedSubject || (!trimmedDetails && newTicketAttachments.length === 0) || creatingTicket) return;
    const attachmentsToSend = newTicketAttachments;
    setCreatingTicket(true);
    setError(null);
    setNewTicketAttachments([]);
    const response = await createSupportConversation(token, {
      subject: trimmedSubject,
      content: trimmedDetails,
      attachments: toAttachmentUploads(attachmentsToSend),
    });
    setCreatingTicket(false);
    if (!response.data) {
      setError(response.error || 'Unable to create a support ticket.');
      setNewTicketAttachments(attachmentsToSend);
      return;
    }
    revokePendingAttachmentPreviews(attachmentsToSend);
    setSubject('');
    setDetails('');
    setIsNewTicketModalOpen(false);
    setMessagesByTicket((c) => ({
      ...c,
      [response.data!.conversation_id]: [response.data!.message],
    }));
    await loadTickets(response.data.conversation_id);
  }

  async function handleReply() {
    const content = replyText.trim();
    const activeTicket = tickets.find((t) => t.id === activeTicketId) ?? null;
    const activeStatus = activeTicket?.listing_details?.support_status ?? 'open';
    if (!token || !activeTicketId || (!content && replyAttachments.length === 0) || activeStatus === 'closed' || replying) return;

    const attachmentsToSend = replyAttachments;
    const tempAttachments = toPreviewMessageAttachments(attachmentsToSend);
    const fallbackContent = content || (attachmentsToSend.length === 1 ? 'Sent an image' : `Sent ${attachmentsToSend.length} images`);
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeTicketId,
      sender_id: user!.id,
      content: fallbackContent,
      attachments: tempAttachments,
      event: null,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setReplying(true);
    setReplyText('');
    setReplyAttachments([]);
    setError(null);
    setMessagesByTicket((c) => ({ ...c, [activeTicketId]: [...(c[activeTicketId] ?? []), tempMessage] }));

    const response = await sendReply(token, activeTicketId, content, toAttachmentUploads(attachmentsToSend));
    setReplying(false);
    if (!response.data) {
      setError(response.error || 'Unable to send your reply.');
      setReplyText(content);
      setReplyAttachments(attachmentsToSend);
      setMessagesByTicket((c) => ({
        ...c,
        [activeTicketId]: (c[activeTicketId] ?? []).filter((m) => m.id !== tempMessage.id),
      }));
      return;
    }
    revokePendingAttachmentPreviews(attachmentsToSend);
    setMessagesByTicket((c) => ({
      ...c,
      [activeTicketId]: (c[activeTicketId] ?? []).map((m) => m.id === tempMessage.id ? response.data! : m),
    }));
    await loadTickets(activeTicketId);
  }

  if (authLoading || !user) {
    return <div className={styles.loading}>Loading support tickets…</div>;
  }

  const activeTicket = tickets.find((t) => t.id === activeTicketId) ?? null;
  const activeMessages = activeTicketId ? messagesByTicket[activeTicketId] ?? [] : [];
  const activeStatus = activeTicket?.listing_details?.support_status ?? 'open';
  const activeStatusClass =
    activeStatus === 'closed' ? styles.statusClosed
    : activeStatus === 'resolved' ? styles.statusResolved
    : styles.statusOpen;

  const openCount   = tickets.filter(t => (t.listing_details?.support_status ?? 'open') === 'open').length;
  const closedCount = tickets.filter(t => t.listing_details?.support_status === 'closed').length;

  return (
    <div className={styles.page}>

      {/* ═══ HERO HEADER ═══ */}
      <section className={styles.supportHeader}>
        <div className={styles.supportHeaderLeft}>
          <div className={styles.supportHeaderIconWrap}>
            <SupportHeadsetIcon />
          </div>
          <div className={styles.supportHeaderCopy}>
            <p className={styles.eyebrow}>Help &amp; Support</p>
            <h1 className={styles.title}>Support Centre</h1>
            <p className={styles.subtitle}>
              Track your support conversations and get help from our team — all in one place.
            </p>
            <div className={styles.headerStats}>
              <span className={styles.statChip}>
                <strong>{tickets.length}</strong> Total tickets
              </span>
              {openCount > 0 && (
                <span className={styles.statChip}>
                  <strong>{openCount}</strong> Open
                </span>
              )}
              {closedCount > 0 && (
                <span className={styles.statChip}>
                  <strong>{closedCount}</strong> Closed
                </span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.headerButtonWrap}>
          <button
            type="button"
            className={styles.headerButton}
            onClick={() => setIsNewTicketModalOpen(true)}
            id="open-ticket-btn"
          >
            <PlusIcon size={15} />
            Open new ticket
          </button>
        </div>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.grid}>

        {/* ═══ LEFT: Ticket list ═══ */}
        <section className={styles.ticketListCard} aria-label="Your support tickets">
          <div className={styles.ticketListHeader}>
            <div>
              <p className={styles.sectionEyebrow}>History</p>
              <h2 className={styles.sectionTitle}>Your tickets</h2>
            </div>
            <span className={styles.ticketCount}>{tickets.length}</span>
          </div>

          <div className={styles.ticketList}>
            {loadingTickets ? (
              <p className={styles.emptyText}>Loading tickets…</p>
            ) : tickets.length === 0 ? (
              <p className={styles.emptyText}>
                No tickets yet. Open your first ticket to get support from our team.
              </p>
            ) : (
              tickets.map((ticket) => {
                const isActive = ticket.id === activeTicketId;
                const status = ticket.listing_details?.support_status ?? 'open';
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    className={`${styles.ticketItem} ${isActive ? styles.ticketItemActive : ''}`}
                    onClick={() => setActiveTicketId(ticket.id)}
                  >
                    <span className={styles.ticketItemTop}>
                      <strong>{getTicketTitle(ticket)}</strong>
                      <span className={`${styles.ticketStatusPill} ${statusPillClass(status)}`}>{status}</span>
                    </span>
                    <span className={styles.ticketPreview}>
                      {ticket.last_message?.content || 'No messages yet'}
                    </span>
                    <span className={styles.ticketTime}>
                      {formatTicketTime(ticket.last_message?.created_at || ticket.created_at)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Quick open button at the bottom of the list */}
          <div className={styles.listQuickOpen}>
            <button
              type="button"
              className={styles.listQuickOpenBtn}
              onClick={() => setIsNewTicketModalOpen(true)}
            >
              <PlusIcon size={14} />
              New support request
            </button>
          </div>
        </section>

        {/* ═══ RIGHT: Work area ═══ */}
        <section className={styles.ticketWorkCard}>

          {/* Thread view */}
          <div className={styles.threadBox}>
            <div className={styles.threadHeader}>
              <div className={styles.threadHeaderLeft}>
                <div className={styles.threadHeaderIcon}>
                  <MessageIcon />
                </div>
                <div className={styles.threadHeaderCopy}>
                  <p className={styles.sectionEyebrow}>Ticket conversation</p>
                  <h2 className={styles.threadTitle}>
                    {activeTicket ? getTicketTitle(activeTicket) : 'Select a ticket'}
                  </h2>
                </div>
              </div>
              {activeTicket && (
                <div className={styles.threadActions}>
                  <span className={`${styles.statusPill} ${activeStatusClass}`}>{activeStatus}</span>
                  {activeStatus !== 'open' ? (
                    <button
                      type="button"
                      className={styles.statusButton}
                      onClick={() => void handleStatusUpdate('open')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'open' ? 'Reopening…' : 'Reopen'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.statusButton}
                      onClick={() => void handleStatusUpdate('resolved')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'resolved' ? 'Updating…' : 'Mark resolved'}
                    </button>
                  )}
                  {activeStatus !== 'closed' && (
                    <button
                      type="button"
                      className={`${styles.statusButton} ${styles.statusButtonDanger}`}
                      onClick={() => void handleStatusUpdate('closed')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'closed' ? 'Closing…' : 'Close'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className={styles.messageList} ref={messageListRef}>
              {!activeTicket ? (
                <div className={styles.threadEmpty}>
                  <div className={styles.threadEmptyIcon}><InboxIcon /></div>
                  <p className={styles.threadEmptyTitle}>No ticket selected</p>
                  <p className={styles.threadEmptyText}>
                    Choose a ticket from the list on the left, or open a new one to get started.
                  </p>
                  <button
                    type="button"
                    className={styles.threadEmptyAction}
                    onClick={() => setIsNewTicketModalOpen(true)}
                  >
                    <PlusIcon size={14} />
                    Open a new ticket
                  </button>
                </div>
              ) : loadingMessages ? (
                <div className={styles.threadEmpty}>
                  <p className={styles.threadEmptyText}>Loading conversation…</p>
                </div>
              ) : activeMessages.length === 0 ? (
                <div className={styles.threadEmpty}>
                  <p className={styles.threadEmptyText}>No messages yet in this ticket.</p>
                </div>
              ) : (
                activeMessages.map((message) => {
                  const isMine = message.sender_id === user.id;
                  return (
                    <article
                      key={message.id}
                      className={`${styles.messageBubble} ${isMine ? styles.messageMine : styles.messageAdmin}`}
                    >
                      <div className={styles.messageBubbleInner}>
                        <span className={styles.messageAuthor}>{isMine ? 'You' : 'Admin'}</span>
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
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={attachment.url} alt={attachment.file_name || 'Ticket image'} />
                              </button>
                            ))}
                          </div>
                        )}
                        {message.content && <p>{message.content}</p>}
                        <time>{formatTicketTime(message.created_at)}</time>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Reply bar */}
            {activeTicket && (
              <div className={styles.replyBox}>
                {activeStatus === 'closed' && (
                  <div className={styles.closedNotice}>
                    This ticket is closed. Reopen it to add more information.
                  </div>
                )}

                <input
                  ref={replyFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className={styles.hiddenFileInput}
                  onChange={(e) => void handleAttachmentSelect(e, replyAttachments, setReplyAttachments)}
                />

                {replyAttachments.length > 0 && (
                  <div className={styles.replyAttachmentsRow}>
                    {replyAttachments.map((a) => (
                      <div key={a.id} className={styles.pendingAttachment}>
                        <img src={a.previewUrl} alt={a.fileName} />
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(a.id, setReplyAttachments)}
                          aria-label={`Remove ${a.fileName}`}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.replyField}>
                  <textarea
                    className={styles.replyTextarea}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onPaste={(e) => void handlePasteForAttachments(e, replyAttachments, setReplyAttachments)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleReply(); }
                    }}
                    placeholder={activeStatus === 'closed' ? 'Reopen this ticket to reply…' : 'Add more information… (Enter to send, Shift+Enter for new line)'}
                    rows={2}
                    maxLength={2000}
                    disabled={activeStatus === 'closed'}
                  />
                  <div className={styles.replyBarButtons}>
                    <button
                      type="button"
                      className={styles.attachButtonSmall}
                      onClick={() => replyFileInputRef.current?.click()}
                      disabled={activeStatus === 'closed' || replying || replyAttachments.length >= MAX_MESSAGE_ATTACHMENTS}
                      aria-label="Attach image"
                      title="Attach image"
                    >
                      <ImageIcon />
                    </button>
                    <button
                      type="button"
                      id="support-reply-send"
                      className={styles.replyButton}
                      onClick={() => void handleReply()}
                      disabled={(!replyText.trim() && replyAttachments.length === 0) || activeStatus === 'closed' || replying}
                      aria-label="Send reply"
                    >
                      <SendIcon />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </section>
      </div>

      {/* ═══ NEW TICKET MODAL ═══ */}
      {isNewTicketModalOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingTicket) {
              setIsNewTicketModalOpen(false);
            }
          }}
        >
          <section
            className={`${styles.newTicketBox} ${styles.modalCard}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-ticket-title"
          >
            <div className={styles.modalHeader}>
              <div className={styles.newTicketBoxHeader}>
                <div className={styles.newTicketIconWrap}><TicketIcon /></div>
                <div>
                  <p className={styles.sectionEyebrow}>New request</p>
                  <h2 className={styles.sectionTitle} id="new-ticket-title">Open a support ticket</h2>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setIsNewTicketModalOpen(false)}
                disabled={creatingTicket}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <input
              ref={newTicketFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className={styles.hiddenFileInput}
              onChange={(e) => void handleAttachmentSelect(e, newTicketAttachments, setNewTicketAttachments)}
            />

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="ticket-subject">
                Subject <span className={styles.fieldRequired}>*</span>
              </label>
              <input
                id="ticket-subject"
                className={styles.input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Cannot add a new listing"
                maxLength={90}
              />
              <div className={styles.fieldFooter}>{subject.length}/90</div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="ticket-details">
                Describe the problem <span className={styles.fieldRequired}>*</span>
              </label>
              <textarea
                id="ticket-details"
                className={styles.textarea}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                onPaste={(e) => void handlePasteForAttachments(e, newTicketAttachments, setNewTicketAttachments)}
                placeholder="Tell our team what you tried, what failed, and any error you saw…"
                rows={5}
                maxLength={2000}
              />
              <div className={styles.fieldFooter}>{details.length}/2000</div>
              <p className={styles.fieldTip}>💡 Tip: You can paste a screenshot directly into this field (Ctrl+V)</p>
            </div>

            {newTicketAttachments.length > 0 && (
              <div className={styles.pendingAttachments}>
                {newTicketAttachments.map((a) => (
                  <div key={a.id} className={styles.pendingAttachment}>
                    <img src={a.previewUrl} alt={a.fileName} />
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(a.id, setNewTicketAttachments)}
                      aria-label={`Remove ${a.fileName}`}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.newTicketActions}>
              <button
                type="button"
                className={styles.attachButton}
                onClick={() => newTicketFileInputRef.current?.click()}
                disabled={creatingTicket || newTicketAttachments.length >= MAX_MESSAGE_ATTACHMENTS}
              >
                <ImageIcon /> Attach screenshot
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void handleCreateTicket()}
                disabled={!subject.trim() || (!details.trim() && newTicketAttachments.length === 0) || creatingTicket}
              >
                {creatingTicket ? 'Opening ticket…' : 'Open ticket'}
              </button>
            </div>
          </section>
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
