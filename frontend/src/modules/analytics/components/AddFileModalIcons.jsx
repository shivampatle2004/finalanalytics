import React from 'react';

const iconProps = {
  width: 28,
  height: 28,
  viewBox: '0 0 28 28',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
};

/** Blank report canvas — layout frame with chart placeholder */
export const BlankCanvasIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="22" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 9h22" stroke="currentColor" strokeWidth="1.5" />
    <rect x="6" y="12" width="7" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" />
    <path d="M16 12h6M16 16h6M16 20h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

/** Excel workbook */
export const ExcelIcon = () => (
  <svg {...iconProps}>
    <rect x="4" y="3" width="20" height="22" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 9h20M10 3v22" stroke="currentColor" strokeWidth="1.25" />
    <path d="M13 14l3 3.5M13 20l3-3.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Database connection */
export const DatabaseIcon = () => (
  <svg {...iconProps}>
    <ellipse cx="14" cy="7" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 7v6c0 1.66 3.58 3 8 3s8-1.34 8-3V7" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 13v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 21h8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <circle cx="14" cy="21" r="1" fill="currentColor" />
  </svg>
);

/** Manual table entry */
export const EnterDataIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="5" width="22" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 11h22M3 17h22M11 5v18M17 5v18" stroke="currentColor" strokeWidth="1.15" />
    <path d="M20 8l2 2-4 4-2 1 1-2 3-3z" fill="currentColor" stroke="none" opacity="0.9" />
  </svg>
);

/** Sample dataset */
export const SampleDataIcon = () => (
  <svg {...iconProps}>
    <ellipse cx="14" cy="8" rx="7" ry="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 8v4c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 12v4c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-4" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 22h10M12 19v3M16 19v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

/** CSV / text file (footer link) */
export const TextFileIcon = () => (
  <svg width={18} height={18} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path
      d="M5 2h5l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
    />
    <path d="M10 2v4h4M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
