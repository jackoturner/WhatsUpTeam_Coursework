import AdminTabs from '../../../components/AdminTabs';
import PageHeader from '../../../components/PageHeader';
import styles from './AdminUsersScreen.module.css';

const PERMISSIONS = [
  { name: 'Send messages', employee: 'Allowed in joined conversations', manager: 'Allowed in joined conversations', admin: 'Allowed in joined conversations' },
  { name: 'Read conversations', employee: 'Member only', manager: 'Member only', admin: 'Member only' },
  { name: 'Upload and preview attachments', employee: 'Member only', manager: 'Member only', admin: 'Member only' },
  { name: 'Download non-confidential attachments', employee: 'Member only', manager: 'Member only', admin: 'Member only' },
  { name: 'Report suspicious messages', employee: 'Allowed', manager: 'Allowed', admin: 'Allowed' },
  { name: 'Manage group membership', employee: 'Not permitted', manager: 'Allowed', admin: 'Allowed' },
  { name: 'Manage organisation users', employee: 'Not permitted', manager: 'Not permitted', admin: 'Allowed' },
  { name: 'Assign organisation roles', employee: 'Not permitted', manager: 'Not permitted', admin: 'Allowed' },
  { name: 'Change organisation name', employee: 'Not permitted', manager: 'Not permitted', admin: 'Allowed' },
  { name: 'Review reports and view audit events', employee: 'Not permitted', manager: 'Not permitted', admin: 'Allowed' },
] as const;

export default function AdminRolesScreen() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Roles and permissions"
        description="Review the access available to each role in your organisation."
        icon={<><path d="M12 3 20 7v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7z" /><path d="m9 12 2 2 4-4" /></>}
      />
      <AdminTabs active="/admin/roles" />
      <section className={styles.card} aria-labelledby="permissions-heading">
        <h2 id="permissions-heading">Permission matrix</h2>
        <p className={styles.muted}>
          Conversation access is membership-based. Confidential files are preview-only; non-confidential files may be downloaded. Organisation administrators do not automatically gain access to private messages or files.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Permission</th><th scope="col">Employee</th><th scope="col">Group Manager</th><th scope="col">IT Administrator</th></tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((permission) => (
                <tr key={permission.name}>
                  <th scope="row">{permission.name}</th>
                  <td>{permission.employee}</td>
                  <td>{permission.manager}</td>
                  <td>{permission.admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
