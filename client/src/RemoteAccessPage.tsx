import { Link } from 'react-router-dom';
import { useT } from './i18n';

export function RemoteAccessPage() {
  const t = useT();
  return (
    <div className="page remote-access-page">
      <div className="remote-access-card">
        <img src="/swimit-logo.png" alt="SwimIT" className="remote-access-logo" />
        <h1>{t('Remote login approval')}</h1>
        <p className="muted">
          {t('Sign-in no longer uses location or distance checks. Users can log in without admin approval.')}
        </p>
        <p className="remote-access-home">
          <Link to="/">{t('Back to home')}</Link>
        </p>
      </div>
    </div>
  );
}
