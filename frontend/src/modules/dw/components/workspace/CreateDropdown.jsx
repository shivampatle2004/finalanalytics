import React, { useState, useRef, useEffect } from 'react';
import { FiPlus, FiFolder, FiFileText, FiDatabase, FiBook, FiCode, FiChevronRight } from 'react-icons/fi';

const TechFolderIcon = ({ size = 18, color = 'var(--df-accent)', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <circle cx="18" cy="10" r="1.2" fill={color} stroke="none" />
  </svg>
);

const TechNotebookIcon = ({ size = 18, color = 'var(--df-accent)', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16v16H4z" opacity="0.1" fill={color} stroke="none" />
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 7h6M9 11h6M9 15h4" opacity="0.6" strokeWidth={1.5} />
    <circle cx="17" cy="5" r="1" fill={color} stroke="none" />
    <path d="M5 19h14" strokeWidth={1} />
  </svg>
);

const CreateDropdown = ({ onCreate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowLangPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreate = (type, extra = {}) => {
    setIsOpen(false);
    setShowLangPicker(false);
    onCreate(type, extra);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setIsOpen(!isOpen); setShowLangPicker(false); }}
        className="df-btn df-btn-primary px-8 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
        style={{ backgroundColor: 'var(--df-accent)', color: '#FFFFFF', border: 'none' }}
      >
        <FiPlus size={18} strokeWidth={3} /> Create
      </button>

      {isOpen && (
        <div className="dw-dropdown-menu !min-w-[220px]">
          {/* Notebook with language sub-menu */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowLangPicker(!showLangPicker); }}
              className={`dw-dropdown-item justify-between ${showLangPicker ? 'active' : ''}`}
            >
              <span className="flex items-center gap-3">
                <TechNotebookIcon size={18} />
                <span>Notebook</span>
              </span>
              <FiChevronRight className={`transition-transform duration-200 ${showLangPicker ? 'rotate-90' : ''}`} size={14} />
            </button>

            {showLangPicker && (
              <div className="dw-dropdown-menu !right-full !mr-2 !top-0 !min-w-[160px]">
                <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest mb-1 opacity-40 text-[var(--df-text)]">
                  Language
                </div>
                <button 
                  className="dw-dropdown-item"
                  onClick={() => handleCreate('notebook', { language: 'sql' })}
                >
                  <FiCode className="text-blue-500" size={16} />
                  <span>SQL</span>
                </button>
                <button 
                  className="dw-dropdown-item"
                  onClick={() => handleCreate('notebook', { language: 'python' })}
                >
                  <FiCode className="text-emerald-500" size={16} />
                  <span>Python</span>
                </button>
              </div>
            )}
          </div>

          <button 
            className="dw-dropdown-item"
            onClick={() => handleCreate('folder')}
          >
            <TechFolderIcon size={18} />
            <span>Folder</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default CreateDropdown;
