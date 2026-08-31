export function sanitizeShortcutFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
}

export function resolveShortcutFilename(opts: {
  shortcutName?: string | null;
  poolName?: string | null;
  accountName?: string | null;
  accountCode: string;
}) {
  const code = opts.accountCode.toLowerCase();
  const fallback =
    sanitizeShortcutFilename(opts.poolName || opts.accountName || '') || `SwimIT-${code}`;
  const custom = sanitizeShortcutFilename(String(opts.shortcutName ?? ''));
  return custom || fallback;
}

export type ShortcutDownloadResult = 'shared' | 'downloaded';

export async function downloadPoolLoginShortcut(opts: {
  accountCode: string;
  shortcutName?: string | null;
  poolName?: string | null;
  accountName?: string | null;
}): Promise<ShortcutDownloadResult> {
  const code = opts.accountCode.toLowerCase();
  const loginUrl = `${window.location.origin}/${code}`;
  const label = resolveShortcutFilename(opts);

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: label,
        text: label,
        url: loginUrl,
      });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
    }
  }

  const content = `[InternetShortcut]\r\nURL=${loginUrl}\r\nIconIndex=0\r\n`;
  const blob = new Blob([content], { type: 'application/internet-shortcut' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${label}.url`;
  link.title = label;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return 'downloaded';
}
