import { useEffect, useState } from 'react';

function blobKey(file: Blob): string {
  if (file instanceof File) {
    return `${file.name}|${file.size}|${file.type}|${file.lastModified}`;
  }
  return `${file.size}|${file.type}`;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Local preview URL for a File/Blob (data URL — stable for <img> previews). */
export function useObjectUrl(file: Blob | null | undefined) {
  const key = file ? blobKey(file) : '';
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!file) {
      setUrl(null);
      return;
    }
    void readAsDataUrl(file)
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return url;
}

/** Same as useObjectUrl for a list of optional files (e.g. certificate photos). */
export function useObjectUrls(files: Array<Blob | null | undefined>) {
  const key = files.map((f) => (f ? blobKey(f) : '')).join('|');
  const [urls, setUrls] = useState<Array<string | null>>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      files.map(async (file) => {
        if (!file) return null;
        try {
          return await readAsDataUrl(file);
        } catch {
          return null;
        }
      }),
    ).then((next) => {
      if (!cancelled) setUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}
