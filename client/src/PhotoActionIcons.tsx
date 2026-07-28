export function CameraActionIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={`${className} photo-icon-camera`} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 8h3l2-2h6l2 2h3v11H4V8z"
        fill="#3b82f6"
        stroke="#1d4ed8"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" fill="#93c5fd" stroke="#1e40af" strokeWidth="1.4" />
      <circle cx="12" cy="13" r="1.4" fill="#1e3a8a" />
    </svg>
  );
}

export function UploadActionIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={`${className} photo-icon-upload`} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 9h6l2-2h10v12H3V9z"
        fill="#f59e0b"
        stroke="#b45309"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M3 11h18v10H3V11z"
        fill="#fbbf24"
        stroke="#b45309"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
