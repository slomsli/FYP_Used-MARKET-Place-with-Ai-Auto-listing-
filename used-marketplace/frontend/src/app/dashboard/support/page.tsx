'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
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

function TicketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
      <path d="M9 9h6" />
      <path d="M9 15h4" />
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
  if (!value) {
    return 'No activity yet';
  }

  return new Intl.DateTimeFormat('en-MY', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function SupportTicketsPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [tickets, setTickets] = useState<ConversationDetail[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
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

  async function loadTickets(preferredTicketId?: string) {
    if (!token) {
      return;
    }

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
      if (preferredTicketId && nextTickets.some((ticket) => ticket.id === preferredTicketId)) {
        return preferredTicketId;
      }

      if (currentTicketId && nextTickets.some((ticket) => ticket.id === currentTicketId)) {
        return currentTicketId;
      }

      return nextTickets[0]?.id ?? null;
    });
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadTickets();
  }, [token]);

  useEffect(() => {
    newTicketAttachmentsRef.current = newTicketAttachments;
  }, [newTicketAttachments]);

  useEffect(() => {
    replyAttachmentsRef.current = replyAttachments;
  }, [replyAttachments]);

  useEffect(
    () => () => {
      revokePendingAttachmentPreviews(newTicketAttachmentsRef.current);
      revokePendingAttachmentPreviews(replyAttachmentsRef.current);
    },
    []
  );

  useEffect(() => {
    if (!token || !activeTicketId || messagesByTicket[activeTicketId]) {
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);

    fetchMessages(token, activeTicketId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (response.data) {
          setMessagesByTicket((current) => ({
            ...current,
            [activeTicketId]: response.data ?? [],
          }));
          setError(null);
        } else {
          setError(response.error || 'Unable to load this ticket.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTicketId, messagesByTicket, token]);

  async function handleAttachmentSelect(
    event: React.ChangeEvent<HTMLInputElement>,
    currentAttachments: PendingMessageAttachment[],
    setAttachments: React.Dispatch<React.SetStateAction<PendingMessageAttachment[]>>
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    const availableSlots = MAX_MESSAGE_ATTACHMENTS - currentAttachments.length;

    if (availableSlots <= 0) {
      setError(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} images per message.`);
      return;
    }

    try {
      const nextAttachments = await Promise.all(
        files.slice(0, availableSlots).map((file) => readImageFileForMessage(file))
      );
      setAttachments((current) => [...current, ...nextAttachments]);
      setError(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to attach this image.');
    }
  }

  async function handlePasteForAttachments(
    event: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    currentAttachments: PendingMessageAttachment[],
    setAttachments: React.Dispatch<React.SetStateAction<PendingMessageAttachment[]>>
  ) {
    const items = event.clipboardData?.items;
    if (!items) return;

    const availableSlots = MAX_MESSAGE_ATTACHMENTS - currentAttachments.length;
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
      setAttachments((current) => [...current, ...nextAttachments]);
      setError(null);
    } catch {
      setError('Unable to paste this image.');
    }
  }

  function removePendingAttachment(
    attachmentId: string,
    setAttachments: React.Dispatch<React.SetStateAction<PendingMessageAttachment[]>>
  ) {
    setAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId);
      if (attachment) {
        revokePendingAttachmentPreviews([attachment]);
      }

      return current.filter((item) => item.id !== attachmentId);
    });
  }

  async function handleStatusUpdate(status: SupportTicketStatus) {
    if (!token || !activeTicketId || updatingStatus) {
      return;
    }

    setUpdatingStatus(status);
    setError(null);

    const response = await updateSupportTicketStatus(token, activeTicketId, status);
    setUpdatingStatus(null);

    if (!response.data) {
      setError(response.error || 'Unable to update this ticket.');
      return;
    }

    setMessagesByTicket((current) => ({
      ...current,
      [activeTicketId]: [...(current[activeTicketId] ?? []), response.data!.message],
    }));
    await loadTickets(activeTicketId);
  }

  async function handleCreateTicket() {
    const trimmedSubject = subject.trim();
    const trimmedDetails = details.trim();

    if (!token || !trimmedSubject || (!trimmedDetails && newTicketAttachments.length === 0) || creatingTicket) {
      return;
    }

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
    setMessagesByTicket((current) => ({
      ...current,
      [response.data!.conversation_id]: [response.data!.message],
    }));
    await loadTickets(response.data.conversation_id);
  }

  async function handleReply() {
    const content = replyText.trim();
    const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId) ?? null;
    const activeStatus = activeTicket?.listing_details?.support_status ?? 'open';

    if (
      !token ||
      !activeTicketId ||
      (!content && replyAttachments.length === 0) ||
      activeStatus === 'closed' ||
      replying
    ) {
      return;
    }

    const attachmentsToSend = replyAttachments;
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
    setMessagesByTicket((current) => ({
      ...current,
      [activeTicketId]: [...(current[activeTicketId] ?? []), tempMessage],
    }));

    const response = await sendReply(token, activeTicketId, content, toAttachmentUploads(attachmentsToSend));

    setReplying(false);

    if (!response.data) {
      setError(response.error || 'Unable to send your reply.');
      setReplyText(content);
      setReplyAttachments(attachmentsToSend);
      setMessagesByTicket((current) => ({
        ...current,
        [activeTicketId]: (current[activeTicketId] ?? []).filter((message) => message.id !== tempMessage.id),
      }));
      return;
    }

    revokePendingAttachmentPreviews(attachmentsToSend);
    setMessagesByTicket((current) => ({
      ...current,
      [activeTicketId]: (current[activeTicketId] ?? []).map((message) =>
        message.id === tempMessage.id ? response.data! : message
      ),
    }));
    await loadTickets(activeTicketId);
  }

  if (authLoading || !user) {
    return <div className={styles.loading}>Loading support tickets...</div>;
  }

  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId) ?? null;
  const activeMessages = activeTicketId ? messagesByTicket[activeTicketId] ?? [] : [];
  const activeStatus = activeTicket?.listing_details?.support_status ?? 'open';
  const activeStatusClass =
    activeStatus === 'closed'
      ? styles.statusClosed
      : activeStatus === 'resolved'
        ? styles.statusResolved
        : styles.statusOpen;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon}>
          <TicketIcon />
        </div>
        <div>
          <p className={styles.eyebrow}>Support tickets</p>
          <h1 className={styles.title}>Ask admin for help and track every previous request.</h1>
          <p className={styles.subtitle}>
            Create a new ticket for account problems, listing issues, payment confusion, or anything
            in the system that needs admin support.
          </p>
        </div>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.grid}>
        <section className={styles.ticketListCard}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Previous asked</p>
              <h2 className={styles.sectionTitle}>Your tickets</h2>
            </div>
            <span className={styles.ticketCount}>{tickets.length}</span>
          </div>

          <div className={styles.ticketList}>
            {loadingTickets ? (
              <p className={styles.emptyText}>Loading tickets...</p>
            ) : tickets.length === 0 ? (
              <p className={styles.emptyText}>No tickets yet. Open your first ticket on the right.</p>
            ) : (
              tickets.map((ticket) => {
                const isActive = ticket.id === activeTicketId;

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    className={`${styles.ticketItem} ${isActive ? styles.ticketItemActive : ''}`}
                    onClick={() => setActiveTicketId(ticket.id)}
                  >
                    <span className={styles.ticketItemTop}>
                      <strong>{getTicketTitle(ticket)}</strong>
                      <span>{ticket.listing_details?.support_status ?? 'open'}</span>
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
        </section>

        <section className={styles.ticketWorkCard}>
          <div className={styles.newTicketBox}>
            <p className={styles.sectionEyebrow}>Open new ticket</p>
            <label className={styles.fieldLabel} htmlFor="ticket-subject">
              Subject
            </label>
            <input
              id="ticket-subject"
              className={styles.input}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Example: Cannot add a new listing"
              maxLength={90}
            />
            <label className={styles.fieldLabel} htmlFor="ticket-details">
              What happened?
            </label>
            <textarea
              id="ticket-details"
              className={styles.textarea}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              onPaste={(event) => void handlePasteForAttachments(event, newTicketAttachments, setNewTicketAttachments)}
              placeholder="Tell admin what you tried, what failed, and any error you saw... (Ctrl+V to paste image)"
              rows={5}
              maxLength={2000}
            />
            {newTicketAttachments.length > 0 && (
              <div className={styles.pendingAttachments}>
                {newTicketAttachments.map((attachment) => (
                  <div key={attachment.id} className={styles.pendingAttachment}>
                    <img src={attachment.previewUrl} alt={attachment.fileName} />
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(attachment.id, setNewTicketAttachments)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={newTicketFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className={styles.hiddenFileInput}
              onChange={(event) =>
                void handleAttachmentSelect(event, newTicketAttachments, setNewTicketAttachments)
              }
            />
            <button
              type="button"
              className={styles.attachButton}
              onClick={() => newTicketFileInputRef.current?.click()}
              disabled={creatingTicket || newTicketAttachments.length >= MAX_MESSAGE_ATTACHMENTS}
            >
              <ImageIcon />
              Attach screenshot
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleCreateTicket()}
              disabled={!subject.trim() || (!details.trim() && newTicketAttachments.length === 0) || creatingTicket}
            >
              {creatingTicket ? 'Opening ticket...' : 'Open ticket'}
            </button>
          </div>

          <div className={styles.threadBox}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Ticket conversation</p>
                <h2 className={styles.sectionTitle}>
                  {activeTicket ? getTicketTitle(activeTicket) : 'Select a ticket'}
                </h2>
              </div>
              {activeTicket && (
                <div className={styles.threadActions}>
                  <span className={`${styles.statusPill} ${activeStatusClass}`}>
                    {activeStatus}
                  </span>
                  {activeStatus !== 'open' ? (
                    <button
                      type="button"
                      className={styles.statusButton}
                      onClick={() => void handleStatusUpdate('open')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'open' ? 'Reopening...' : 'Reopen'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.statusButton}
                      onClick={() => void handleStatusUpdate('resolved')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'resolved' ? 'Updating...' : 'Mark resolved'}
                    </button>
                  )}
                  {activeStatus !== 'closed' && (
                    <button
                      type="button"
                      className={`${styles.statusButton} ${styles.statusButtonDanger}`}
                      onClick={() => void handleStatusUpdate('closed')}
                      disabled={Boolean(updatingStatus)}
                    >
                      {updatingStatus === 'closed' ? 'Closing...' : 'Close'}
                    </button>
                  )}
                  <Link
                    href={`${ROUTES.MESSAGES}?conversationId=${activeTicket.id}`}
                    className={styles.openMessagesLink}
                  >
                    Open in messages
                  </Link>
                </div>
              )}
            </div>

            <div className={styles.messageList}>
              {!activeTicket ? (
                <p className={styles.emptyText}>Choose a previous ticket or open a new one.</p>
              ) : loadingMessages ? (
                <p className={styles.emptyText}>Loading conversation...</p>
              ) : (
                activeMessages.map((message) => {
                  const isMine = message.sender_id === user.id;

                  return (
                    <article
                      key={message.id}
                      className={`${styles.messageBubble} ${isMine ? styles.messageMine : styles.messageAdmin}`}
                    >
                      <span className={styles.messageAuthor}>{isMine ? 'You' : 'Admin'}</span>
                      {message.attachments?.length > 0 && (
                        <div className={styles.messageAttachments}>
                          {message.attachments.map((attachment) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
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
            </div>

            {activeTicket && (
              <div className={styles.replyBox}>
                {activeStatus === 'closed' && (
                  <div className={styles.closedNotice}>
                    This ticket is closed. Reopen it before adding more information.
                  </div>
                )}
                {replyAttachments.length > 0 && (
                  <div className={styles.pendingAttachments}>
                    {replyAttachments.map((attachment) => (
                      <div key={attachment.id} className={styles.pendingAttachment}>
                        <img src={attachment.previewUrl} alt={attachment.fileName} />
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(attachment.id, setReplyAttachments)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={replyFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className={styles.hiddenFileInput}
                  onChange={(event) => void handleAttachmentSelect(event, replyAttachments, setReplyAttachments)}
                />
                <textarea
                  className={styles.replyTextarea}
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  onPaste={(event) => void handlePasteForAttachments(event, replyAttachments, setReplyAttachments)}
                  placeholder="Add more information for admin... (Ctrl+V to paste image)"
                  rows={3}
                  maxLength={2000}
                  disabled={activeStatus === 'closed'}
                />
                <button
                  type="button"
                  className={styles.attachButtonSmall}
                  onClick={() => replyFileInputRef.current?.click()}
                  disabled={activeStatus === 'closed' || replying || replyAttachments.length >= MAX_MESSAGE_ATTACHMENTS}
                >
                  <ImageIcon />
                  Image
                </button>
                <button
                  type="button"
                  className={styles.replyButton}
                  onClick={() => void handleReply()}
                  disabled={(!replyText.trim() && replyAttachments.length === 0) || activeStatus === 'closed' || replying}
                >
                  {replying ? 'Sending...' : 'Reply'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <ImageLightbox
        src={lightboxSrc}
        alt="Ticket image"
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}
