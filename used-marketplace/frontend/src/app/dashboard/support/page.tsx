'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  createSupportConversation,
  fetchConversations,
  fetchMessages,
  sendReply,
  type ChatMessage,
  type ConversationDetail,
} from '@/src/services/messageService';
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
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleCreateTicket() {
    const trimmedSubject = subject.trim();
    const trimmedDetails = details.trim();

    if (!token || !trimmedSubject || !trimmedDetails || creatingTicket) {
      return;
    }

    setCreatingTicket(true);
    setError(null);

    const response = await createSupportConversation(token, {
      subject: trimmedSubject,
      content: trimmedDetails,
    });

    setCreatingTicket(false);

    if (!response.data) {
      setError(response.error || 'Unable to create a support ticket.');
      return;
    }

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

    if (!token || !activeTicketId || !content || replying) {
      return;
    }

    setReplying(true);
    setReplyText('');
    setError(null);

    const response = await sendReply(token, activeTicketId, content);

    setReplying(false);

    if (!response.data) {
      setError(response.error || 'Unable to send your reply.');
      setReplyText(content);
      return;
    }

    setMessagesByTicket((current) => ({
      ...current,
      [activeTicketId]: [...(current[activeTicketId] ?? []), response.data!],
    }));
    await loadTickets(activeTicketId);
  }

  if (authLoading || !user) {
    return <div className={styles.loading}>Loading support tickets...</div>;
  }

  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId) ?? null;
  const activeMessages = activeTicketId ? messagesByTicket[activeTicketId] ?? [] : [];

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
                      <span>Open</span>
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
              placeholder="Tell admin what you tried, what failed, and any error you saw..."
              rows={5}
              maxLength={2000}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleCreateTicket()}
              disabled={!subject.trim() || !details.trim() || creatingTicket}
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
                <Link
                  href={`${ROUTES.MESSAGES}?conversationId=${activeTicket.id}`}
                  className={styles.openMessagesLink}
                >
                  Open in messages
                </Link>
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
                      <p>{message.content}</p>
                      <time>{formatTicketTime(message.created_at)}</time>
                    </article>
                  );
                })
              )}
            </div>

            {activeTicket && (
              <div className={styles.replyBox}>
                <textarea
                  className={styles.replyTextarea}
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="Add more information for admin..."
                  rows={3}
                  maxLength={2000}
                />
                <button
                  type="button"
                  className={styles.replyButton}
                  onClick={() => void handleReply()}
                  disabled={!replyText.trim() || replying}
                >
                  {replying ? 'Sending...' : 'Reply'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
