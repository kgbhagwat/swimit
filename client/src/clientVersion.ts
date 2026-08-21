type VersionInfo = {
  commit?: string;
  builtAt?: string | null;
};

let loadedVersion: Promise<string | null> | null = null;

function versionId(info: VersionInfo): string | null {
  const commit = String(info.commit ?? '').trim();
  if (commit && commit !== 'unknown') return `commit:${commit}`;

  const builtAt = String(info.builtAt ?? '').trim();
  return builtAt ? `built:${builtAt}` : null;
}

async function fetchVersion(cacheBust = false): Promise<string | null> {
  try {
    const suffix = cacheBust ? `?now=${Date.now()}` : '';
    const response = await fetch(`/api/version${suffix}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return versionId((await response.json()) as VersionInfo);
  } catch {
    return null;
  }
}

/** Capture the release served when this browser page starts. */
export function initializeClientVersion() {
  loadedVersion ??= fetchVersion();
}

/** Reload only when deployment changed while this page remained open. */
export async function navigateToCurrentVersion(
  path: string,
  navigateInApp: (path: string) => void,
) {
  initializeClientVersion();
  const [loaded, current] = await Promise.all([loadedVersion, fetchVersion(true)]);

  if (loaded && current && loaded !== current) {
    window.location.replace(path);
    return;
  }

  navigateInApp(path);
}
