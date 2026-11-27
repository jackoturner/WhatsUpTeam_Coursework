import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import Button from '../../../components/Button';
import type { ChatConversation } from '../../../types/api';
import styles from './FilesScreen.module.css';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface UploadAttachmentDialogProps {
  conversations: ChatConversation[];
  onClose(): void;
  onUpload(conversationId: number, file: File, confidential: boolean): Promise<boolean>;
  open: boolean;
  uploading: boolean;
  uploadError: string | null;
}

export default function UploadAttachmentDialog({
  conversations,
  onClose,
  onUpload,
  open,
  uploading,
  uploadError,
}: UploadAttachmentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [conversationId, setConversationId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function chooseFile(selected: File | undefined) {
    setProblem(null);
    setFile(selected ?? null);
    if (selected !== undefined && selected.size > MAX_FILE_BYTES) {
      setProblem('This file exceeds the 10 MB upload limit.');
    }
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    chooseFile(event.dataTransfer.files[0]);
  }

  async function submit() {
    if (conversationId === '' || file === null || classification === '' || file.size > MAX_FILE_BYTES) return;
    const uploaded = await onUpload(Number(conversationId), file, classification === 'confidential');
    if (uploaded) {
      setFile(null);
      setClassification('');
      setConversationId('');
      setProblem(null);
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="upload-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!uploading) onClose();
      }}
      onClose={onClose}
    >
      <div className={styles.dialogHeader}>
        <div>
          <h2 id="upload-dialog-title">Upload attachment</h2>
          <p>Share a file with a conversation you belong to.</p>
        </div>
        <button type="button" className={styles.dialogClose} aria-label="Close upload dialog" onClick={onClose}>×</button>
      </div>
      <label className={styles.dropZone} onDragOver={(event) => event.preventDefault()} onDrop={dropFile}>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
          onChange={(event) => chooseFile(event.target.files?.[0])}
          disabled={uploading}
        />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 16V4m0 0L7 9m5-5 5 5" />
          <path d="M5 14v5h14v-5" />
        </svg>
        <strong>{file?.name ?? 'Drop a file here or browse'}</strong>
        <span>{file === null ? 'PDF, PNG, JPEG, WebP or TXT · Up to 10 MB' : `${file.size.toLocaleString()} bytes · ${file.type || 'Type checked on upload'}`}</span>
      </label>
      <div className={styles.dialogFields}>
        <label>
          <span>Share with</span>
          <select value={conversationId} onChange={(event) => setConversationId(event.target.value)} disabled={uploading}>
            <option value="">Choose a conversation</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.name}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Classification</legend>
          <label><input type="radio" name="file-classification" value="confidential" checked={classification === 'confidential'} onChange={() => setClassification('confidential')} disabled={uploading} /> Confidential</label>
          <label><input type="radio" name="file-classification" value="non-confidential" checked={classification === 'non-confidential'} onChange={() => setClassification('non-confidential')} disabled={uploading} /> Non-confidential</label>
        </fieldset>
      </div>
      {problem !== null && <p className={styles.dialogError} role="alert">{problem}</p>}
      {uploadError !== null && <p className={styles.dialogError} role="alert">{uploadError}</p>}
      <div className={styles.dialogActions}>
        <Button variant="ghost" disabled={uploading} onClick={onClose}>Cancel</Button>
        <Button
          disabled={uploading || file === null || file.size > MAX_FILE_BYTES || conversationId === '' || classification === ''}
          onClick={() => void submit()}
        >
          {uploading ? 'Uploading…' : 'Upload attachment'}
        </Button>
      </div>
    </dialog>
  );
}
