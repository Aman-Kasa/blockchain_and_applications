// Small seal used as the logo of the app.
export default function SealMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="var(--ink)" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="2 2" />
      <path d="M11 16.5l3.2 3.2L21 13" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
