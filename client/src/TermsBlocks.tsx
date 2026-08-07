/** Renders terms text with numbered clause headings in bold. */

function renderNumberedLine(line: string, index: number) {
  // "1) Heading – body" / "१) शीर्षक – मजकूर"
  const withHeading = line.match(
    /^((?:\d+|[०-९]+)[).]\s+)(.+?)\s+[–—-]\s+(.+)$/u,
  );
  if (withHeading) {
    const [, number, heading, body] = withHeading;
    return (
      <p key={`${index}-${heading}`}>
        <strong>
          {number}
          {heading}
        </strong>
        {' – '}
        {body}
      </p>
    );
  }

  // "1) Full sentence..." — bold the number prefix only
  const numberOnly = line.match(/^((?:\d+|[०-९]+)[).]\s+)(.+)$/u);
  if (numberOnly) {
    const [, number, body] = numberOnly;
    return (
      <p key={`${index}-${body.slice(0, 24)}`}>
        <strong>{number.trimEnd()}</strong>
        {' '}
        {body}
      </p>
    );
  }

  return <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>;
}

export function TermsBlocks({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const numberedList =
    lines.length > 1 && lines.every((line) => /^(?:\d+|[०-९]+)[).]\s+/u.test(line));

  if (numberedList) {
    return <div className="terms-compact-list">{lines.map(renderNumberedLine)}</div>;
  }

  const chunks = trimmed
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <>
      {chunks.map((chunk, index) => {
        const parts = chunk.split('\n');
        const first = parts[0] ?? '';
        const looksLikeHeading = /^\d+\.\s+/.test(first) || first.length < 80;
        if (looksLikeHeading && parts.length > 1) {
          return (
            <div key={`${index}-${first}`}>
              <h3>{first}</h3>
              <p>{parts.slice(1).join(' ')}</p>
            </div>
          );
        }
        return <p key={`${index}-${first.slice(0, 24)}`}>{chunk}</p>;
      })}
    </>
  );
}
