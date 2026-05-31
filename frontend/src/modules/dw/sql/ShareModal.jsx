import React, { useState } from 'react';
import { FiUsers, FiLink, FiX } from 'react-icons/fi';

const ShareModal = ({ isOpen, onClose, title = 'admin@arithwise.com' }) => {
  const [searchValue, setSearchValue] = useState('');

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        className="w-[600px] shadow-2xl rounded-2xl border flex flex-col pt-6 pb-4"
        style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}
      >
        {/* Header */}
        <div className="px-6 flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold tracking-tight flex gap-2 items-center" style={{ color: 'var(--df-text)' }}>
            Sharing: {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--df-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--df-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--df-text-muted)')}
          >
            <FiX size={18} />
          </button>
        </div>

        {/* User Search Input */}
        <div className="px-6 mb-6">
          <div
            className="w-full flex items-center border rounded-lg px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-opacity-50"
            style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)' }}
          >
            <input
              type="text"
              className="flex-1 bg-transparent outline-none"
              placeholder="Type to add multiple users, groups or service principals"
              style={{ color: 'var(--df-text)' }}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              autoFocus
            />
            <span style={{ color: 'var(--df-text-muted)', fontSize: '10px' }}>▼</span>
          </div>
        </div>

        {/* People List */}
        <div className="px-6 mb-8 flex-1">
          <div className="text-xs mb-3 font-medium flex items-center gap-1" style={{ color: 'var(--df-text-soft)' }}>
            People with access
            <span
              className="cursor-help w-3 h-3 rounded-full border flex items-center justify-center text-[8px]"
              style={{ borderColor: 'var(--df-text-soft)' }}
            >
              i
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {/* User 1 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text)' }}
                >
                  <FiUsers size={14} />
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--df-text)' }}>
                  admin@arithwise.com
                </span>
              </div>
              <button
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--df-text-soft)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--df-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--df-text-soft)')}
              >
                Can Manage
              </button>
            </div>

            {/* User 2 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text)' }}
                >
                  <FiUsers size={14} />
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--df-text)' }}>
                  Admins
                </span>
              </div>
              <button className="text-sm font-medium cursor-not-allowed" style={{ color: 'var(--df-text-muted)' }}>
                Can Manage <span className="opacity-60">(inherited)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pt-2 flex items-center gap-4">
          <button
            onClick={handleCopyLink}
            className="text-[13px] font-semibold flex items-center gap-1.5 transition-opacity"
            style={{ color: 'var(--df-icon-accent)' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <FiLink size={14} /> Copy link
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
