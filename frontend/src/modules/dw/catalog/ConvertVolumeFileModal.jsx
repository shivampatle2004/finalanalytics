import React, { useState, useEffect } from 'react';
import { FiX, FiCheck, FiLoader, FiLayers, FiDatabase, FiFileText } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { useToast } from '../../../shared/context/ToastContext';

const ConvertVolumeFileModal = ({ isOpen, onClose, file, onConverted }) => {
  const { catalogs } = useData();
  const toast = useToast();
  const [selectedCatalog, setSelectedCatalog] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedCatalog('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !file) return null;

  const catalogNames = Object.keys(catalogs || {});

  const handleConvert = async () => {
    if (!selectedCatalog) {
      toast.error('Please select a target catalog');
      return;
    }

    setIsSubmitting(true);
    try {
      const { volumes: volumeApi } = await import('../../../shared/services/api');
      const result = await volumeApi.convert(file.id, selectedCatalog);
      
      toast.success(`Converted successfully! Saved to table: ${result.full_path}`);
      onConverted?.(result);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to convert file');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)' }}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--df-border)' }}>
          <div className="flex items-center gap-2">
            <FiLayers size={18} style={{ color: 'var(--df-accent)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--df-strong)' }}>Convert File to Table</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors hover:bg-black/5" style={{ color: 'var(--df-text-muted)' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* File Information */}
          <div className="p-3 rounded-xl flex items-center gap-3 border bg-[var(--df-bg-secondary)]" style={{ borderColor: 'var(--df-border)' }}>
            <FiFileText size={20} style={{ color: 'var(--df-accent)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold truncate" style={{ color: 'var(--df-strong)' }}>{file.filename || file.name}</p>
              <p className="text-[10px] opacity-60 uppercase font-bold tracking-tight mt-0.5">
                {file.file_type} • {file.size_formatted || `${(file.size_bytes / 1024).toFixed(1)} KB`}
              </p>
            </div>
          </div>

          {/* Catalog Select */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-50" style={{ color: 'var(--df-text)' }}>
              Select Destination Catalog
            </label>
            <div className="relative">
              <FiDatabase className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <select
                value={selectedCatalog}
                onChange={(e) => setSelectedCatalog(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-accent/20 appearance-none"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              >
                <option value="">Select Catalog</option>
                {catalogNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--df-text-muted)' }}>
              The file data will be processed and stored as a structured table in the <strong style={{ color: 'var(--df-strong)' }}>bronze</strong> schema of the selected catalog.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-black/5" style={{ color: 'var(--df-text-soft)' }}>
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={isSubmitting || !selectedCatalog}
            className="px-6 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            style={{ backgroundColor: 'var(--df-accent)', color: 'white' }}
          >
            {isSubmitting ? (
              <><FiLoader size={12} className="animate-spin" /> Converting...</>
            ) : (
              'Convert'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConvertVolumeFileModal;
