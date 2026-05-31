import React, { useState } from 'react';
import { FiBox, FiX, FiDatabase, FiLayers, FiType } from 'react-icons/fi';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';

const CreateVolumeModal = ({ isOpen, onClose, onCreated }) => {
  const { catalogs } = useData();
  const toast = useToast();
  
  const [selectedCatalog, setSelectedCatalog] = useState('');
  const [selectedSchema, setSelectedSchema] = useState('');
  const [volumeName, setVolumeName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const catalogNames = Object.keys(catalogs || {});
  const schemas = selectedCatalog ? Object.keys(catalogs[selectedCatalog] || {}) : [];

  const handleCreate = async () => {
    if (!selectedCatalog || !selectedSchema || !volumeName) {
      toast.error('Please fill all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { volumes: volumeApi } = await import('../../services/api');
      await volumeApi.create({
        name: volumeName,
        catalog_name: selectedCatalog,
        schema_name: selectedSchema
      });
      toast.success(`Volume "${volumeName}" created in ${selectedCatalog}.${selectedSchema}`);
      onCreated?.({ name: volumeName, catalog: selectedCatalog, schema: selectedSchema });
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create volume');
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
            <FiBox size={18} style={{ color: 'var(--df-accent)' }} />
            <h3 className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--df-strong)', margin: 0 }}>Create Volume</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Catalog Select */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-soft)', marginBottom: '8px' }}>
              Catalog
            </label>
            <div className="relative">
              <FiDatabase className="absolute opacity-40" size={14} style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--df-text)', pointerEvents: 'none' }} />
              <select
                value={selectedCatalog}
                onChange={(e) => { setSelectedCatalog(e.target.value); setSelectedSchema(''); }}
                className="w-full border text-[13px] font-medium outline-none transition-all appearance-none"
                style={{ 
                  padding: '0 16px 0 36px', 
                  height: '42px',
                  borderRadius: '8px', 
                  backgroundColor: 'var(--df-panel)', 
                  borderColor: 'var(--df-border)', 
                  color: 'var(--df-text)',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select Catalog</option>
                {catalogNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Schema Select */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-soft)', marginBottom: '8px' }}>
              Schema
            </label>
            <div className="relative">
              <FiLayers className="absolute opacity-40" size={14} style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--df-text)', pointerEvents: 'none' }} />
              <select
                disabled={!selectedCatalog}
                value={selectedSchema}
                onChange={(e) => setSelectedSchema(e.target.value)}
                className="w-full border text-[13px] font-medium outline-none transition-all appearance-none disabled:opacity-50"
                style={{ 
                  padding: '0 16px 0 36px', 
                  height: '42px',
                  borderRadius: '8px', 
                  backgroundColor: 'var(--df-panel)', 
                  borderColor: 'var(--df-border)', 
                  color: 'var(--df-text)',
                  cursor: !selectedCatalog ? 'default' : 'pointer'
                }}
              >
                <option value="">Select Schema</option>
                {schemas.map(sch => <option key={sch} value={sch}>{sch}</option>)}
              </select>
            </div>
          </div>

          {/* Volume Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-soft)', marginBottom: '8px' }}>
              Volume Name
            </label>
            <div className="relative">
              <FiType className="absolute opacity-40" size={14} style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--df-text)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="e.g. data_processing_volume"
                value={volumeName}
                onChange={(e) => setVolumeName(e.target.value)}
                className="w-full border text-[13px] font-medium outline-none transition-all"
                style={{ 
                  padding: '0 16px 0 36px', 
                  height: '42px',
                  borderRadius: '8px', 
                  backgroundColor: 'var(--df-panel)', 
                  borderColor: 'var(--df-border)', 
                  color: 'var(--df-text)' 
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer Area */}
        <div className="flex items-center justify-end border-t" style={{ padding: '16px 24px', gap: '12px', borderColor: 'var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={onClose} className="text-[13px] font-bold transition-all opacity-60 hover:opacity-100" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: 'var(--df-text)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !volumeName}
            className="transition-colors disabled:opacity-50 text-[13px] font-bold"
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none',
              backgroundColor: 'var(--df-accent)', 
              color: 'white', 
              cursor: (!isSubmitting && volumeName) ? 'pointer' : 'default' 
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Volume'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateVolumeModal;
