import React, { useState, useRef, useEffect } from 'react';
import { FiUploadCloud, FiX, FiFile, FiLoader, FiCheck, FiBox } from 'react-icons/fi';
import { volumes as volumeApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const ACCEPTED_TYPES = ['.csv', '.json', '.tsv', '.txt', '.parquet'];

const VolumeUploadModal = ({ isOpen, onClose, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  
  const [volumeList, setVolumeList] = useState([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState('');
  const [isLoadingVolumes, setIsLoadingVolumes] = useState(false);

  const inputRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      const fetchVolumes = async () => {
        setIsLoadingVolumes(true);
        try {
          const data = await volumeApi.list();
          setVolumeList(data || []);
        } catch (err) {
          toast.error('Failed to load volumes');
        } finally {
          setIsLoadingVolumes(false);
        }
      };
      fetchVolumes();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = async () => {
    if (!file || !selectedVolumeId) return;
    setIsUploading(true);
    try {
      const result = await volumeApi.upload(selectedVolumeId, file);
      setUploadDone(true);
      toast.success(`Uploaded ${file.name} to volume successfully`);
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full shadow-2xl border" style={{ maxWidth: '420px', borderRadius: '12px', overflow: 'hidden', backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b" style={{ padding: '16px 24px', borderColor: 'var(--df-border)' }}>
          <div className="flex items-center gap-3">
            <FiUploadCloud size={18} style={{ color: 'var(--df-icon-accent)' }} />
            <h3 className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--df-strong)', margin: 0 }}>Upload to Volume</h3>
          </div>
          <button onClick={resetAndClose} className="p-1.5 rounded-lg transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--df-text)', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Volume Selection */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-text-soft)', marginBottom: '8px' }}>
              Select Destination Volume
            </label>
            <div className="relative">
              <FiBox className="absolute opacity-40" size={14} style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--df-text)', pointerEvents: 'none' }} />
              <select
                value={selectedVolumeId}
                onChange={(e) => setSelectedVolumeId(e.target.value)}
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
                <option value="">{isLoadingVolumes ? 'Loading...' : 'Select Volume'}</option>
                {volumeList.map(vol => (
                  <option key={vol.id} value={vol.id}>
                    {vol.catalog_name}.{vol.schema_name}.{vol.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            className="text-center cursor-pointer transition-all"
            style={{
              padding: '32px 24px',
              borderRadius: '8px',
              border: `2px dashed ${isDragging ? 'var(--df-accent)' : 'var(--df-border)'}`,
              backgroundColor: isDragging ? 'var(--df-accent-soft)' : 'var(--df-bg-secondary)',
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) setFile(e.target.files[0]); }}
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
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-[10px] font-medium uppercase border-0 bg-transparent cursor-pointer" style={{ color: 'var(--df-text-muted)' }}>
                  Change file
                </button>
              </div>
            ) : (
              <>
                <FiUploadCloud size={32} className="mx-auto mb-3" style={{ color: isDragging ? 'var(--df-accent)' : 'var(--df-text-muted)' }} />
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--df-strong)' }}>
                  Drag & drop a file here
                </p>
                <p className="text-xs" style={{ color: 'var(--df-text-muted)', margin: 0 }}>
                  Supports CSV, JSON, TSV, Parquet
                </p>
              </>
            )}
          </div>
        </div>

        {/* Footer Area */}
        <div className="flex items-center justify-end border-t" style={{ padding: '16px 24px', gap: '12px', borderColor: 'var(--df-border)', backgroundColor: 'var(--df-bg-secondary)' }}>
          <button onClick={resetAndClose} className="text-[13px] font-bold transition-all opacity-60 hover:opacity-100" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: 'var(--df-text)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || !selectedVolumeId || isUploading || uploadDone}
            className="transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-[13px] font-bold"
            style={{ 
              padding: '10px 24px', 
              borderRadius: '8px', 
              border: 'none',
              backgroundColor: 'var(--df-accent)', 
              color: 'white', 
              cursor: (!file || !selectedVolumeId || isUploading || uploadDone) ? 'default' : 'pointer' 
            }}
          >
            {isUploading ? <><FiLoader size={12} className="animate-spin" /> Uploading...</> : <>Upload</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VolumeUploadModal;
