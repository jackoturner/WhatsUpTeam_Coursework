import Link from './Link';
import styles from './adminTabs.module.css';

const TABS = [
  { label: 'Users', to: '/admin/users' },
  { label: 'Roles', to: '/admin/roles' },
  { label: 'Organisation', to: '/admin/organisation' },
  { label: 'Audit', to: '/admin/audit' },
] as const;

export default function AdminTabs({ active }: { active: (typeof TABS)[number]['to'] }) {
  return (
    <nav className={styles.tabs} aria-label="Administration sections">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={styles.tab}
          aria-current={tab.to === active ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
