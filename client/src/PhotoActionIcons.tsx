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

export function FlipCameraIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M7 8h2.2L11 6h2l1.8 2H17v9H7V8z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="2.2" />
      <path d="M8 3.2A9 9 0 0 0 4.4 9" strokeLinecap="round" />
      <path d="M6.1 2.6 8 3.2 7.2 5.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 20.8A9 9 0 0 0 19.6 15" strokeLinecap="round" />
      <path d="M17.9 21.4 16 20.8 16.8 18.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandscapePageIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="7" width="18" height="12" rx="2" />
    </svg>
  );
}

export function PortraitPageIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2" />
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
