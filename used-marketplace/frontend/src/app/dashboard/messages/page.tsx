'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import * as messageService from '@/src/services/messageService';
import type { ConversationDetail, ChatMessage } from '@/src/services/messageService';
import styles from './page.module.css';

/* ── SVG Icons ── */
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const PlusCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" />
  </svg>
);

const SmileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const SearchChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const MoreVertIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
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
    <path d="M18 6 7 17l-5-5" /><path d="m22 10-9.5 9.5-2-2" />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4zm-1 14.59l-3.3-3.3 1.41-1.41L11 13.77l4.89-4.89 1.41 1.41L11 16.59z" />
  </svg>
);

const LinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const LocationIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const BigMessageIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" />
  </svg>
);

/* ── Types ── */
type FilterTab = 'all' | 'unread' | 'buying';

// Helper to determine role
const getRole = (convo: ConversationDetail, userId?: string) => {
  return convo.buyer_id === userId ? 'buying' : 'seller';
};

const getInitials = (name?: string | null) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const COLORS = ['avatarGreen', 'avatarAmber', 'avatarPurple', 'avatarNavy', 'avatarPink', 'avatarBlue'];
const getAvatarColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

const formatTime = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function MessagesPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  
  const [conversations, setConversations] = useState<ConversationDetail[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const { data, error } = await messageService.fetchConversations(token);
    if (!error && data) {
      setConversations(data);
    }
    setLoadingConversations(false);
  }, [token]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!token) return;
    setLoadingMessages(true);
    const { data, error } = await messageService.fetchMessages(token, conversationId);
    if (!error && data) {
      setMessages(data);
    }
    setLoadingMessages(false);
  }, [token]);

  // Initial load
  useEffect(() => {
    if (!authLoading && token) {
      loadConversations();
    }
  }, [token, authLoading, loadConversations]);

  // Periodic polling for conversations
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(loadConversations, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [loadConversations, token]);

  // Periodic polling for selected conversation messages
  useEffect(() => {
    if (!token || !selectedConversation) return;
    
    // Initial fetch when selection changes
    loadMessages(selectedConversation);
    // Mark as read immediately on load
    messageService.markAsRead(token, selectedConversation).then(() => {
       // local optimistic update for unread_count
       setConversations(prev => prev.map(c => 
         c.id === selectedConversation ? { ...c, unread_count: 0 } : c
       ));
    });

    const interval = setInterval(() => {
      messageService.fetchMessages(token, selectedConversation).then(({ data, error }) => {
        if (!error && data) {
           // update if different length (simple check for new messages)
           setMessages(current => {
              if (current.length !== data.length) {
                 messageService.markAsRead(token, selectedConversation);
                 return data;
              }
              return current;
           });
        }
      });
    }, 5000); // 5 sec poll while looking at chat

    return () => clearInterval(interval);
  }, [selectedConversation, loadMessages, token]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedConversation]);

  // Filter conversations
  const filteredConversations = conversations.filter((conv) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = (conv.other_user?.full_name || '').toLowerCase().includes(query);
      const matchesProduct = (conv.listing_details?.title || '').toLowerCase().includes(query);
      const matchesMessage = (conv.last_message?.content || '').toLowerCase().includes(query);
      if (!matchesName && !matchesProduct && !matchesMessage) return false;
    }

    const role = getRole(conv, user?.id);
    // Tab filter
    if (filterTab === 'unread') return conv.unread_count > 0;
    if (filterTab === 'buying') return role === 'buying';
    return true;
  });

  const activeConv = conversations.find((c) => c.id === selectedConversation);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation || !token || !user) return;

    const content = messageInput.trim();
    setIsSending(true);
    setMessageInput('');
    inputRef.current?.focus();

    // Optimistic UI update
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConversation,
      sender_id: user.id,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, tempMessage]);
    
    // Update local conversation list
    setConversations(prev => prev.map(c => {
      if (c.id === selectedConversation) {
        return {
          ...c,
          last_message: {
            content,
            created_at: tempMessage.created_at,
            sender_id: user.id,
            is_read: false
          }
        }
      }
      return c;
    }));

    const { data, error } = await messageService.sendReply(token, selectedConversation, content);
    
    if (error || !data) {
      console.error('Failed to send message:', error);
      // Rollback on fail (optional for MVP, omit for brevity, but let's just log)
    } else {
      // Replace temp with real
      setMessages(prev => prev.map(m => m.id === tempMessage.id ? data : m));
    }
    
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleConversationSelect = (id: string) => {
    setSelectedConversation(id);
    setMobileChatOpen(true);
  };

  if (authLoading || loadingConversations) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Loading messages...</div>;
  }

  return (
    <div className={styles.messagesPage}>
      <div className={styles.messagesContainer}>
        {/* ── Left: Conversation List ── */}
        <div className={styles.conversationPanel}>
          <div className={styles.conversationHeader}>
            <h1 className={styles.conversationTitle}>Messages</h1>
            <div className={styles.filterTabs}>
              {(['all', 'unread', 'buying'] as FilterTab[]).map((tab) => (
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

          {/* Search */}
          <div className={styles.conversationSearch}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}><SearchIcon /></span>
              <input
                type="text"
                placeholder="Search conversations..."
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                id="search-conversations"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className={styles.conversationList}>
            {filteredConversations.length === 0 ? (
              <div className={styles.emptyConversations}>
                <div className={styles.emptyConversationsIcon}>💬</div>
                <div className={styles.emptyConversationsTitle}>No conversations found</div>
                <div className={styles.emptyConversationsDesc}>
                  {searchQuery ? 'Try a different search term.' : 'Start browsing to connect with sellers.'}
                </div>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isUnread = conv.unread_count > 0;
                const name = conv.other_user?.full_name || 'Marketplace User';
                const avatarColor = getAvatarColor(conv.other_user?.id || conv.id);
                const initials = getInitials(name);

                return (
                  <div
                    key={conv.id}
                    className={`${styles.conversationItem} ${selectedConversation === conv.id ? styles.conversationItemActive : ''}`}
                    onClick={() => handleConversationSelect(conv.id)}
                    role="button"
                    tabIndex={0}
                    id={`conversation-${conv.id}`}
                  >
                    <div className={`${styles.conversationAvatar} ${styles[avatarColor]}`}>
                      {initials}
                    </div>
                    <div className={styles.conversationContent}>
                      <div className={styles.conversationTop}>
                        <span className={styles.conversationName}>{name}</span>
                        <span className={styles.conversationTime}>
                          {formatTime(conv.last_message?.created_at || conv.created_at)}
                        </span>
                      </div>
                      <div className={styles.conversationProduct}>{conv.listing_details?.title || 'Unknown Product'}</div>
                      <div className={styles.conversationPreview}>
                        {conv.last_message ? conv.last_message.content : 'Started a conversation'}
                      </div>
                    </div>
                    {isUnread && <span className={styles.unreadDot} />}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Chat Area ── */}
        {activeConv ? (
          <div className={`${styles.chatPanel} ${mobileChatOpen ? styles.chatPanelActive : ''}`}>
            {/* Chat Header */}
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
                <div className={`${styles.chatHeaderAvatar} ${styles[getAvatarColor(activeConv.other_user?.id || activeConv.id)]}`}>
                  {getInitials(activeConv.other_user?.full_name)}
                </div>
                <div className={styles.chatHeaderInfo}>
                  <span className={styles.chatHeaderName}>{activeConv.other_user?.full_name || 'Marketplace User'}</span>
                </div>
                <div className={styles.chatHeaderProduct}>
                  <div className={styles.productThumbnail}>
                    {activeConv.listing_details?.cover_image_path ? (
                       <img src={activeConv.listing_details.cover_image_path} alt="Product" />
                    ) : (
                      <span className={styles.productThumbnailFallback}>
                        {(activeConv.listing_details?.title || 'P').charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className={styles.productInfo}>
                    <span className={styles.productDiscussLabel}>Discussing</span>
                    <span className={styles.productDiscussName}>{activeConv.listing_details?.title || 'Unknown Product'}</span>
                  </div>
                </div>
              </div>
              <div className={styles.chatHeaderActions}>
                <button className={styles.chatHeaderBtn} type="button" aria-label="Search in chat" id="search-chat-btn">
                  <SearchChatIcon />
                </button>
                <button className={styles.chatHeaderBtn} type="button" aria-label="More options" id="more-options-btn">
                  <MoreVertIcon />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className={styles.chatMessages}>
              {loadingMessages && messages.length === 0 ? (
                 <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>Loading messages...</div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === user?.id;
                  
                  // For the date divider, a robust implementation would group messages by date. 
                  // Keeping simple here.
                  
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.messageGroup} ${
                        isMe ? styles.messageGroupSent : styles.messageGroupReceived
                      }`}
                    >
                      {!isMe && (
                        <div className={`${styles.messageAvatar} ${styles[getAvatarColor(activeConv.other_user?.id || activeConv.id)]}`}>
                          {getInitials(activeConv.other_user?.full_name).charAt(0)}
                        </div>
                      )}
                      <div className={styles.messageContent}>
                        <div
                          className={`${styles.messageBubble} ${
                            isMe ? styles.messageBubbleSent : styles.messageBubbleReceived
                          }`}
                        >
                          {msg.content}
                        </div>
                        <div
                          className={`${styles.messageTime} ${
                            isMe ? styles.messageTimeSent : styles.messageTimeReceived
                          }`}
                        >
                          {formatTime(msg.created_at)}
                          {isMe && (
                            <span className={styles.readReceipt}>
                              {msg.is_read ? <DoubleCheckIcon /> : <CheckIcon />}
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

            {/* Chat Input */}
            <div className={styles.chatInputArea}>
              <div className={styles.chatInputRow}>
                <button className={styles.chatAttachBtn} type="button" aria-label="Attach file" id="attach-file-btn">
                  <PlusCircleIcon />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Write a message..."
                  className={styles.chatInput}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  id="message-input"
                  disabled={isSending}
                />
                <button className={styles.chatEmojiBtn} type="button" aria-label="Add emoji" id="emoji-btn">
                  <SmileIcon />
                </button>
                <button
                  className={`${styles.chatSendBtn} ${!messageInput.trim() || isSending ? styles.chatSendBtnDisabled : ''}`}
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || isSending}
                  type="button"
                  aria-label="Send message"
                  id="send-message-btn"
                >
                  <SendIcon />
                </button>
              </div>
              <div className={styles.chatActionsBar}>
                <div className={styles.chatActionsLeft}>
                  <button className={styles.chatActionBtn} type="button" id="request-safe-pay-btn">
                    <LinkIcon />
                    Request Safe-Pay Link
                  </button>
                  <button className={styles.chatActionBtn} type="button" id="share-location-btn">
                    <LocationIcon />
                    Share Location
                  </button>
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
              Choose a conversation from the sidebar to start messaging, or browse listings to connect with sellers.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
