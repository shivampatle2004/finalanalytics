import React, { useState } from 'react';
import { FiDatabase, FiX, FiType } from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';

const CreateCatalogModal = ({ isOpen, onClose, onCreated }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const { catalogs: catalogApi } = await import('../../services/api');
      await catalogApi.create(name.trim());
      toast.success(`Catalog "${name}" created successfully`);
      onCreated?.({ name: name.trim() });
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create catalog');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full shadow-2xl border" style={{ maxWidth: '420px', borderRadius: '12px', overflow: 'hidden', backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b" style={{ padding: '16px 24px', borderColor: 'var(--df-border)' }}>
          <div className="flex items-center gap-3">
            <FiDatabase size={18} style={{ color: 'var(--df-accent)' }} />
            <h3 className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--df-strong)', margin: 0 }}>Create Catalog</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div style={{ padding: '24px' }}>
          <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-soft)', marginBottom: '8px' }}>
            Catalog Name
          </label>
          <div className="relative">
            <FiType className="absolute opacity-40" size={14} style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--df-text)', pointerEvents: 'none' }} />
            <input
              autoFocus
              type="text"
              placeholder="e.g. Production_Data"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border text-[13px] font-medium outline-none transition-all focus:border-[var(--df-accent)]"
              style={{ 
                padding: '0 16px 0 36px', 
                height: '42px',
                borderRadius: '8px', 
                backgroundColor: 'var(--df-panel)', 
                borderColor: 'var(--df-border)', 
                color: 'var(--df-text)' 
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <p style={{ marginTop: '12px', fontSize: '11px', lineHeight: '1.5', color: 'var(--df-text-muted)', marginBlockEnd: 0 }}>
            Creating a catalog allows you to isolate and manage databases, schemas, and tables within a specific environment.
          </p>
        </div>

        {/* Footer Area */}
        <div className="flex items-center justify-end border-t" style={{ padding: '16px 24px', gap: '12px', borderColor: 'var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={onClose} className="text-[13px] font-bold transition-all opacity-60 hover:opacity-100" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: 'var(--df-text)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !name.trim()}
            className="transition-colors disabled:opacity-50 text-[13px] font-bold"
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none',
              backgroundColor: 'var(--df-accent)', 
              color: 'white', 
              cursor: (!isSubmitting && name.trim()) ? 'pointer' : 'default' 
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Catalog'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCatalogModal;
