import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import Button from '../../../components/Button';
import PageHeader from '../../../components/PageHeader';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { navigate } from '../../../hooks/useRoute';
import { REPORT_REASONS, REPORT_REASON_LABELS } from '../../../types/api';
import type { ReportableMessage, ReportReason } from '../../../types/api';
import { formatDateTime } from '../../../utils/format';
import styles from './ReportingScreen.module.css';

const DETAILS_MAX_LENGTH = 500;

type Content =
  | { status: 'loading' }
  | { status: 'ready'; message: ReportableMessage }
  | { status: 'error'; text: string };

/** Message ids come from the URL, so only plain positive integers are accepted. */
function parseMessageId(value: string | null): number | null {
  return value !== null && /^\d{1,9}$/.test(value) ? Number(value) : null;
}

function ReportedMessage({ message }: { message: ReportableMessage }) {
  return (
    <div className={styles.quote}>
      <div className={styles.quoteHead}>
        <span className={styles.avatar} aria-hidden="true">
          {message.author_name.slice(0, 2).toUpperCase()}
        </span>
        <span className={styles.author}>{message.author_name}</span>
        <span className={styles.muted}>{formatDateTime(message.created_at)}</span>
      </div>
      <p className={styles.quoteBody}>{message.body}</p>
    </div>
  );
}

export default function ReportingScreen({ search }: { search: URLSearchParams }) {
  const api = useApi();
  const { handleError } = useAuth();
  const messageId = parseMessageId(search.get('message'));
  const [content, setContent] = useState<Content>({ status: 'loading' });
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const detailsId = useId();

  useEffect(() => {
    if (messageId === null) return;
    let active = true;
    api.reports
      .reportable(messageId)
      .then((message) => {
        if (active) setContent({ status: 'ready', message });
      })
      .catch((error: unknown) => {
        if (active) setContent({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError, messageId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (content.status !== 'ready') return;
    if (reason === null) {
      setProblem('Choose a reason for the report.');
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      await api.reports.submit({ messageId: content.message.id, reason, details: details.trim() });
      setSent(true);
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setSending(false);
    }
  }

  if (messageId === null) {
    return (
      <p className={styles.info} role="status">
        Choose a message to report. Reporting starts from a message in a conversation.
      </p>
    );
  }
  if (content.status === 'loading') {
    return <p aria-busy="true">Loading the message…</p>;
  }
  if (content.status === 'error') {
    return (
      <p className={styles.notice} role="alert">
        {content.text}
      </p>
    );
  }
  if (sent) {
    return (
      <div className={styles.sent} role="status">
        <h2>Report sent</h2>
        <p>Your administrators will review the report. You will be told once the review is complete.</p>
        <Button variant="ghost" onClick={() => navigate('/chats')}>
          Back to chats
        </Button>
      </div>
    );
  }

  const { message } = content;
  return (
    <>
      <PageHeader
        title="Report suspicious content"
        description="Send suspicious messages, files, or links to your organisation's administrators for review."
        icon={<path d="M5 21V4M5 4h11l-2 4 2 4H5" />}
      />
      <form className={styles.form} onSubmit={(event) => void submit(event)} aria-label="Report suspicious content">
      <div className={styles.layout}>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="selected-content">
            <h2 id="selected-content" className={styles.cardTitle}>Selected content</h2>
            <ReportedMessage message={message} />
          </section>

          <fieldset className={styles.card}>
            <legend className={styles.cardTitle}>Reason for reporting</legend>
            {REPORT_REASONS.map((option) => (
              <label key={option} className={styles.option}>
                <input
                  type="radio"
                  name="reason"
                  value={option}
                  checked={reason === option}
                  onChange={() => setReason(option)}
                />
                <span>{REPORT_REASON_LABELS[option]}</span>
              </label>
            ))}
          </fieldset>

          <section className={styles.card} aria-labelledby={detailsId}>
            <h2 id={detailsId} className={styles.cardTitle}>Additional details</h2>
            <textarea
              className={styles.textarea}
              aria-label="Additional details"
              maxLength={DETAILS_MAX_LENGTH}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
            <p className={styles.muted}>
              {details.length} / {DETAILS_MAX_LENGTH}
            </p>
          </section>

          <section className={styles.card} aria-labelledby="evidence">
            <h2 id="evidence" className={styles.cardTitle}>Attachments / evidence</h2>
            <p className={styles.row}>No file attached</p>
            {message.detected_domain !== null && (
              <p className={styles.row}>
                Detected domain: <strong>{message.detected_domain}</strong>{' '}
                <span className={styles.badge}>external</span>
              </p>
            )}
          </section>

          {problem !== null && (
            <p className={styles.notice} role="alert">
              {problem}
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => navigate('/chats')}>
              Cancel
            </Button>
            <Button type="submit" className={styles.submit} disabled={sending}>
              {sending ? 'Sending…' : 'Submit report'}
            </Button>
          </div>
        </div>

        <aside className={styles.column} aria-label="What happens next">
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>What happens after you submit?</h2>
            <ol className={styles.steps}>
              <li>
                <strong>Report sent</strong>
                <span>The content and context are sent to your organisation&apos;s administrators.</span>
              </li>
              <li>
                <strong>Reviewed by admins</strong>
                <span>Your administrators review the report and take action under your organisation&apos;s policies.</span>
              </li>
              <li>
                <strong>You&apos;ll be notified</strong>
                <span>We&apos;ll let you know once the review is complete, or if we need more information.</span>
              </li>
            </ol>
          </section>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Privacy notice</h2>
            <p className={styles.muted}>
              Your report and the relevant context (message content, sender, time, detected links or domains) are
              visible only to authorised organisation administrators. It is not shared with the message sender or
              other end users.
            </p>
          </section>
        </aside>
      </div>
      </form>
    </>
  );
}
