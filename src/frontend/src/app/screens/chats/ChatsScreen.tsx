import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, FormEvent } from 'react';
import Button from '../../../components/Button';
import { AttachmentPreviewDialog, ReshareAttachmentDialog } from '../../../components/AttachmentDialogs';
import Link from '../../../components/Link';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { useLocation } from '../../../hooks/useRoute';
import { CHAT_MESSAGE_MAX_LENGTH } from '../../../types/api';
import type { ChatConversation, ChatGroup, ChatMessage, MessageAttachment } from '../../../types/api';
import { formatDateTime } from '../../../utils/format';
import styles from './ChatsScreen.module.css';

type Load<T> = { status: 'loading' } | { status: 'ready'; items: T[] } | { status: 'error'; text: string };

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0] ?? '').slice(0, 2).join('').toUpperCase();
}

function conversationLabel(conversation: ChatConversation): string {
  return conversation.name;
}

export default function ChatsScreen({ conversationId }: { conversationId?: string }) {
  const api = useApi();
  const { search } = useLocation();
  const { handleError } = useAuth();
  const [conversations, setConversations] = useState<Load<ChatConversation>>({ status: 'loading' });
  const [groups, setGroups] = useState<Load<ChatGroup>>({ status: 'loading' });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Load<ChatMessage>>({ status: 'loading' });
  const [attachments, setAttachments] = useState<Load<MessageAttachment>>({ status: 'loading' });
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<'confidential' | 'non-confidential' | null>(null);
  const [sending, setSending] = useState(false);
  const [previewingAttachment, setPreviewingAttachment] = useState<MessageAttachment | null>(null);
  const [resharingAttachment, setResharingAttachment] = useState<MessageAttachment | null>(null);
  const [shareProblem, setShareProblem] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const threadRef = useRef<HTMLUListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const query = search.get('search')?.trim().toLowerCase() ?? '';
  const requestedId = conversationId ?? search.get('conversation');
  const requestedConversationId =
    requestedId !== null && requestedId !== undefined && /^\d{1,9}$/.test(requestedId)
      ? Number(requestedId)
      : null;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 761px)');
    function syncDetails(event: MediaQueryListEvent) {
      setDetailsOpen(event.matches);
    }
    mediaQuery.addEventListener('change', syncDetails);
    return () => mediaQuery.removeEventListener('change', syncDetails);
  }, []);

  useEffect(() => {
    let active = true;
    api.chats
      .listConversations()
      .then((items) => {
        if (!active) return;
        setConversations({ status: 'ready', items });
        const requested = items.find((item) => item.id === requestedConversationId);
        const searched = query === ''
          ? undefined
          : items.find((item) => conversationLabel(item).toLowerCase().includes(query));
        setActiveId(requested?.id ?? searched?.id ?? items[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (active) setConversations({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError, query, requestedConversationId]);

  useEffect(() => {
    let active = true;
    api.groups
      .list()
      .then((items) => {
        if (active) setGroups({ status: 'ready', items });
      })
      .catch((error: unknown) => {
        if (active) setGroups({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError]);

  useEffect(() => {
    if (activeId === null) {
      setMessages({ status: 'ready', items: [] });
      return;
    }
    let active = true;
    setMessages({ status: 'loading' });
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

  useEffect(() => {
    if (activeId === null) {
      setAttachments({ status: 'ready', items: [] });
      return;
    }
    let active = true;
    setAttachments({ status: 'loading' });
    api.chats
      .listAttachments(activeId)
      .then((items) => {
        if (active) setAttachments({ status: 'ready', items });
      })
      .catch((error: unknown) => {
        if (active) setAttachments({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError, activeId]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread !== null) thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  function selectConversation(id: number) {
    if (sending) return;
    if (id === activeId) {
      setMobileListOpen(false);
      return;
    }
    setActiveId(id);
    setMobileListOpen(false);
    setProblem(null);
  }

  async function send() {
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

  async function uploadFile() {
    if (
      activeId === null
      || file === null
      || classification === null
      || sending
      || messages.status !== 'ready'
    ) return;
    setSending(true);
    setProblem(null);
    try {
      const uploadedMessage = await api.chats.uploadAttachment(
        activeId,
        file,
        classification === 'confidential',
      );
      const uploaded = uploadedMessage.attachments[0];
      if (uploaded === undefined) throw new TypeError('The upload response did not include its attachment.');
      setMessages((previous) =>
        previous.status === 'ready'
          ? { status: 'ready', items: [...previous.items, uploadedMessage] }
          : { status: 'ready', items: [uploadedMessage] },
      );
      setAttachments((previous) =>
        previous.status === 'ready'
          ? { status: 'ready', items: [...previous.items, uploaded] }
          : { status: 'ready', items: [uploaded] },
      );
      setFile(null);
      setClassification(null);
      if (fileInputRef.current !== null) fileInputRef.current.value = '';
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setSending(false);
    }
  }

  async function reshareAttachment(
    sourceConversationId: number,
    attachment: MessageAttachment,
    targetConversationId: number,
  ): Promise<boolean> {
    setShareProblem(null);
    setShareNotice(null);
    try {
      await api.chats.reshareAttachment(sourceConversationId, attachment.id, targetConversationId);
      const target = conversations.status === 'ready'
        ? conversations.items.find((conversation) => conversation.id === targetConversationId)
        : undefined;
      setShareNotice(`Attachment shared with ${target?.name ?? 'the selected conversation'}.`);
      return true;
    } catch (error) {
      setShareProblem(handleError(error));
      return false;
    }
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  if (conversations.status === 'loading') {
    return <p className={styles.state} aria-busy="true">Loading conversations…</p>;
  }
  if (conversations.status === 'error') {
    return <p className={styles.notice} role="alert">{conversations.text}</p>;
  }
  if (conversations.items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h2>Your messages will appear here</h2>
        <p>Start a conversation with a colleague or open a group you belong to.</p>
        <Link to="/contacts" className={styles.startLink}>Find a colleague</Link>
      </div>
    );
  }

  const active = conversations.items.find((conversation) => conversation.id === activeId);
  const visibleConversations = conversations.items.filter((conversation) =>
    query === '' || conversationLabel(conversation).toLowerCase().includes(query),
  );
  const directConversations = visibleConversations.filter((conversation) => conversation.kind === 'direct');
  const groupConversations = visibleConversations.filter((conversation) => conversation.kind === 'group');
  const activeGroup = groups.status === 'ready'
    ? groups.items.find((group) => group.id === activeId)
    : undefined;

  function renderConversation(conversation: ChatConversation) {
    return (
      <li key={conversation.id}>
        <button
          type="button"
          className={styles.conversation}
          aria-current={conversation.id === activeId ? 'true' : undefined}
          disabled={sending}
          onClick={() => selectConversation(conversation.id)}
        >
          <span className={conversation.kind === 'group' ? styles.groupAvatar : styles.avatar} aria-hidden="true">
            {initials(conversationLabel(conversation))}
          </span>
          <span className={styles.conversationInfo}>
            <strong>{conversationLabel(conversation)}</strong>
            <small>{conversation.kind === 'group' ? 'Group conversation' : 'Direct conversation'}</small>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className={`${styles.chat} ${detailsOpen ? '' : styles.chatDetailsHidden}`}>
      <aside
        className={`${styles.list} ${mobileListOpen ? styles.mobileListOpen : ''}`}
        aria-label="Conversation list"
      >
        <div className={styles.listHeader}>
          <h1>Messages</h1>
          <Link to="/contacts" className={styles.newMessage}>New message</Link>
        </div>
        {query !== '' && (
          <p className={styles.searchSummary}>
            {visibleConversations.length} result{visibleConversations.length === 1 ? '' : 's'} for “{search.get('search')}”
          </p>
        )}
        {directConversations.length > 0 && (
          <section className={styles.conversationSection} aria-labelledby="direct-heading">
            <h2 id="direct-heading">Direct chats</h2>
            <ul className={styles.conversations}>{directConversations.map(renderConversation)}</ul>
          </section>
        )}
        {groupConversations.length > 0 && (
          <section className={styles.conversationSection} aria-labelledby="groups-heading">
            <h2 id="groups-heading">Groups</h2>
            <ul className={styles.conversations}>{groupConversations.map(renderConversation)}</ul>
          </section>
        )}
        {visibleConversations.length === 0 && (
          <p className={styles.noResults}>No conversations match your search.</p>
        )}
      </aside>

      <section
        className={`${styles.thread} ${mobileListOpen ? '' : styles.mobileThreadOpen}`}
        aria-label={active ? `Conversation ${conversationLabel(active)}` : 'Conversation'}
      >
        {active === undefined ? (
          <div className={styles.emptyThread}>
            <p>Select a conversation to view messages.</p>
          </div>
        ) : (
          <>
            <header className={styles.threadHeader}>
              <button
                type="button"
                className={styles.backToList}
                onClick={() => setMobileListOpen(true)}
              >
                Back to conversations
              </button>
              <span className={active.kind === 'group' ? styles.groupAvatar : styles.avatar} aria-hidden="true">
                {initials(conversationLabel(active))}
              </span>
              <div className={styles.threadHeading}>
                <h2>{conversationLabel(active)}</h2>
                <p>{activeGroup ? `${activeGroup.members.length} members` : 'Private conversation'}</p>
              </div>
              <Button
                variant="ghost"
                className={styles.detailsToggle}
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                {detailsOpen ? 'Hide details' : 'Details'}
              </Button>
            </header>

            {messages.status === 'loading' && <p className={styles.state} aria-busy="true">Loading messages…</p>}
            {messages.status === 'error' && <p className={styles.notice} role="alert">{messages.text}</p>}
            {messages.status === 'ready' && messages.items.length === 0 && (
              <p className={styles.emptyThread}>No messages yet. Send the first message.</p>
            )}
            {messages.status === 'ready' && messages.items.length > 0 && (
              <ul className={styles.messages} ref={threadRef} aria-live="polite">
                {messages.items.map((message) => (
                  <li key={message.id} className={message.is_mine ? styles.mine : styles.theirs}>
                    <span className={styles.messageAvatar} aria-hidden="true">{initials(message.author_name)}</span>
                    <div className={styles.messageContent}>
                      <p className={styles.meta}>
                        <span className={styles.author}>{message.author_name}</span>
                        <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
                      </p>
                      <p className={styles.body}>{message.body}</p>
                      {message.attachments.map((attachment) => (
                        <div className={styles.messageAttachment} key={attachment.id}>
                          <div>
                            <strong>{attachment.filename}</strong>
                            <span className={attachment.is_confidential ? styles.confidential : styles.nonConfidential}>
                              {attachment.is_confidential ? 'Confidential · preview only' : 'Non-confidential'}
                            </span>
                          </div>
                          <div className={styles.attachmentActions}>
                            <Button variant="ghost" onClick={() => setPreviewingAttachment(attachment)}>Preview</Button>
                            {attachment.can_download && attachment.download_url !== null && (
                              <a href={attachment.download_url} className={styles.downloadAttachment}>Download</a>
                            )}
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setShareProblem(null);
                                setResharingAttachment(attachment);
                              }}
                            >
                              Share internally
                            </Button>
                          </div>
                        </div>
                      ))}
                      {!message.is_mine && (
                        <Link to={`/reporting?message=${message.id}`} className={styles.report}>
                          Report message
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {problem !== null && <p className={styles.notice} role="alert">{problem}</p>}
            {shareNotice !== null && <p className={styles.success} role="status">{shareNotice}</p>}
            <div className={styles.composerArea}>
              {file !== null && (
                <div className={styles.fileSelection}>
                  <span>{file.name} · {Math.ceil(file.size / 1024)} KB</span>
                  <button
                    type="button"
                    aria-label="Remove selected file"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current !== null) fileInputRef.current.value = '';
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
              <form className={styles.composer} onSubmit={submitMessage} aria-label="Send a message">
                <label htmlFor={inputId} className="visually-hidden">Message</label>
                <textarea
                  id={inputId}
                  className={styles.input}
                  rows={1}
                  autoComplete="off"
                  maxLength={CHAT_MESSAGE_MAX_LENGTH}
                  placeholder={`Message ${conversationLabel(active)}…`}
                  value={draft}
                  disabled={activeId === null || messages.status !== 'ready'}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleMessageKeyDown}
                />
                <Button type="submit" className={styles.sendButton} disabled={sending || draft.trim() === '' || messages.status !== 'ready'}>
                  Send
                </Button>
              </form>
              <div className={styles.composerTools}>
                <label className={styles.attachButton}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="m8 12.5 6.7-6.7a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.2-8.2" />
                  </svg>
                  Attach file
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    disabled={sending || activeId === null}
                  />
                </label>
                <label className={styles.classificationLabel} htmlFor={`${inputId}-classification`}>File classification</label>
                <select
                  id={`${inputId}-classification`}
                  value={classification ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setClassification(value === '' ? null : value as 'confidential' | 'non-confidential');
                  }}
                  disabled={sending || file === null}
                >
                  <option value="">Choose classification</option>
                  <option value="confidential">Confidential</option>
                  <option value="non-confidential">Non-confidential</option>
                </select>
                <Button
                  variant="ghost"
                  className={styles.uploadButton}
                  disabled={sending || file === null || classification === null || messages.status !== 'ready'}
                  onClick={() => void uploadFile()}
                >
                  {sending ? 'Sending…' : 'Send attachment'}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {active !== undefined && (
        <aside
          className={`${styles.details} ${detailsOpen ? '' : styles.detailsHidden}`}
          aria-label="Conversation details"
        >
          <div className={styles.detailsHeader}>
            <h2>Conversation details</h2>
            <button type="button" aria-label="Close conversation details" onClick={() => setDetailsOpen(false)}>×</button>
          </div>
          <div className={styles.detailsIdentity}>
            <span className={active.kind === 'group' ? styles.detailGroupAvatar : styles.detailAvatar} aria-hidden="true">
              {initials(conversationLabel(active))}
            </span>
            <h3>{conversationLabel(active)}</h3>
            <p>{active.kind === 'group' ? 'Group conversation' : 'Direct conversation'}</p>
          </div>
          {activeGroup !== undefined && (
            <section className={styles.detailSection}>
              <div className={styles.sectionHeading}>
                <h3>Members ({activeGroup.members.length})</h3>
                {activeGroup.can_manage && <Link to="/groups">Manage</Link>}
              </div>
              <ul className={styles.memberList}>
                {activeGroup.members.slice(0, 7).map((member) => (
                  <li key={member.user_id}>
                    <span className={styles.memberAvatar} aria-hidden="true">{initials(member.display_name)}</span>
                    <span>{member.display_name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={styles.detailSection}>
            <h3>Shared files ({attachments.status === 'ready' ? attachments.items.length : '…'})</h3>
            {attachments.status === 'loading' && <p className={styles.detailMuted} aria-busy="true">Loading files…</p>}
            {attachments.status === 'error' && <p className={styles.notice} role="alert">{attachments.text}</p>}
            {attachments.status === 'ready' && attachments.items.length === 0 && (
              <p className={styles.detailMuted}>No shared files yet.</p>
            )}
            {attachments.status === 'ready' && attachments.items.length > 0 && (
              <ul className={styles.fileList}>
                {attachments.items.map((attachment) => (
                  <li key={attachment.id}>
                    <span className={styles.fileItemName}>
                      {attachment.filename}
                      {attachment.is_confidential && <span className={styles.confidential}>Confidential</span>}
                    </span>
                    <div className={styles.attachmentActions}>
                      <Button variant="ghost" onClick={() => setPreviewingAttachment(attachment)}>Preview</Button>
                      {attachment.can_download && attachment.download_url !== null && (
                        <a href={attachment.download_url} className={styles.downloadAttachment}>Download</a>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShareProblem(null);
                          setResharingAttachment(attachment);
                        }}
                      >
                        Share
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      )}
      <AttachmentPreviewDialog
        attachment={previewingAttachment}
        onClose={() => setPreviewingAttachment(null)}
      />
      {conversations.status === 'ready' && active !== undefined && resharingAttachment !== null && (
        <ReshareAttachmentDialog
          attachment={resharingAttachment}
          sourceConversationId={active.id}
          conversations={conversations.items}
          error={shareProblem}
          onClose={() => setResharingAttachment(null)}
          onShare={(targetConversationId) =>
            reshareAttachment(active.id, resharingAttachment, targetConversationId)}
        />
      )}
    </div>
  );
}
