import React, { useState, useEffect } from 'react';
import { FiLayers, FiX, FiDatabase, FiType, FiLoader } from 'react-icons/fi';
import { catalogs as catalogApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const CreateSchemaModal = ({ isOpen, onClose, onCreated, initialCatalog = '' }) => {
  const toast = useToast();
  const [catalogList, setCatalogList] = useState([]);
  const [selectedCatalog, setSelectedCatalog] = useState(initialCatalog);
  const [schemaName, setSchemaName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedCatalog(initialCatalog || '');
      const fetchCatalogs = async () => {
        setIsLoading(true);
        try {
          const data = await catalogApi.list();
          // Ensure etldb is always present in the list
          const list = data || [];
          if (!list.find(c => c.name.toLowerCase() === 'etldb')) {
            list.unshift({ id: 'default-etldb', name: 'etldb' });
          }
          setCatalogList(list);
          
          // If no initial catalog but we have a list, default to etldb if it exists
          if (!initialCatalog) {
            const etldb = list.find(c => c.name.toLowerCase() === 'etldb');
            if (etldb) setSelectedCatalog(etldb.name);
          }
        } catch (err) {
          toast.error('Failed to load catalogs');
        } finally {
          setIsLoading(false);
        }
      };
      fetchCatalogs();
    }
  }, [isOpen, initialCatalog]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!selectedCatalog || !schemaName.trim()) {
      toast.error('Please select a catalog and enter a schema name');
      return;
    }

    setIsSubmitting(true);
    try {
      await catalogApi.createSchema(schemaName.trim(), selectedCatalog);
      toast.success(`Schema "${schemaName}" created in catalog "${selectedCatalog}"`);
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create schema');
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
            <FiLayers size={18} style={{ color: 'var(--df-accent)' }} />
            <h3 className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--df-strong)', margin: 0 }}>Create Schema</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Form Content Area */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Catalog Selection */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-soft)', marginBottom: '8px' }}>
              Parent Catalog
            </label>
            <div className="relative">
              <FiDatabase className="absolute opacity-40" size={14} style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--df-text)', pointerEvents: 'none' }} />
              <select
                value={selectedCatalog}
                onChange={(e) => setSelectedCatalog(e.target.value)}
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
                <option value="">{isLoading ? 'Loading catalogs...' : 'Select Catalog'}</option>
                {catalogList.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Schema Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-soft)', marginBottom: '8px' }}>
              Schema Name
            </label>
            <div className="relative">
              <FiType className="absolute opacity-40" size={14} style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--df-text)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="e.g. analytics_v1"
                value={schemaName}
                onChange={(e) => setSchemaName(e.target.value)}
                className="w-full border text-[13px] font-medium outline-none transition-all focus:border-[var(--df-accent)]"
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
            disabled={isSubmitting || !selectedCatalog || !schemaName.trim()}
            className="transition-colors disabled:opacity-50 text-[13px] font-bold"
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none',
              backgroundColor: 'var(--df-accent)', 
              color: 'white', 
              cursor: (!isSubmitting && selectedCatalog && schemaName.trim()) ? 'pointer' : 'default' 
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Schema'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateSchemaModal;
