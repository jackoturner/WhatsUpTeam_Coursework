import { useCallback, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import Button from '../../../components/Button';
import PageHeader from '../../../components/PageHeader';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import type { AuditEvent, MessageReport } from '../../../types/api';
import { formatDateTime } from '../../../utils/format';
import styles from './AuditScreen.module.css';

type Load<T> = { status: 'loading' } | { status: 'ready'; items: T[] } | { status: 'error'; text: string };
type Tab = 'reports' | 'audit';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'reports', label: 'Message Reports' },
  { id: 'audit', label: 'Audit Logs' },
];

/** Loading, error, empty and table: the same four states for every list on this page. */
function ListState<T>({
  load,
  noun,
  emptyText,
  children,
}: {
  load: Load<T>;
  noun: string;
  emptyText: string;
  children(items: T[]): ReactNode;
}) {
  if (load.status === 'loading') return <p aria-busy="true">Loading {noun}…</p>;
  if (load.status === 'error') return <p className={styles.notice} role="alert">{load.text}</p>;
  if (load.items.length === 0) return <p className={styles.muted}>{emptyText}</p>;
  return <div className={styles.tableWrap}>{children(load.items)}</div>;
}

/** Case-insensitive search: an empty query matches everything. */
function matchesQuery(query: string, values: (string | null)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

function ReportsTable({ reports }: { reports: MessageReport[] }) {
  if (reports.length === 0) return <p className={styles.muted}>No report matches your search.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Report ID</th>
          <th scope="col">Reported message</th>
          <th scope="col">Reporter</th>
          <th scope="col">Reason</th>
          <th scope="col">Reported at</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report) => (
          <tr key={report.id} data-testid="report">
            <td className={styles.nowrap}>#R-{report.id}</td>
            <td>
              <p className={styles.preview} title={report.message_body}>
                “{report.message_body}”
              </p>
            </td>
            <td>
              <span className={styles.person}>
                <span className={styles.avatar} aria-hidden="true">
                  {report.reporter_username.slice(0, 2).toUpperCase()}
                </span>
                {report.reporter_username}
              </span>
            </td>
            <td>{report.reason}</td>
            <td className={styles.nowrap}>{formatDateTime(report.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditTable({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <p className={styles.muted}>No audit event matches your search.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Event</th>
          <th scope="col">Actor</th>
          <th scope="col">Source IP</th>
          <th scope="col">Details</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id} data-testid="audit-event">
            <td className={styles.nowrap}>{formatDateTime(event.timestamp)}</td>
            <td>{event.event_type}</td>
            <td>{event.actor_username ?? '—'}</td>
            <td>{event.source_ip}</td>
            <td>{event.details}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditScreen() {
  const api = useApi();
  const { handleError } = useAuth();
  const [reports, setReports] = useState<Load<MessageReport>>({ status: 'loading' });
  const [events, setEvents] = useState<Load<AuditEvent>>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('reports');
  const [query, setQuery] = useState('');
  const panelId = useId();

  const loadReports = useCallback(async () => {
    setReports({ status: 'loading' });
    try {
      setReports({ status: 'ready', items: await api.admin.listReports() });
    } catch (error) {
      setReports({ status: 'error', text: handleError(error) });
    }
  }, [api, handleError]);

  const loadEvents = useCallback(async () => {
    setEvents({ status: 'loading' });
    try {
      setEvents({ status: 'ready', items: await api.admin.listAuditEvents() });
    } catch (error) {
      setEvents({ status: 'error', text: handleError(error) });
    }
  }, [api, handleError]);

  useEffect(() => {
    void loadReports();
    void loadEvents();
  }, [loadReports, loadEvents]);

  function refresh() {
    if (tab === 'reports') void loadReports();
    else void loadEvents();
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Security Events & Reports"
        description="Administrator view of message reports, audit logs and security-related activity."
        icon={<path d="M12 3 20 6v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM9 12l2 2 4-4" />}
      />

      <div role="tablist" aria-label="Security views" className={styles.tabs}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={panelId}
            className={styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section id={panelId} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.card}>
        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.search}
            aria-label={tab === 'reports' ? 'Search reports' : 'Search audit logs'}
            placeholder={tab === 'reports' ? 'Search reports (message, user, reason)…' : 'Search audit logs…'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button variant="ghost" onClick={refresh}>
            Refresh
          </Button>
        </div>

        {tab === 'reports' ? (
          <ListState load={reports} noun="reports" emptyText="No reported message. Good news.">
            {(items) => (
              <ReportsTable
                reports={items.filter((report) =>
                  matchesQuery(query, [report.message_body, report.reporter_username, report.reason, report.conversation_name]),
                )}
              />
            )}
          </ListState>
        ) : (
          <ListState load={events} noun="events" emptyText="No audit event yet.">
            {(items) => (
              <AuditTable
                events={items.filter((event) =>
                  matchesQuery(query, [event.event_type, event.actor_username, event.source_ip, event.details]),
                )}
              />
            )}
          </ListState>
        )}
      </section>
    </div>
  );
}
