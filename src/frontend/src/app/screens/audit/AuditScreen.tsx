import { useCallback, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import AdminTabs from '../../../components/AdminTabs';
import Button from '../../../components/Button';
import PageHeader from '../../../components/PageHeader';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import type { AuditEvent, MessageReport } from '../../../types/api';
import { formatDateTime } from '../../../utils/format';
import styles from './AuditScreen.module.css';

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; items: T[]; total: number }
  | { status: 'error'; text: string };
type Tab = 'reports' | 'audit';
const PAGE_SIZE = 50;

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

function ReportsTable({
  reports,
  busyReportId,
  onStatusChange,
}: {
  reports: MessageReport[];
  busyReportId: number | null;
  onStatusChange(reportId: number, status: MessageReport['review_status']): void;
}) {
  if (reports.length === 0) return <p className={styles.muted}>No report matches your search.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Report ID</th>
          <th scope="col">Reported message</th>
          <th scope="col">Reporter</th>
          <th scope="col">Reason</th>
          <th scope="col">Review status</th>
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
            <td>
              <label className="visually-hidden" htmlFor={`report-status-${report.id}`}>
                Review status for report {report.id}
              </label>
              <select
                id={`report-status-${report.id}`}
                value={report.review_status}
                disabled={busyReportId === report.id}
                onChange={(event) =>
                  onStatusChange(report.id, event.target.value as MessageReport['review_status'])
                }
              >
                <option value="open">Open</option>
                <option value="in_review">In review</option>
                <option value="resolved">Resolved</option>
              </select>
            </td>
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
  const [offset, setOffset] = useState(0);
  const [reportStatus, setReportStatus] = useState('all');
  const [busyReportId, setBusyReportId] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const panelId = useId();

  const loadReports = useCallback(async () => {
    setReports({ status: 'loading' });
    try {
      const page = await api.admin.listReports({ offset, reviewStatus: reportStatus });
      setReports({ status: 'ready', items: page.items, total: page.total });
    } catch (error) {
      setReports({ status: 'error', text: handleError(error) });
    }
  }, [api, handleError, offset, reportStatus]);

  const loadEvents = useCallback(async () => {
    setEvents({ status: 'loading' });
    try {
      const page = await api.admin.listAuditEvents({ offset });
      setEvents({ status: 'ready', items: page.items, total: page.total });
    } catch (error) {
      setEvents({ status: 'error', text: handleError(error) });
    }
  }, [api, handleError, offset]);

  useEffect(() => {
    void loadReports();
    void loadEvents();
  }, [loadReports, loadEvents]);

  function refresh() {
    if (tab === 'reports') void loadReports();
    else void loadEvents();
  }

  async function updateReport(reportId: number, status: MessageReport['review_status']) {
    setBusyReportId(reportId);
    setMutationError(null);
    try {
      await api.admin.updateReport(reportId, status);
      await loadReports();
    } catch (error) {
      setMutationError(handleError(error));
    } finally {
      setBusyReportId(null);
    }
  }

  const activeLoad = tab === 'reports' ? reports : events;
  const total = activeLoad.status === 'ready' ? activeLoad.total : 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Security audit"
        description="Review organisation audit events and submitted message reports."
        icon={<path d="M12 3 20 6v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM9 12l2 2 4-4" />}
      />
      <AdminTabs active="/admin/audit" />

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
          {tab === 'reports' && (
            <label>
              <span className="visually-hidden">Filter report status</span>
              <select
                value={reportStatus}
                onChange={(event) => {
                  setReportStatus(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="in_review">In review</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          )}
          <Button variant="ghost" onClick={refresh}>
            Refresh
          </Button>
        </div>

        {mutationError !== null && <p className={styles.notice} role="alert">{mutationError}</p>}
        {tab === 'reports' ? (
          <ListState load={reports} noun="reports" emptyText="No reported message. Good news.">
            {(items) => (
              <ReportsTable
                reports={items.filter((report) =>
                  matchesQuery(query, [report.message_body, report.reporter_username, report.reason, report.conversation_name]),
                )}
                busyReportId={busyReportId}
                onStatusChange={(reportId, status) => void updateReport(reportId, status)}
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
        {activeLoad.status === 'ready' && (
          <nav className={styles.toolbar} aria-label="Pagination">
            <span className={styles.muted}>Showing {pageStart}–{pageEnd} of {total}</span>
            <Button
              variant="ghost"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Next
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
