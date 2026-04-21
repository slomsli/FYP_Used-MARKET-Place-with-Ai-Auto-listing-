'use client';

import { FormEvent, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Spinner from '@/src/components/ui/Spinner';
import { useAuth } from '@/src/hooks/useAuth';
import {
  archiveAssistantThread as archiveAssistantThreadRequest,
  createAssistantThread as createAssistantThreadRequest,
  deleteAssistantThread as deleteAssistantThreadRequest,
  getAssistantThreadMessages,
  listAssistantThreads,
  sendAssistantMessage as sendAssistantMessageRequest,
} from '@/src/services/assistantService';
import { getProfile } from '@/src/services/profileService';
import type {
  AssistantConversationMessage,
  AssistantCurrentPageContext,
  AssistantPersistedMessage,
  AssistantQuickAction,
  AssistantResponse,
  AssistantResponseBlock,
  AssistantRole,
  AssistantRoleContext,
  AssistantSelectedEntityContext,
  AssistantThreadSummary,
} from '@/src/types/assistant';
import styles from './MarketplaceAssistant.module.css';

const NEW_CHAT_TITLE = 'New chat';

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" />
      <path d="m19 15 .9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6L15.5 18l2.6-.9L19 15Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function buildPageContext(pathname: string): AssistantCurrentPageContext {
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin') {
      return {
        path: pathname,
        title: 'Admin overview',
        section: 'admin',
        pageType: 'admin_dashboard',
      };
    }

    if (pathname.startsWith('/admin/reports')) {
      return {
        path: pathname,
        title: 'Admin reports',
        section: 'admin',
        pageType: 'moderation_reports',
      };
    }

    if (pathname.startsWith('/admin/listings')) {
      return {
        path: pathname,
        title: 'Admin listings',
        section: 'admin',
        pageType: 'admin_listings',
      };
    }

    if (pathname.startsWith('/admin/users')) {
      return {
        path: pathname,
        title: 'Admin users',
        section: 'admin',
        pageType: 'admin_users',
      };
    }

    return {
      path: pathname,
      title: 'Admin workspace',
      section: 'admin',
      pageType: 'admin',
    };
  }

  if (pathname.startsWith('/dashboard')) {
    if (pathname.startsWith('/dashboard/add-listing')) {
      return {
        path: pathname,
        title: 'Create listing',
        section: 'dashboard',
        pageType: 'listing_editor',
      };
    }

    if (pathname.startsWith('/dashboard/offers')) {
      return {
        path: pathname,
        title: 'Offers',
        section: 'dashboard',
        pageType: 'offers',
      };
    }

    if (pathname.startsWith('/dashboard/messages')) {
      return {
        path: pathname,
        title: 'Messages',
        section: 'dashboard',
        pageType: 'messages',
      };
    }

    if (pathname.startsWith('/dashboard/report')) {
      return {
        path: pathname,
        title: 'Report listing',
        section: 'dashboard',
        pageType: 'report',
      };
    }

    if (pathname.startsWith('/dashboard/my-listings')) {
      return {
        path: pathname,
        title: 'My listings',
        section: 'dashboard',
        pageType: 'seller_inventory',
      };
    }

    return {
      path: pathname,
      title: 'Dashboard',
      section: 'dashboard',
      pageType: 'member_dashboard',
    };
  }

  if (pathname.startsWith('/product/')) {
    return {
      path: pathname,
      title: 'Product details',
      section: 'marketplace',
      pageType: 'product_detail',
    };
  }

  if (pathname === '/browse') {
    return {
      path: pathname,
      title: 'Browse marketplace',
      section: 'marketplace',
      pageType: 'browse',
    };
  }

  return {
    path: pathname,
    title: 'Marketplace',
    section: 'marketplace',
    pageType: 'general',
  };
}

function buildSelectedEntityContext(pathname: string): AssistantSelectedEntityContext | undefined {
  const productMatch = /^\/product\/([^/]+)$/.exec(pathname);

  if (productMatch) {
    return {
      listingId: decodeURIComponent(productMatch[1]),
    };
  }

  return undefined;
}

