import React, { useState, useRef, useEffect } from 'react';
import { FiUploadCloud, FiX, FiFile, FiLoader, FiCheck, FiBox, FiDatabase } from 'react-icons/fi';
import { volumes as volumeApi } from '../../../shared/services/api';
import { useData } from '../context/DataContext';
import { useToast } from '../../../shared/context/ToastContext';

const ACCEPTED_TYPES = ['.csv', '.json', '.tsv', '.txt', '.parquet'];

const VolumeUploadModal = ({ isOpen, onClose, onUploaded, initialVolumeId }) => {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  
  const [volumeList, setVolumeList] = useState([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState('');
  const [isLoadingVolumes, setIsLoadingVolumes] = useState(false);

  // Convert options
  const [convertAfterUpload, setConvertAfterUpload] = useState(false);
  const { catalogs } = useData();
  const catalogNames = Object.keys(catalogs || {});

  const inputRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setIsUploading(false);
      setUploadDone(false);
      setConvertAfterUpload(false);
      setSelectedVolumeId('');
      
      const fetchVolumes = async () => {
        setIsLoadingVolumes(true);
        try {
          const data = await volumeApi.list();
          setVolumeList(data || []);
          
          if (initialVolumeId) {
            setSelectedVolumeId(initialVolumeId);
          }
        } catch (err) {
          toast.error('Failed to load volumes');
        } finally {
          setIsLoadingVolumes(false);
        }
      };
      fetchVolumes();
    }
  }, [isOpen, initialVolumeId]);

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (selected) setFile(selected);
  };

  const handleUpload = async () => {
    if (!file || !selectedVolumeId) return;
    setIsUploading(true);
    try {
      const result = await volumeApi.upload(selectedVolumeId, file);
      
      // If convert option is selected, convert immediately
      if (convertAfterUpload && result?.id) {
        try {
          // Infer the target catalog automatically from the selected volume
          const targetCatalog = volumeList.find(v => v.id === selectedVolumeId)?.catalog_name || '';
          const convertResult = await volumeApi.convert(result.id, targetCatalog);
          toast.success(`Uploaded & converted to table: ${convertResult.full_path}`);
        } catch (convErr) {
          toast.error(`File uploaded, but conversion failed: ${convErr.message}`);
        }
      } else {
        toast.success(`Uploaded ${file.name} to volume successfully`);
      }

      setUploadDone(true);
      setTimeout(() => {
        onUploaded?.(result);
        resetAndClose();
      }, 1200);
    } catch (err) {
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
      setIsUploading(false);
    }
  };

  const resetAndClose = () => {
    setFile(null);
    setIsUploading(false);
    setUploadDone(false);
    setSelectedVolumeId('');
    setConvertAfterUpload(false);
    onClose();
  };

  const canUpload = file && selectedVolumeId && !isUploading && !uploadDone;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center animate-fadeIn"
      style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) resetAndClose(); }}
    >
      <div 
        className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col"
        style={{ 
          backgroundColor: 'var(--df-card-bg)', 
          border: '1px solid var(--df-border)',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="px-6 py-4 flex items-center justify-between flex-shrink-0" 
          style={{ borderBottom: '1px solid var(--df-border)' }}
        >
          <div className="flex items-center gap-2">
            <FiUploadCloud size={18} style={{ color: 'var(--df-icon-accent)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--df-strong)' }}>Upload to Volume</h3>
          </div>
          <button 
            onClick={resetAndClose} 
            className="p-1.5 rounded-md transition-colors hover:bg-black/5" 
            style={{ color: 'var(--df-text-muted)' }}
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1" style={{ minHeight: 0 }}>
          {/* Volume Selection (Grouped by Catalog) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-50" style={{ color: 'var(--df-text)' }}>
              Select Destination Volume
            </label>
            <div className="relative">
              <FiBox className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={14} style={{ color: 'var(--df-text)' }} />
              <select
                value={selectedVolumeId}
                onChange={(e) => setSelectedVolumeId(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-accent/20 appearance-none"
                style={{ backgroundColor: 'var(--df-panel)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              >
                <option value="">{isLoadingVolumes ? 'Loading...' : 'Select Volume'}</option>
                {catalogNames.map(cat => (
                  <optgroup key={cat} label={`Catalog: ${cat}`}>
                    {volumeList.filter(vol => vol.catalog_name === cat).map(vol => (
                      <option key={vol.id} value={vol.id}>
                        {vol.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {/* Fallback for volumes with unknown catalogs */}
                {volumeList.filter(vol => !catalogNames.includes(vol.catalog_name)).length > 0 && (
                  <optgroup label="Other Volumes">
                    {volumeList.filter(vol => !catalogNames.includes(vol.catalog_name)).map(vol => (
                      <option key={vol.id} value={vol.id}>
                        {vol.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            className="rounded-xl p-8 text-center cursor-pointer transition-all"
            style={{
              border: `2px dashed ${isDragging ? 'var(--df-accent)' : 'var(--df-border)'}`,
              backgroundColor: isDragging ? 'var(--df-accent-soft)' : 'var(--df-bg-secondary)',
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={handleFileSelect}
            />
            {uploadDone ? (
              <div className="animate-fadeIn">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--df-success-soft, #D1FAE5)' }}>
                  <FiCheck size={24} style={{ color: 'var(--df-success, #059669)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--df-success, #059669)' }}>Upload Complete!</p>
              </div>
            ) : file ? (
              <div className="animate-fadeIn">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                  <FiFile size={24} style={{ color: 'var(--df-icon-accent)' }} />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--df-strong)' }}>{file.name}</p>
                <p className="text-xs mb-3" style={{ color: 'var(--df-text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); }} 
                  className="text-[10px] font-medium uppercase px-3 py-1 rounded-lg border transition-all hover:bg-black/5" 
                  style={{ color: 'var(--df-text-muted)', borderColor: 'var(--df-border)' }}
                >
                  Change file
                </button>
              </div>
            ) : (
              <>
                <FiUploadCloud size={32} className="mx-auto mb-3" style={{ color: isDragging ? 'var(--df-accent)' : 'var(--df-text-muted)' }} />
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--df-strong)' }}>
                  Drag & drop a file here
                </p>
                <p className="text-xs" style={{ color: 'var(--df-text-muted)' }}>
                  Supports CSV, JSON, TSV, Parquet
                </p>
              </>
            )}
          </div>

          {/* Convert Option - only show when file is selected and is CSV/JSON */}
          {file && ['csv', 'json'].includes(file.name.split('.').pop()?.toLowerCase()) && (
            <div className="rounded-xl p-4 border transition-all" style={{ 
              borderColor: convertAfterUpload ? 'var(--df-accent)' : 'var(--df-border)', 
              backgroundColor: convertAfterUpload ? 'var(--df-accent-soft)' : 'var(--df-bg-secondary)' 
            }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={convertAfterUpload}
                  onChange={(e) => setConvertAfterUpload(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <div>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--df-strong)' }}>
                    Convert to table after upload
                  </span>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--df-text-muted)' }}>
                    {selectedVolumeId 
                      ? `Data will be automatically stored in the bronze schema of the '${volumeList.find(v => v.id === selectedVolumeId)?.catalog_name || 'selected'}' catalog` 
                      : 'Data will be stored in the bronze schema of the selected catalog'}
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Footer - always visible */}
        <div 
          className="px-6 py-3 flex items-center justify-end gap-2 flex-shrink-0" 
          style={{ 
            borderTop: '1px solid var(--df-border)', 
            backgroundColor: 'var(--df-bg-secondary)'
          }}
        >
          <button 
            onClick={resetAndClose} 
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-black/5" 
            style={{ color: 'var(--df-text-soft)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            style={{ 
              backgroundColor: canUpload ? 'var(--df-accent)' : 'var(--df-border)', 
              color: canUpload ? 'white' : 'var(--df-text-muted)',
              opacity: canUpload ? 1 : 0.5,
              cursor: canUpload ? 'pointer' : 'not-allowed',
              pointerEvents: 'auto'
            }}
          >
            {isUploading ? <><FiLoader size={12} className="animate-spin" /> Uploading...</> : <>
              <FiUploadCloud size={12} /> Upload
            </>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VolumeUploadModal;
