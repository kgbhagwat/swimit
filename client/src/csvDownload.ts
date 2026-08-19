/** Excel and many phone apps assume Windows-1252 unless a UTF-8 BOM is present. */
export function saveCsvFile(filename: string, csvBody: string) {
  const asciiSafe = csvBody.replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/\u2026/g, '...');
  const blob = new Blob([`\uFEFF${asciiSafe}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Keep CSV cells readable when a spreadsheet ignores UTF-8. */
export function csvPlain(value: string) {
  const text = String(value ?? '').trim();
  if (text === '—' || text === '–') return '';
  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/\u2026/g, '...');
}
