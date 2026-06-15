import React from 'react';

/** Power BI-style icons for the Data ribbon menu */
export const TransformDataIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="1" />
    <line x1="2" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="1" />
    <line x1="7" y1="2" x2="7" y2="18" stroke="currentColor" strokeWidth="1" />
    <line x1="12" y1="2" x2="12" y2="18" stroke="currentColor" strokeWidth="1" />
    <path d="M13 14l3 3 1.5-1.5-3-3" stroke="#217346" strokeWidth="1.3" fill="none" />
    <path d="M14 13l2 2" stroke="#217346" strokeWidth="1.3" />
  </svg>
);

export const DataSourceSettingsIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="1" width="10" height="13" rx="1" stroke="currentColor" strokeWidth="1.1" fill="none" />
    <circle cx="12.5" cy="11.5" r="3" stroke="#217346" strokeWidth="1.1" fill="white" />
    <path d="M12.5 10v3M11 11.5h3" stroke="#217346" strokeWidth="1" />
    <line x1="4" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="0.8" />
    <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="0.8" />
  </svg>
);

export const EditParametersIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="1" width="10" height="13" rx="1" stroke="currentColor" strokeWidth="1.1" fill="none" />
    <rect x="4" y="4" width="6" height="1.5" rx="0.5" fill="#217346" />
    <rect x="4" y="7" width="6" height="1.5" rx="0.5" fill="#217346" />
    <rect x="4" y="10" width="4" height="1.5" rx="0.5" fill="#217346" opacity="0.5" />
  </svg>
);

export const EditVariablesIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <text x="2" y="12" fontSize="11" fontWeight="600" fill="#217346" fontFamily="Segoe UI, sans-serif">fx</text>
  </svg>
);

export const RefreshDataIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="3" y="2" width="12" height="15" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <path d="M10 6a4 4 0 0 1 3.5 6" stroke="#217346" strokeWidth="1.3" fill="none" />
    <path d="M13.5 9l1.5-2-2 0.5" stroke="#217346" strokeWidth="1.2" fill="none" />
    <path d="M10 14a4 4 0 0 1-3.5-6" stroke="#217346" strokeWidth="1.3" fill="none" />
    <path d="M6.5 11l-1.5 2 2-0.5" stroke="#217346" strokeWidth="1.2" fill="none" />
  </svg>
);
