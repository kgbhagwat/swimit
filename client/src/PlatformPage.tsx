import type { ReactNode } from 'react';

/** Shared SaaS platform page chrome: title band + content (matches Service packages). */
export function PlatformPage({
  title,
  children,
  className = '',
  actions,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={`page platform-page${className ? ` ${className}` : ''}`}>
      <header className={`platform-page-heading${actions ? ' platform-page-heading--split' : ''}`}>
        <h1>{title}</h1>
        {actions ? <div className="platform-page-heading-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