function buildRoleContext(pathname: string, role: AssistantRole): AssistantRoleContext {
  if (role === 'admin' || pathname.startsWith('/admin')) {
    return 'admin';
  }

  if (
    pathname.startsWith('/dashboard/add-listing') ||
    pathname.startsWith('/dashboard/my-listings') ||
    pathname.startsWith('/dashboard/offers')
  ) {
    return 'seller';
  }

  return 'user';
}

function getSuggestedActions(
  role: AssistantRole,
  selectedEntityContext?: AssistantSelectedEntityContext
): AssistantQuickAction[] {
  if (role === 'admin') {
    return [
      { id: 'sales-today', label: 'Sales today', message: 'How many items were sold today?' },
      { id: 'pending-reports', label: 'Pending reports', message: 'Show me the pending reports count.' },
      { id: 'top-categories', label: 'Top categories', message: 'Show me the top categories.' },
      { id: 'new-users', label: 'New users this week', message: 'How many new users joined this week?' },
    ];
  }

  return [
    { id: 'show-purchases', label: 'Show my purchases', message: 'Show my purchases.' },
    {
      id: 'report-problem',
      label: 'Report a problem',
      message: selectedEntityContext?.listingId
        ? 'I want to report a problem with this listing.'
        : 'I need to report a problem.',
    },
    { id: 'show-sold-items', label: 'Show my sold items', message: 'Show my sold items.' },
    { id: 'help-create-listing', label: 'Help me create a listing', message: 'Help me create a listing.' },
  ];
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapPersistedMessage(message: AssistantPersistedMessage): AssistantConversationMessage {
  return {
    id: message.id,
    role: message.senderType === 'assistant' ? 'assistant' : 'user',
    text: message.content,
    response: message.response,
    createdAt: message.createdAt,
  };
}

function sortThreadsByActivity(threads: AssistantThreadSummary[]): AssistantThreadSummary[] {
  return [...threads].sort((left, right) => {
    const leftTime = new Date(left.lastMessageAt ?? left.updatedAt).getTime();
    const rightTime = new Date(right.lastMessageAt ?? right.updatedAt).getTime();
    return rightTime - leftTime;
  });
}

function upsertThread(
  threads: AssistantThreadSummary[],
  nextThread: AssistantThreadSummary
): AssistantThreadSummary[] {
  return sortThreadsByActivity([
    nextThread,
    ...threads.filter((thread) => thread.id !== nextThread.id),
  ]);
}

function formatMessageCount(count: number): string {
  if (count === 0) {
    return 'Empty';
  }

  return `${count} message${count === 1 ? '' : 's'}`;
}

function formatRoleContext(roleContext: AssistantRoleContext): string {
  switch (roleContext) {
    case 'admin':
      return 'Admin';
    case 'seller':
      return 'Seller';
    default:
      return 'User';
  }
}

function formatThreadStatus(status: AssistantThreadSummary['status']): string {
  switch (status) {
    case 'archived':
      return 'Archived';
    case 'closed':
      return 'Closed';
    default:
      return 'Active';
  }
}

function formatThreadTimestamp(value: string | null): string {
  if (!value) {
    return 'Just now';
  }

  try {
    return new Intl.DateTimeFormat('en-MY', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Just now';
  }
}

function buildThreadStateLabel(thread: AssistantThreadSummary): string {
  const pendingAction = thread.threadState.pendingAction;

  if (pendingAction?.type === 'navigate') {
    return pendingAction.label
      ? `Waiting for confirmation to open ${pendingAction.label}.`
      : 'Waiting for navigation confirmation.';
  }

  if (pendingAction?.type === 'report_scope') {
    return 'Waiting for you to choose whether the report is about a purchase or a sale.';
  }

  if (pendingAction?.type === 'report_order_selection') {
    return 'Waiting for you to choose which order should be reported.';
  }

  if (thread.status === 'archived') {
    return 'This chat is archived. Sending a new message will reopen it.';
  }

  return 'Ready to continue this conversation.';
}

export default function MarketplaceAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, session, loading } = useAuth();
  const token = session?.access_token;
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [assistantRole, setAssistantRole] = useState<AssistantRole | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [threads, setThreads] = useState<AssistantThreadSummary[]>([]);
  const [messagesByThreadId, setMessagesByThreadId] = useState<Record<string, AssistantConversationMessage[]>>({});
  const [threadErrors, setThreadErrors] = useState<Record<string, string | null>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [threadListError, setThreadListError] = useState<string | null>(null);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [threadActionId, setThreadActionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Thinking...');
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) {
      setAssistantRole(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    getProfile(token)
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (response.data?.role === 'admin') {
          setAssistantRole('admin');
        } else if (response.data?.role === 'user') {
          setAssistantRole('user');
        } else if (user?.user_metadata?.role === 'admin') {
          setAssistantRole('admin');
        } else {
          setAssistantRole('user');
        }

        setProfileLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        if (user?.user_metadata?.role === 'admin') {
          setAssistantRole('admin');
        } else if (user) {
          setAssistantRole('user');
        } else {
          setAssistantRole(null);
        }

        setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  useEffect(() => {
    if (!assistantRole || !token) {
      setThreads([]);
      setMessagesByThreadId({});
      setThreadErrors({});
      setActiveThreadId(null);
      setThreadListError(null);
      setThreadsLoading(false);
      return;
    }

    let cancelled = false;
    setThreadsLoading(true);

    listAssistantThreads(token)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const nextThreadData = response.data;

        if (response.error || !nextThreadData) {
          setThreads([]);
          setActiveThreadId(null);
          setThreadListError(response.error || 'Unable to load assistant chats.');
          setThreadsLoading(false);
          return;
        }

        const nextThreads = sortThreadsByActivity(nextThreadData);
        setThreads(nextThreads);
        setThreadListError(null);
        setActiveThreadId((currentThreadId) => {
          if (currentThreadId && nextThreads.some((thread) => thread.id === currentThreadId)) {
            return currentThreadId;
          }

          return nextThreads[0]?.id ?? null;
        });
        setThreadsLoading(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setThreads([]);
        setActiveThreadId(null);
        setThreadListError(error instanceof Error ? error.message : 'Unable to load assistant chats.');
        setThreadsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assistantRole, token]);

  useEffect(() => {
    if (!token || !activeThreadId) {
      return;
    }

    const activeThread = threads.find((thread) => thread.id === activeThreadId);
    if (!activeThread) {
      return;
    }

    const existingMessages = messagesByThreadId[activeThreadId];
    if (existingMessages) {
      setMessagesLoading(false);
      return;
    }

    if (activeThread.messageCount === 0) {
      setMessagesLoading(false);
      setMessagesByThreadId((current) => {
        if (current[activeThreadId]) {
          return current;
        }

        return {
          ...current,
          [activeThreadId]: [],
        };
      });
      return;
    }

    let cancelled = false;
    setMessagesLoading(true);

    getAssistantThreadMessages(token, activeThreadId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const threadMessages = response.data;

        if (response.error || !threadMessages) {
          setThreadErrors((current) => ({
            ...current,
            [activeThreadId]: response.error || 'Unable to load this conversation.',
          }));
          setMessagesLoading(false);
          return;
        }

        setMessagesByThreadId((current) => ({
          ...current,
          [activeThreadId]: threadMessages.map(mapPersistedMessage),
        }));
        setThreadErrors((current) => ({
          ...current,
          [activeThreadId]: null,
        }));
        setMessagesLoading(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setThreadErrors((current) => ({
          ...current,
          [activeThreadId]: error instanceof Error ? error.message : 'Unable to load this conversation.',
        }));
        setMessagesLoading(false);
      });

    return () => {
      cancelled = true;
      setMessagesLoading(false);
    };
  }, [token, activeThreadId, threads, messagesByThreadId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const currentThread = useMemo(() => {
    if (!activeThreadId) {
      return null;
    }

    return threads.find((thread) => thread.id === activeThreadId) || null;
  }, [threads, activeThreadId]);

  const currentMessages = useMemo(() => {
    if (!currentThread) {
      return [];
    }

    return messagesByThreadId[currentThread.id] ?? [];
  }, [currentThread, messagesByThreadId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [currentMessages, isSending, isOpen]);

  if (loading || profileLoading || !user || !token || !assistantRole) {
    return null;
  }

  const currentPageContext = buildPageContext(pathname);
  const selectedEntityContext = buildSelectedEntityContext(pathname);
  const currentRoleContext = buildRoleContext(pathname, assistantRole);
  const latestAssistantResponse = [...currentMessages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.response)?.response;
  const suggestedActions =
    latestAssistantResponse?.blocks.find((block) => block.type === 'quick_actions')?.items ||
    getSuggestedActions(assistantRole, selectedEntityContext);
  const currentThreadError = currentThread ? threadErrors[currentThread.id] ?? null : null;
  const isThreadActionBusy = isCreatingThread || threadActionId !== null;

  function executeAssistantAction(response: AssistantResponse) {
    if (response.action.type !== 'navigate' || !response.action.target) {
      return;
    }

    startTransition(() => {
      router.push(response.action.target as Parameters<typeof router.push>[0]);
    });
  }

  async function refreshThreadList(preferredThreadId?: string): Promise<void> {
    if (!token) {
      return;
    }

    const response = await listAssistantThreads(token);
    const nextThreadData = response.data;

    if (response.error || !nextThreadData) {
      setThreadListError(response.error || 'Unable to load assistant chats.');
      return;
    }

    const nextThreads = sortThreadsByActivity(nextThreadData);
    setThreads(nextThreads);
    setThreadListError(null);
    setActiveThreadId((currentSelectedId) => {
      const desiredThreadId = preferredThreadId ?? currentSelectedId;

      if (desiredThreadId && nextThreads.some((thread) => thread.id === desiredThreadId)) {
        return desiredThreadId;
      }

      return nextThreads[0]?.id ?? null;
    });
  }

  async function loadThreadMessages(threadId: string, force = false): Promise<void> {
    if (!token || (!force && messagesByThreadId[threadId])) {
      return;
    }

    const response = await getAssistantThreadMessages(token, threadId);
    const threadMessages = response.data;

    if (response.error || !threadMessages) {
      setThreadErrors((current) => ({
        ...current,
        [threadId]: response.error || 'Unable to load this conversation.',
      }));
      return;
    }

    setMessagesByThreadId((current) => ({
      ...current,
      [threadId]: threadMessages.map(mapPersistedMessage),
    }));
    setThreadErrors((current) => ({
      ...current,
      [threadId]: null,
    }));
  }

  async function createThreadForCurrentContext(): Promise<AssistantThreadSummary | null> {
    if (!token || isCreatingThread) {
      return null;
    }

    setIsCreatingThread(true);
    const response = await createAssistantThreadRequest(token, {
      roleContext: currentRoleContext,
    });
    setIsCreatingThread(false);

    const createdThread = response.data;

    if (response.error || !createdThread) {
      setThreadListError(response.error || 'Unable to create a new chat.');
      return null;
    }

    setThreads((current) => upsertThread(current, createdThread));
    setMessagesByThreadId((current) => ({
      ...current,
      [createdThread.id]: [],
    }));
    setThreadErrors((current) => ({
      ...current,
      [createdThread.id]: null,
    }));
    setActiveThreadId(createdThread.id);
    setThreadListError(null);
    setInputValue('');
    setIsOpen(true);

    return createdThread;
  }

  async function handleCreateNewChat() {
    if (isSending || isThreadActionBusy) {
      return;
    }

    await createThreadForCurrentContext();
  }

  async function handleArchiveThread(threadId: string) {
    if (!token || isSending || isCreatingThread) {
      return;
    }

    setThreadActionId(threadId);
    const response = await archiveAssistantThreadRequest(token, threadId);
    setThreadActionId(null);

    const archivedThread = response.data;

    if (response.error || !archivedThread) {
      setThreadErrors((current) => ({
        ...current,
        [threadId]: response.error || 'Unable to archive this chat.',
      }));
      return;
    }

    setThreads((current) => upsertThread(current, archivedThread));
    setThreadErrors((current) => ({
      ...current,
      [threadId]: null,
    }));
  }

  async function handleDeleteThread(threadId: string) {
    if (!token || isSending || isCreatingThread) {
      return;
    }

    const confirmed = window.confirm('Delete this chat? You can no longer access it from the assistant list.');
    if (!confirmed) {
      return;
    }

    setThreadActionId(threadId);
    const response = await deleteAssistantThreadRequest(token, threadId);
    setThreadActionId(null);

    if (response.error || !response.data) {
      setThreadErrors((current) => ({
        ...current,
        [threadId]: response.error || 'Unable to delete this chat.',
      }));
      return;
    }

    const remainingThreads = threads.filter((thread) => thread.id !== threadId);
    setThreads(remainingThreads);
    setMessagesByThreadId((current) => {
      const nextMessages = { ...current };
      delete nextMessages[threadId];
      return nextMessages;
    });
    setThreadErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[threadId];
      return nextErrors;
    });

    if (activeThreadId === threadId) {
      setActiveThreadId(remainingThreads[0]?.id ?? null);
    }
  }

  async function submitMessage(messageText: string) {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage || isSending || !token) {
      return;
    }

    const resolvedThread = currentThread ?? (await createThreadForCurrentContext());
    if (!resolvedThread) {
      return;
    }

    const optimisticMessageId = createLocalId('assistant-user');
    const createdAt = new Date().toISOString();
    const optimisticUserMessage: AssistantConversationMessage = {
      id: optimisticMessageId,
      role: 'user',
      text: trimmedMessage,
      createdAt,
    };

    setMessagesByThreadId((current) => ({
      ...current,
      [resolvedThread.id]: [...(current[resolvedThread.id] ?? []), optimisticUserMessage],
    }));
    setThreadErrors((current) => ({
      ...current,
      [resolvedThread.id]: null,
    }));
    setInputValue('');
    setIsSending(true);
    setLoadingLabel(
      assistantRole === 'admin'
        ? 'Checking marketplace tools...'
        : 'Checking your marketplace tools...'
    );
    setActiveThreadId(resolvedThread.id);
    setIsOpen(true);

    const response = await sendAssistantMessageRequest(token, {
      threadId: resolvedThread.id,
      message: trimmedMessage,
      roleContext: currentRoleContext,
      currentPageContext,
      selectedEntityContext,
    });

    const sendResult = response.data;

    if (response.error || !sendResult) {
      const errorMessage = response.error || 'The assistant could not respond right now.';

      setThreadErrors((current) => ({
        ...current,
        [resolvedThread.id]: errorMessage,
      }));

      await Promise.all([
        loadThreadMessages(resolvedThread.id, true),
        refreshThreadList(resolvedThread.id),
      ]);

      setIsSending(false);
      return;
    }

    const assistantMessage = mapPersistedMessage(sendResult.assistantMessage);
    const userMessage = mapPersistedMessage(sendResult.userMessage);

    setMessagesByThreadId((current) => {
      const existingMessages = current[resolvedThread.id] ?? [];
      const withoutOptimistic = existingMessages.filter((message) => message.id !== optimisticMessageId);

      return {
        ...current,
        [resolvedThread.id]: [...withoutOptimistic, userMessage, assistantMessage],
      };
    });
    setThreads((current) => upsertThread(current, sendResult.thread));
    setThreadErrors((current) => ({
      ...current,
      [resolvedThread.id]: null,
    }));
    executeAssistantAction(sendResult.response);
    setIsSending(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage(inputValue);
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close assistant"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className={styles.root}>
        <button
          type="button"
          className={styles.launcher}
          onClick={() => setIsOpen(true)}
          aria-label="Open marketplace assistant"
        >
          <span className={styles.launcherGlow} />
          <span className={styles.launcherIcon}>
            <SparkIcon />
          </span>
          <span className={styles.launcherLabel}>Assistant</span>
        </button>

        <aside className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`} aria-hidden={!isOpen}>
          <header className={styles.header}>
            <div>
              <p className={styles.headerEyebrow}>
                {assistantRole === 'admin' ? 'Admin tools' : 'Member tools'}
              </p>
              <h2 className={styles.headerTitle}>Marketplace Assistant</h2>
              <p className={styles.headerSubtext}>{currentPageContext.title}</p>
            </div>

            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
            >
              <CloseIcon />
            </button>
          </header>

          <section className={styles.sessionBar} aria-label="Assistant chats">
            <button
              type="button"
              className={styles.newChatButton}
              onClick={() => void handleCreateNewChat()}
              disabled={isSending || isThreadActionBusy}
            >
              <PlusIcon />
              <span>New chat</span>
            </button>

            <div className={styles.sessionList}>
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                const isBusy = threadActionId === thread.id;

                return (
                  <article
                    key={thread.id}
                    className={`${styles.sessionCard} ${
                      isActive ? styles.sessionCardActive : ''
                    }`}
                  >
                    <button
                      type="button"
                      className={styles.sessionButton}
                      onClick={() => setActiveThreadId(thread.id)}
                      disabled={isSending || isBusy}
                    >
                      <div className={styles.sessionTopRow}>
                        <span className={styles.sessionTitle}>{thread.title}</span>
                        <span className={styles.sessionTime}>
                          {formatThreadTimestamp(thread.lastMessageAt ?? thread.updatedAt)}
                        </span>
                      </div>
                      <span className={styles.sessionMeta}>
                        {formatRoleContext(thread.roleContext)} · {formatMessageCount(thread.messageCount)}
                      </span>
                      <span className={styles.sessionStatus}>{formatThreadStatus(thread.status)}</span>
                    </button>

                    <div className={styles.sessionActions}>
                      <button
                        type="button"
                        className={styles.sessionActionButton}
                        onClick={() => void handleArchiveThread(thread.id)}
                        disabled={isSending || isBusy}
                        aria-label={`Archive ${thread.title}`}
                        title="Archive chat"
                      >
                        <ArchiveIcon />
                      </button>
                      <button
                        type="button"
                        className={styles.sessionActionButton}
                        onClick={() => void handleDeleteThread(thread.id)}
                        disabled={isSending || isBusy}
                        aria-label={`Delete ${thread.title}`}
                        title="Delete chat"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {currentThread && (
            <section className={styles.threadStateBar} aria-label="Current thread state">
              <div className={styles.threadStatePills}>
                <span className={styles.threadStatePill}>{formatThreadStatus(currentThread.status)}</span>
                <span className={styles.threadStatePillMuted}>
                  {formatRoleContext(currentThread.roleContext)}
                </span>
              </div>
              <p className={styles.threadStateText}>{buildThreadStateLabel(currentThread)}</p>
            </section>
          )}

          <section className={styles.suggestionBar} aria-label="Quick actions">
            {suggestedActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={styles.suggestionChip}
                onClick={() => void submitMessage(action.message)}
                disabled={isSending || isThreadActionBusy}
              >
                {action.label}
              </button>
            ))}
          </section>

          <div className={styles.messages}>
            {(threadsLoading || messagesLoading) && !currentMessages.length && (
              <article className={`${styles.message} ${styles.assistantMessage}`}>
                <div className={`${styles.messageBubble} ${styles.loadingBubble}`}>
                  <Spinner size={18} className="text-navy-800" />
                  <span>{threadsLoading ? 'Loading your chats...' : 'Loading this conversation...'}</span>
                </div>
              </article>
            )}

            {!threadsLoading && !currentThread && !threadListError && (
              <section className={styles.welcomeCard}>
                <p className={styles.welcomeEyebrow}>Persistent assistant</p>
                <h3 className={styles.welcomeTitle}>
                  {assistantRole === 'admin'
                    ? 'Start a chat for marketplace analytics and moderation tasks.'
                    : 'Start a chat for purchases, selling help, reporting, or navigation.'}
                </h3>
                <p className={styles.welcomeText}>
                  Your assistant chats are now saved to the database, so you can reopen them later
                  and continue from the same state.
                </p>
              </section>
            )}

            {!threadsLoading && !currentMessages.length && currentThread && !currentThreadError && !messagesLoading && (
              <section className={styles.welcomeCard}>
                <p className={styles.welcomeEyebrow}>Thread ready</p>
                <h3 className={styles.welcomeTitle}>
                  {currentThread.title === NEW_CHAT_TITLE
                    ? 'Ask anything to begin this saved conversation.'
                    : `Continue "${currentThread.title}".`}
                </h3>
                <p className={styles.welcomeText}>
                  This thread is tied to your account, so you can safely leave and come back to it later.
                </p>
              </section>
            )}

            {currentMessages.map((message) => (
              <article
                key={message.id}
                className={`${styles.message} ${
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage
                }`}
              >
                <div className={styles.messageBubble}>
                  {message.role === 'user' ? (
                    <p className={styles.messageText}>{message.text}</p>
                  ) : (
                    <>
                      {message.response?.blocks.map((block, index) => {
                        if (block.type === 'text') {
                          return (
                            <p key={`${message.id}-text-${index}`} className={styles.messageText}>
                              {block.text}
                            </p>
                          );
                        }

                        if (block.type === 'stat_cards') {
                          return (
                            <div key={`${message.id}-stats-${index}`} className={styles.statsGrid}>
                              {block.items.map((item) => (
                                <div key={item.id} className={styles.statCard}>
                                  <span
                                    className={`${styles.statTone} ${
                                      styles[
                                        `tone${
                                          item.tone === 'positive'
                                            ? 'Positive'
                                            : item.tone === 'warning'
                                              ? 'Warning'
                                              : 'Neutral'
                                        }`
                                      ]
                                    }`}
                                  />
                                  <p className={styles.statLabel}>{item.label}</p>
                                  <p className={styles.statValue}>{item.value}</p>
                                  {item.description && (
                                    <p className={styles.statDescription}>{item.description}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        }

                        if (block.type === 'order_cards') {
                          return (
                            <div key={`${message.id}-orders-${index}`} className={styles.cardStack}>
                              {block.items.map((item) => (
                                <div key={item.id} className={styles.recordCard}>
                                  <div className={styles.recordHeader}>
                                    <div>
                                      <p className={styles.recordTitle}>{item.title}</p>
                                      <p className={styles.recordStatus}>{item.statusLabel}</p>
                                    </div>
                                    <p className={styles.recordPrice}>{item.price}</p>
                                  </div>
                                  <div className={styles.recordMeta}>
                                    <span>{item.priceLabel}</span>
                                    <span>
                                      {item.counterpartyLabel}: {item.counterpartyName}
                                    </span>
                                    <span>
                                      {item.dateLabel}: {item.date}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        if (block.type === 'listing_cards') {
                          return (
                            <div key={`${message.id}-listings-${index}`} className={styles.cardStack}>
                              {block.items.map((item) => (
                                <div key={item.id} className={styles.recordCard}>
                                  <div className={styles.recordHeader}>
                                    <div>
                                      <p className={styles.recordTitle}>{item.title}</p>
                                      <p className={styles.recordStatus}>{item.statusLabel}</p>
                                    </div>
                                    <p className={styles.recordPrice}>{item.price}</p>
                                  </div>
                                  {item.subtitle && (
                                    <p className={styles.recordSubtitle}>{item.subtitle}</p>
                                  )}
                                  <div className={styles.recordMeta}>
                                    {item.meta.map((metaItem) => (
                                      <span key={`${item.id}-${metaItem}`}>{metaItem}</span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        if (block.type === 'report_draft_card') {
                          return (
                            <div key={`${message.id}-report-${index}`} className={styles.reportCard}>
                              <p className={styles.reportLabel}>
                                {block.draft.submitted ? 'Report submitted' : 'Report draft'}
                              </p>
                              <h4 className={styles.reportTitle}>
                                {block.draft.listingTitle || 'Listing needed'}
                              </h4>
                              <div className={styles.reportMeta}>
                                <span>{block.draft.reasonLabel || 'Reason needed'}</span>
                                <span>
                                  {block.draft.readyToSubmit
                                    ? 'Ready to submit'
                                    : `${block.draft.missingFields.length} step(s) left`}
                                </span>
                              </div>
                              <p className={styles.reportDetails}>
                                {block.draft.details ||
                                  'Add a few concrete details about what happened.'}
                              </p>
                              <p className={styles.reportGuidance}>{block.draft.guidance}</p>
                              <p className={styles.reportSafety}>{block.draft.safetyNote}</p>
                            </div>
                          );
                        }

                        if (block.type === 'quick_actions') {
                          return (
                            <div key={`${message.id}-actions-${index}`} className={styles.inlineActions}>
                              {block.items.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={styles.inlineActionButton}
                                  onClick={() => void submitMessage(item.message)}
                                  disabled={isSending || isThreadActionBusy}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          );
                        }

                        if (block.type === 'confirmation_prompt') {
                          const cancelMessage = block.cancelMessage;

                          return (
                            <div key={`${message.id}-confirm-${index}`} className={styles.confirmationCard}>
                              <p className={styles.confirmationPrompt}>{block.prompt}</p>
                              <div className={styles.confirmationActions}>
                                <button
                                  type="button"
                                  className={styles.confirmButton}
                                  onClick={() => void submitMessage(block.confirmMessage)}
                                  disabled={isSending || isThreadActionBusy}
                                >
                                  {block.confirmLabel}
                                </button>
                                {cancelMessage && (
                                  <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={() => void submitMessage(cancelMessage)}
                                    disabled={isSending || isThreadActionBusy}
                                  >
                                    {block.cancelLabel || 'Cancel'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })}

                      {message.response?.quickReplies.length ? (
                        <div className={styles.inlineActions}>
                          {message.response.quickReplies.map((item) => (
                            <button
                              key={`${message.id}-reply-${item.id}`}
                              type="button"
                              className={styles.inlineActionButton}
                              onClick={() => void submitMessage(item.message)}
                              disabled={isSending || isThreadActionBusy}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </article>
            ))}

            {isSending && (
              <article className={`${styles.message} ${styles.assistantMessage}`}>
                <div className={`${styles.messageBubble} ${styles.loadingBubble}`}>
                  <Spinner size={18} className="text-navy-800" />
                  <span>{loadingLabel}</span>
                </div>
              </article>
            )}

            {(currentThreadError || threadListError) && (
              <div className={styles.errorState}>
                <p>{currentThreadError || threadListError}</p>
                <button
                  type="button"
                  className={styles.errorAction}
                  onClick={() => void handleCreateNewChat()}
                  disabled={isSending || isThreadActionBusy}
                >
                  Start new chat
                </button>
              </div>
            )}

            <div ref={scrollAnchorRef} />
          </div>

          <form className={styles.inputBar} onSubmit={handleSubmit}>
            <label className={styles.inputField}>
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={
                  assistantRole === 'admin'
                    ? 'Ask for sales today, active listings, pending reports, or top categories...'
                    : 'Ask for purchases, sold items, report help, or listing guidance...'
                }
                rows={1}
                disabled={isSending || isThreadActionBusy}
              />
            </label>
            <button
              type="submit"
              className={styles.sendButton}
              disabled={isSending || isThreadActionBusy || !inputValue.trim()}
              aria-label="Send assistant message"
            >
              <SendIcon />
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
