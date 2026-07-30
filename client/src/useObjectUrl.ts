import { useEffect, useState } from 'react';

/** Creates an object URL for a File/Blob and revokes it on change/unmount. */
export function useObjectUrl(file: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
}

/** Same as useObjectUrl for a list of optional files (e.g. certificate photos). */
export function useObjectUrls(files: Array<Blob | null | undefined>) {
  const [urls, setUrls] = useState<Array<string | null>>([]);
  const key = files.map((f) => (f ? `${f.size}:${f.type}:${(f as File).name ?? ''}` : '')).join('|');

  useEffect(() => {
    const next = files.map((file) => (file ? URL.createObjectURL(file) : null));
    setUrls(next);
    return () => {
      for (const url of next) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [key]);

  return urls;
}
