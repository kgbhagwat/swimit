type DownloadButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
};

export function DownloadButton({ onClick, disabled, label = 'Download' }: DownloadButtonProps) {
  return (
    <button
      type="button"
      className="download-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M12 4v12" />
        <path d="M7 12l5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
