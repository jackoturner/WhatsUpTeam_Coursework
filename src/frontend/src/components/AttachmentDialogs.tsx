import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Button from './Button';
import type { ChatConversation, MessageAttachment } from '../types/api';
import styles from './attachmentDialogs.module.css';

interface AttachmentPreviewDialogProps {
  attachment: MessageAttachment | null;
  onClose(): void;
}

export function AttachmentPreviewDialog({ attachment, onClose }: AttachmentPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (attachment !== null && dialog !== null && !dialog.open) dialog.showModal();
  }, [attachment]);

  if (attachment === null) return null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="attachment-preview-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <div>
          <h2 id="attachment-preview-title">Preview attachment</h2>
          <p>{attachment.filename} · {attachment.is_confidential ? 'Confidential · preview only' : 'Non-confidential'}</p>
        </div>
        <button type="button" className={styles.close} aria-label="Close preview" onClick={onClose}>×</button>
      </header>
      {attachment.is_confidential && (
        <p className={styles.previewNotice}>
          Confidential files cannot be downloaded in the app. A preview cannot prevent screenshots or all browser-level copying.
        </p>
      )}
      <div className={styles.preview}>
        {attachment.content_type.startsWith('image/') ? (
          <img src={attachment.preview_url} alt={attachment.filename} />
        ) : (
          <iframe
            src={attachment.preview_url}
            title={`Preview of ${attachment.filename}`}
            sandbox="allow-scripts"
          />
        )}
      </div>
    </dialog>
  );
}

interface ReshareAttachmentDialogProps {
  attachment: MessageAttachment | null;
  sourceConversationId: number;
  conversations: ChatConversation[];
  error: string | null;
  onClose(): void;
  onShare(targetConversationId: number): Promise<boolean>;
}

export function ReshareAttachmentDialog({
  attachment,
  sourceConversationId,
  conversations,
  error,
  onClose,
  onShare,
}: ReshareAttachmentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [targetConversationId, setTargetConversationId] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (attachment !== null && dialog !== null && !dialog.open) dialog.showModal();
    if (attachment === null) setTargetConversationId('');
  }, [attachment]);

  if (attachment === null) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sharing || targetConversationId === '') return;
    setSharing(true);
    try {
      if (await onShare(Number(targetConversationId))) onClose();
    } finally {
      setSharing(false);
    }
  }

  const targets = conversations.filter((conversation) => conversation.id !== sourceConversationId);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="attachment-share-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!sharing) onClose();
      }}
    >
      <header className={styles.header}>
        <div>
          <h2 id="attachment-share-title">Share within your organisation</h2>
          <p>{attachment.filename}</p>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Close sharing dialog"
          disabled={sharing}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <p>
          The attachment classification is preserved. Only conversations you belong to in this organisation are available.
        </p>
        <label>
          <span>Share with</span>
          <select
            value={targetConversationId}
            onChange={(event) => setTargetConversationId(event.target.value)}
            disabled={sharing || targets.length === 0}
          >
            <option value="">Choose a conversation</option>
            {targets.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.name}</option>
            ))}
          </select>
        </label>
        {targets.length === 0 && <p>You have no other conversations to share with.</p>}
        {error !== null && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <Button type="button" variant="ghost" disabled={sharing} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={sharing || targetConversationId === ''}>
            {sharing ? 'Sharing…' : 'Share attachment'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
