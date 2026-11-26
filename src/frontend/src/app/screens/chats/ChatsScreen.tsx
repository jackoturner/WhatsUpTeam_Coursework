import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Button from '../../../components/Button';
import Link from '../../../components/Link';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { CHAT_MESSAGE_MAX_LENGTH } from '../../../types/api';
import type { ChatConversation, ChatMessage } from '../../../types/api';
import { formatDateTime } from '../../../utils/format';
import styles from './ChatsScreen.module.css';

type Load<T> = { status: 'loading' } | { status: 'ready'; items: T[] } | { status: 'error'; text: string };

function conversationLabel(conversation: ChatConversation): string {
  return conversation.kind === 'group' ? `#${conversation.name}` : conversation.name;
}

export default function ChatsScreen() {
  const api = useApi();
  const { handleError } = useAuth();
  const [conversations, setConversations] = useState<Load<ChatConversation>>({ status: 'loading' });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Load<ChatMessage>>({ status: 'loading' });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const threadRef = useRef<HTMLUListElement>(null);
  const inputId = useId();

  useEffect(() => {
    let active = true;
    api.chats
      .listConversations()
      .then((items) => {
        if (!active) return;
        setConversations({ status: 'ready', items });
        setActiveId(items[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (active) setConversations({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError]);

  useEffect(() => {
    if (activeId === null) return;
    let active = true;
    api.chats
      .listMessages(activeId)
      .then((items) => {
        if (active) setMessages({ status: 'ready', items });
      })
      .catch((error: unknown) => {
        if (active) setMessages({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError, activeId]);

  // Keep the newest message in view.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread !== null) thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  function selectConversation(conversationId: number) {
    if (conversationId === activeId || sending) return;
    setActiveId(conversationId);
    setMessages({ status: 'loading' });
    setProblem(null);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (body === '' || activeId === null || sending) return;
    setSending(true);
    setProblem(null);
    try {
      const sent = await api.chats.send(activeId, body);
      setMessages((previous) =>
        previous.status === 'ready' ? { status: 'ready', items: [...previous.items, sent] } : previous,
      );
      setDraft('');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setSending(false);
    }
  }

  if (conversations.status === 'loading') {
    return <p aria-busy="true">Loading conversations…</p>;
  }
  if (conversations.status === 'error') {
    return (
      <p className={styles.notice} role="alert">
        {conversations.text}
      </p>
    );
  }
  if (conversations.items.length === 0) {
    return <p className={styles.info}>You are not in any conversations yet.</p>;
  }

  const active = conversations.items.find((conversation) => conversation.id === activeId);

  return (
    <div className={styles.chat}>
      <nav className={styles.list} aria-label="Conversations">
        <ul className={styles.conversations}>
          {conversations.items.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={styles.conversation}
                aria-current={conversation.id === activeId ? 'true' : undefined}
                disabled={sending}
                onClick={() => selectConversation(conversation.id)}
              >
                {conversationLabel(conversation)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className={styles.thread} aria-label={active ? `Conversation ${conversationLabel(active)}` : 'Conversation'}>
        <h2 className={styles.threadTitle}>{active ? conversationLabel(active) : ''}</h2>

        {messages.status === 'loading' && <p className={styles.muted} aria-busy="true">Loading messages…</p>}
        {messages.status === 'error' && (
          <p className={styles.notice} role="alert">
            {messages.text}
          </p>
        )}
        {messages.status === 'ready' && messages.items.length === 0 && (
          <p className={styles.muted}>No messages yet. Say hello.</p>
        )}
        {messages.status === 'ready' && messages.items.length > 0 && (
          <ul className={styles.messages} ref={threadRef} aria-live="polite">
            {messages.items.map((message) => (
              <li key={message.id} className={message.is_mine ? styles.mine : styles.theirs}>
                <p className={styles.meta}>
                  <span className={styles.author}>{message.author_name}</span>
                  <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
                </p>
                <p className={styles.body}>{message.body}</p>
                {!message.is_mine && (
                  <Link to={`/reporting?message=${message.id}`} className={styles.report}>
                    Report message
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        {problem !== null && (
          <p className={styles.notice} role="alert">
            {problem}
          </p>
        )}

        <form className={styles.composer} onSubmit={(event) => void send(event)} aria-label="Send a message">
          <label htmlFor={inputId} className="visually-hidden">
            Message
          </label>
          <input
            id={inputId}
            className={styles.input}
            type="text"
            autoComplete="off"
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            placeholder="Type a message"
            value={draft}
            disabled={activeId === null || messages.status !== 'ready'}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={sending || draft.trim() === '' || messages.status !== 'ready'}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </form>
      </section>
    </div>
  );
}
