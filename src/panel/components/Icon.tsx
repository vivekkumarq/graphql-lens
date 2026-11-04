// Hand-drawn 16px stroke icons, so the extension ships no icon font or third-party assets.
const PATHS = {
  record: <circle cx="8" cy="8" r="4.5" fill="currentColor" stroke="none" />,
  clear: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.2 11.8l7.6-7.6" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2L14 14" />
    </>
  ),
  upload: <path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 11v2.5h11V11" />,
  download: <path d="M8 2.5V11M4.5 7.5L8 11l3.5-3.5M2.5 11v2.5h11V11" />,
  gear: (
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V3a.5.5 0 00-.5-.5H3a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h2.5" />
    </>
  ),
  play: <path d="M5 3.5v9l7-4.5z" fill="currentColor" />,
  check: <path d="M3 8.5l3 3 7-7" />,
  alert: (
    <>
      <path d="M8 2l6.5 11.5h-13z" />
      <path d="M8 6.5v3M8 11.6v.1" />
    </>
  ),
  error: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  eyeOff: (
    <path d="M2 2l12 12M6.6 3.7A6.6 6.6 0 018 3.5C12 3.5 14.5 8 14.5 8a11 11 0 01-2 2.6M9.4 12.3a6.6 6.6 0 01-1.4.2C4 12.5 1.5 8 1.5 8a11 11 0 012.5-3" />
  ),
  chevron: <path d="M6 4l4 4-4 4" />,
  // arrows pointing at the middle line (fold) vs. away from it (unfold)
  collapse: <path d="M8 1.5V6M5.5 3.5L8 6l2.5-2.5M2.5 8h11M8 14.5V10M5.5 12.5L8 10l2.5 2.5" />,
  expand: <path d="M8 6V1.5M5.5 4L8 1.5 10.5 4M2.5 8h11M8 10v4.5M5.5 12L8 14.5l2.5-2.5" />,
  wrap: <path d="M2.5 4h11M2.5 8h9a2 2 0 010 4H8m1.5-1.5L8 12l1.5 1.5M2.5 12H5" />,
  bolt: <path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" />,
  reload: <path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v3h-3" />,
  link: <path d="M7 9a3 3 0 004.2 0l2-2A3 3 0 009 2.8l-1 1M9 7a3 3 0 00-4.2 0l-2 2A3 3 0 007 13.2l1-1" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 9h6l.5-9" />,
  more: (
    <>
      <circle cx="3.5" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
