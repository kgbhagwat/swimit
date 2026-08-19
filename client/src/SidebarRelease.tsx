import { useEffect, useState } from 'react';
import { useT } from './i18n';

type VersionInfo = { commit?: string; builtAt?: string | null };

let cached: VersionInfo | null = null;
let inflight: Promise<VersionInfo> | null = null;

function loadVersion() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/version')
      .then((res) => res.json() as Promise<VersionInfo>)
      .then((body) => {
        cached = {
          commit: String(body.commit ?? '').trim() || 'unknown',
          builtAt: body.builtAt ?? null,
        };
        return cached;
      })
      .catch(() => {
        inflight = null;
        return { commit: 'unknown', builtAt: null };
      });
  }
  return inflight;
}

function shortCommit(commit: string) {
  const raw = String(commit ?? '').trim() || 'unknown';
  if (raw === 'unknown') return raw;
  return raw.slice(0, 7);
}

/** Build/release id pinned to the bottom of the left menu. */
export function SidebarRelease() {
  const t = useT();
  const [commit, setCommit] = useState(() => shortCommit(cached?.commit ?? ''));

  useEffect(() => {
    let cancelled = false;
    void loadVersion().then((info) => {
      if (!cancelled) setCommit(shortCommit(info.commit ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className="platform-sidebar-release" title={commit}>
      {t('Release')} {commit}
    </p>
  );
}
