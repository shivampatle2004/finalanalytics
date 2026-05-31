import React, { useState, useRef, useEffect } from 'react';
import { 
  FiPlus, FiPlusCircle, FiArrowUpRight, FiUpload, FiDatabase, 
  FiMapPin, FiBox, FiLock, FiLink, FiChevronDown, FiExternalLink, FiLayers
} from 'react-icons/fi';

const CatalogCreateDropdown = ({ onAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    { id: 'create-catalog', label: 'Create a catalog', icon: FiDatabase },
    { id: 'create-schema', label: 'Create a schema', icon: FiLayers },
    { id: 'create-volume', label: 'Create a volume', icon: FiBox },
    { divider: true },
    { id: 'upload-volume', label: 'Upload to volume', icon: FiUpload },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="dw-btn-primary flex items-center gap-2"
      >
        <FiPlus size={16} strokeWidth={3} /> Create
        <FiChevronDown size={14} style={{ marginLeft: 2, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 z-50 animate-fadeIn" 
             style={{ 
               width: '240px',
               padding: '8px',
               borderRadius: '12px',
               backgroundColor: 'var(--df-bg)', 
               border: '1px solid var(--df-border)', 
               boxShadow: '0 8px 24px rgba(0,0,0,0.12)' 
             }}>
          <div>
            {menuItems.map((item, idx) => (
              item.divider ? (
                <div key={idx} className="h-[1px] my-2 opacity-10" style={{ backgroundColor: 'var(--df-text)' }} />
              ) : (
                <button
                  key={item.id}
                  onClick={() => { onAction(item.id); setIsOpen(false); }}
                  className="w-full flex items-center transition-colors text-left"
                  style={{ 
                    padding: '8px 12px', 
                    gap: '12px',
                    borderRadius: '8px', 
                    color: 'var(--df-text)',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    marginTop: idx > 0 ? '4px' : '0px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div className="flex items-center justify-center shrink-0" 
                       style={{ 
                         width: '32px', 
                         height: '32px', 
                         borderRadius: '8px', 
                         backgroundColor: 'var(--df-accent-soft)' 
                       }}>
                    <item.icon size={15} style={{ color: 'var(--df-accent)' }} />
                  </div>
                  <span className="font-semibold text-[13px]" style={{ color: 'var(--df-strong)' }}>{item.label}</span>
                </button>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogCreateDropdown;
