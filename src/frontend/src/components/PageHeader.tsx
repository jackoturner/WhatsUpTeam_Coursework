import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface PageHeaderProps {
  title: string;
  description: string;
  /** SVG shapes drawn inside the 24×24 icon tile. */
  icon: ReactNode;
}

/** Icon, title and description at the top of a workspace page. */
export default function PageHeader({ title, description, icon }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <span className={styles.pageIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div>
        <h2 className={styles.pageTitle}>{title}</h2>
        <p className={styles.pageDescription}>{description}</p>
      </div>
    </header>
  );
}
