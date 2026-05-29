import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiDatabase, FiBook, FiBell } from 'react-icons/fi';

const DROPDOWN_WIDTH = 200;

const CreateNewModal = ({ isOpen, onClose, onCreate, anchorRect }) => {
  const [hoveredOption, setHoveredOption] = useState(null);
  const dropdownRef = useRef(null);

  const options = [
    { id: 'sql',      icon: FiDatabase, title: 'SQL Query' },
    { id: 'notebook', icon: FiBook,     title: 'Notebook' },
    { id: 'alert',    icon: FiBell,     title: 'Alert' },
  ];

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handle), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handle); };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  // Anchor just below the + button, left-aligned with it
  const top  = anchorRect.bottom + 4;
  const left = anchorRect.left;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top:    `${top}px`,
        left:   `${left}px`,
        width:  `${DROPDOWN_WIDTH}px`,
        backgroundColor: 'var(--df-card-bg)',
        border: '1px solid var(--df-border)',
        borderRadius: '10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 99999,
        padding: '4px 0',
      }}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const hov = hoveredOption === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => { onCreate(opt.id); onClose(); }}
            onMouseEnter={() => setHoveredOption(opt.id)}
            onMouseLeave={() => setHoveredOption(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              width: '100%', padding: '8px 14px',
              background: hov ? 'var(--df-accent-soft)' : 'transparent',
              color: hov ? 'var(--df-accent)' : 'var(--df-text)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              fontSize: '13px', fontWeight: 400, transition: 'background 0.12s',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={15} style={{ flexShrink: 0 }} />
            <span>{opt.title}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
};

export default CreateNewModal;
