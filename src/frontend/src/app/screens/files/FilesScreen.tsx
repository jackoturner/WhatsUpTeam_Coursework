import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Button from '../../../components/Button';
import { AttachmentPreviewDialog, ReshareAttachmentDialog } from '../../../components/AttachmentDialogs';
import PageHeader from '../../../components/PageHeader';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import type { ChatConversation, MessageAttachment } from '../../../types/api';
import { formatDateTime } from '../../../utils/format';
import UploadAttachmentDialog from './UploadAttachmentDialog';
import styles from './FilesScreen.module.css';

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; items: T[] }
  | { status: 'error'; text: string };
type DateFilter = 'all' | '7' | '30' | '90';

interface LibraryFile extends MessageAttachment {
  conversation_id: number;
  conversation_name: string;
}

function extension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(filename: string): string {
  const suffix = extension(filename);
  if (suffix === 'pdf') return 'PDF';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(suffix)) return 'IMG';
  if (['xlsx', 'xls', 'csv'].includes(suffix)) return 'XLS';
  if (['docx', 'doc', 'txt'].includes(suffix)) return 'DOC';
  return 'FILE';
}

export default function FilesScreen() {
  const api = useApi();
  const { handleError } = useAuth();
  const [files, setFiles] = useState<Load<LibraryFile>>({ status: 'loading' });
  const [conversations, setConversations] = useState<Load<ChatConversation>>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [classification, setClassification] = useState('all');
  const [conversationFilter, setConversationFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewingAttachment, setPreviewingAttachment] = useState<MessageAttachment | null>(null);
  const [resharingFile, setResharingFile] = useState<LibraryFile | null>(null);
  const [shareProblem, setShareProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadLibrary() {
      try {
        const items = await api.chats.listConversations();
        if (!active) return;
        setConversations({ status: 'ready', items });
        const fileLists = await Promise.all(items.map(async (conversation) => ({
          conversation,
          files: await api.chats.listAttachments(conversation.id),
        })));
        if (!active) return;
        const libraryFiles = fileLists.flatMap(({ conversation, files: attachments }) =>
          attachments.map((attachment) => ({
            ...attachment,
            conversation_id: conversation.id,
            conversation_name: conversation.name,
          })),
        );
        setFiles({ status: 'ready', items: libraryFiles });
      } catch (error) {
        if (active) setFiles({ status: 'error', text: handleError(error) });
      }
    }
    void loadLibrary();
    return () => {
      active = false;
    };
  }, [api, handleError]);

  const visibleFiles = useMemo(() => {
    if (files.status !== 'ready') return [];
    const needle = query.trim().toLowerCase();
    const cutoff = dateFilter === 'all'
      ? null
      : Date.now() - Number(dateFilter) * 24 * 60 * 60 * 1000;
    return files.items.filter((file) => {
      const matchesText = needle === ''
        || file.filename.toLowerCase().includes(needle)
        || file.conversation_name.toLowerCase().includes(needle);
      const matchesClassification = classification === 'all'
        || (classification === 'confidential' ? file.is_confidential : !file.is_confidential);
      const matchesConversation = conversationFilter === 'all'
        || file.conversation_id === Number(conversationFilter);
      const date = Date.parse(file.created_at);
      const matchesDate = cutoff === null || (Number.isFinite(date) && date >= cutoff);
      return matchesText && matchesClassification && matchesConversation && matchesDate;
    });
  }, [classification, conversationFilter, dateFilter, files, query]);

  async function uploadFile(conversationId: number, file: File, confidential: boolean): Promise<boolean> {
    setUploading(true);
    setProblem(null);
    setNotice(null);
    try {
      const uploadedMessage = await api.chats.uploadAttachment(conversationId, file, confidential);
      const uploaded = uploadedMessage.attachments[0];
      if (uploaded === undefined) throw new TypeError('The upload response did not include its attachment.');
      const conversation = conversations.status === 'ready'
        ? conversations.items.find((item) => item.id === conversationId)
        : undefined;
      if (conversation !== undefined) {
        setFiles((current) => current.status === 'ready'
          ? {
            status: 'ready',
            items: [...current.items, {
              ...uploaded,
              conversation_id: conversation.id,
              conversation_name: conversation.name,
            }],
          }
          : current);
      }
      setNotice('Attachment sent in the conversation and added to the file library.');
      return true;
    } catch (error) {
      setProblem(handleError(error));
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function reshareFile(file: LibraryFile, targetConversationId: number): Promise<boolean> {
    setShareProblem(null);
    setProblem(null);
    setNotice(null);
    try {
      await api.chats.reshareAttachment(file.conversation_id, file.id, targetConversationId);
      const target = conversations.status === 'ready'
        ? conversations.items.find((conversation) => conversation.id === targetConversationId)
        : undefined;
      setNotice(`Attachment shared with ${target?.name ?? 'the selected conversation'}.`);
      return true;
    } catch (error) {
      setShareProblem(handleError(error));
      return false;
    }
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageTop}>
        <PageHeader
          title="File library"
          description="Manage files shared in conversations you are authorised to access."
          icon={<><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z" /><path d="M13 3v7h7M8 14h8M8 17h8" /></>}
        />
        <Button onClick={() => setDialogOpen(true)}>Upload file</Button>
      </div>
      {problem !== null && <p className={styles.error} role="alert">{problem}</p>}
      {notice !== null && <p className={styles.success} role="status">{notice}</p>}

      <section className={styles.card} aria-label="Files and attachments">
        <form className={styles.filters} onSubmit={submitFilters}>
          <label className="visually-hidden" htmlFor="file-search">Search files</label>
          <input
            id="file-search"
            className={styles.search}
            type="search"
            placeholder="Search files or conversations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="visually-hidden" htmlFor="file-classification">Classification</label>
          <select id="file-classification" value={classification} onChange={(event) => setClassification(event.target.value)}>
            <option value="all">All classifications</option>
            <option value="confidential">Confidential</option>
            <option value="non-confidential">Non-confidential</option>
          </select>
          <label className="visually-hidden" htmlFor="file-conversation">Conversation</label>
          <select
            id="file-conversation"
            value={conversationFilter}
            onChange={(event) => setConversationFilter(event.target.value)}
            disabled={conversations.status !== 'ready'}
          >
            <option value="all">All conversations</option>
            {conversations.status === 'ready' && conversations.items.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.name}</option>
            ))}
          </select>
          <label className="visually-hidden" htmlFor="file-date">Date uploaded</label>
          <select id="file-date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}>
            <option value="all">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </form>

        {files.status === 'loading' && <p className={styles.state} aria-busy="true">Loading shared files…</p>}
        {files.status === 'error' && <p className={styles.error} role="alert">{files.text}</p>}
        {files.status === 'ready' && visibleFiles.length === 0 && (
          <p className={styles.empty}>
            {files.items.length === 0 ? 'No shared files are available in your conversations.' : 'No files match these filters.'}
          </p>
        )}
        {files.status === 'ready' && visibleFiles.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">File name</th>
                  <th scope="col">Shared in</th>
                  <th scope="col">Classification</th>
                  <th scope="col">Size</th>
                  <th scope="col">Date uploaded</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <span className={styles.fileName}>
                        <span className={styles.fileKind} aria-label={`${fileKind(file.filename)} file`}>{fileKind(file.filename)}</span>
                        <span>{file.filename}</span>
                      </span>
                    </td>
                    <td>{file.conversation_name}</td>
                    <td>
                      <span className={file.is_confidential ? styles.confidential : styles.nonConfidential}>
                        {file.is_confidential && (
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                            <rect x="2.5" y="7" width="11" height="7" rx="1.5" />
                            <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                          </svg>
                        )}
                        {file.is_confidential ? 'Confidential' : 'Non-confidential'}
                      </span>
                    </td>
                    <td className={styles.nowrap}>{fileSize(file.size_bytes)}</td>
                    <td className={styles.nowrap}>{formatDateTime(file.created_at)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <Button variant="ghost" onClick={() => setPreviewingAttachment(file)}>Preview</Button>
                        {file.can_download && file.download_url !== null && (
                          <a className={styles.download} href={file.download_url}>Download</a>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setShareProblem(null);
                            setResharingFile(file);
                          }}
                        >
                          Share
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UploadAttachmentDialog
        open={dialogOpen}
        uploading={uploading}
        conversations={conversations.status === 'ready' ? conversations.items : []}
        onClose={() => setDialogOpen(false)}
        onUpload={uploadFile}
        uploadError={problem}
      />
      <AttachmentPreviewDialog
        attachment={previewingAttachment}
        onClose={() => setPreviewingAttachment(null)}
      />
      {conversations.status === 'ready' && resharingFile !== null && (
        <ReshareAttachmentDialog
          attachment={resharingFile}
          sourceConversationId={resharingFile.conversation_id}
          conversations={conversations.items}
          error={shareProblem}
          onClose={() => setResharingFile(null)}
          onShare={(targetConversationId) => reshareFile(resharingFile, targetConversationId)}
        />
      )}
    </div>
  );
}
