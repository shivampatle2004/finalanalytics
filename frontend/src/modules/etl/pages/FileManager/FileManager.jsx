import React, { useState, useEffect, useCallback } from 'react';
import { UploadCloud, FileType, Trash2, Calendar, HardDrive, Search, Loader2, Download, FileOutput, ExternalLink, Database } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { api } from '../../services/api';
import { Tooltip } from '../../components/ui/Tooltip';
import './FileManager.css';

export function FileManager() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('inputs'); // 'inputs' or 'outputs'

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      let data;
      if (activeTab === 'inputs') {
        data = await api.getUploadedFiles();
      } else if (activeTab === 'outputs') {
        data = await api.getOutputFiles();
      } else {
        // Handle 'bronze', 'silver', 'gold' layers
        data = await api.getDataLakeFiles(activeTab);
      }
      setFiles(data);
    } catch (err) {
      console.error("Failed to load files", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      await api.uploadFile(file);
      if (activeTab === 'inputs') {
        await loadFiles();
      } else {
        setActiveTab('inputs');
      }
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = (file) => {
    if (activeTab === 'inputs') {
      api.downloadInputFile(file.filename);
    } else {
      api.downloadOutputFile(file.filename);
    }
  };

  const handleDelete = async (file) => {
    if (!confirm(`Delete "${file.original_filename}"? This cannot be undone.`)) return;
    try {
      if (activeTab === 'inputs') {
        await api.deleteInputFile(file.filename);
      } else {
        await api.deleteOutputFile(file.filename);
      }
      await loadFiles();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete file.");
    }
  };

  const filteredFiles = files.filter(f => 
    (f?.original_filename || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f?.extension || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="file-manager-container">
      <div className="page-header">
        <div>
          <h1>Files & Results <span className="count-badge">{files.length}</span></h1>
          <p>Manage input datasets and access exported pipeline results.</p>
        </div>
        <div className="page-header-actions">
          <button 
            className="btn btn-primary btn-md" 
            onClick={() => document.getElementById('fm-file-input').click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
            Upload Dataset
          </button>
          <input 
            id="fm-file-input" 
            type="file" 
            accept=".csv,.xlsx,.xls,.tsv,.db,.sqlite" 
            style={{ display: 'none' }} 
            onChange={handleFileUpload} 
          />
        </div>
      </div>

      <div className="fm-tab-controls">
        <button 
          className={`fm-tab-btn ${activeTab === 'inputs' ? 'active' : ''}`}
          onClick={() => setActiveTab('inputs')}
        >
          <HardDrive size={16} /> Input Datasets
        </button>
        <button 
          className={`fm-tab-btn ${activeTab === 'bronze' ? 'active' : ''}`}
          onClick={() => setActiveTab('bronze')}
        >
          <Database size={16} style={{ color: '#cd7f32' }} /> Bronze (Raw)
        </button>
        <button 
          className={`fm-tab-btn ${activeTab === 'silver' ? 'active' : ''}`}
          onClick={() => setActiveTab('silver')}
        >
          <Database size={16} style={{ color: '#c0c0c0' }} /> Silver (Clean)
        </button>
        <button 
          className={`fm-tab-btn ${activeTab === 'gold' ? 'active' : ''}`}
          onClick={() => setActiveTab('gold')}
        >
          <Database size={16} style={{ color: '#ffd700' }} /> Gold (Analytics)
        </button>
        <button 
          className={`fm-tab-btn ${activeTab === 'outputs' ? 'active' : ''}`}
          onClick={() => setActiveTab('outputs')}
        >
          <FileOutput size={16} /> Exports
        </button>
      </div>

      {activeTab === 'inputs' && (
        <div 
          className={`fm-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const dropFile = e.dataTransfer.files?.[0];
            if (dropFile) {
              handleFileUpload({ target: { files: [dropFile] } });
            }
          }}
          onClick={() => document.getElementById('fm-file-input').click()}
        >
          <UploadCloud size={32} className="fm-drop-icon" />
          <p>Drop a CSV, Excel, or Database (.db/.sqlite) file here or <span>click to browse</span></p>
        </div>
      )}

      <div className="pipeline-toolbar">
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="fm-content">
        {loading ? (
          <div className="loading-state">
            <Spinner size={32} />
            <p>Loading {activeTab}...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <EmptyState 
            title={searchQuery ? "No matching items" : `No ${activeTab} yet`}
            description={activeTab === 'inputs' 
              ? "Upload datasets to use them in your extractor nodes."
              : "Exported files from your pipelines will appear here."}
            icon={activeTab === 'inputs' ? HardDrive : FileOutput}
          />
        ) : (
          <div className="fm-grid">
            {filteredFiles.map((file, i) => {
              const isDb = ['.db', '.sqlite'].includes((file.extension || '').toLowerCase());
              
              return (
                <Card key={i} className="fm-card" hoverable glass>
                  <div className="fm-card-main">
                    <div className="fm-card-header">
                      <div className="fm-icon">
                        {isDb ? <Database size={24} className="text-primary" /> : <FileType size={24} />}
                      </div>
                      <div className="fm-info">
                        <Tooltip content={file.original_filename || file.path}>
                          <h3 className="truncate">{file.original_filename || file.path}</h3>
                        </Tooltip>
                        <span className="fm-badge">{activeTab.toUpperCase()}</span>
                      </div>
                    </div>
                    
                    <div className="fm-card-meta">
                      <div className="meta-item">
                        <HardDrive size={14} />
                        <span>{file.size_mb} MB</span>
                      </div>
                      <div className="meta-item">
                        <Calendar size={14} />
                        <span>{new Date(file.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="fm-card-actions">
                    <Tooltip content="Connect to Pipeline / Transform">
                      <button 
                        className="fm-action-btn transform" 
                        onClick={() => window.location.hash = `transform?source=${file.filename}&type=file`}
                      >
                        <ExternalLink size={16} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Download File">
                      <button 
                        className="fm-action-btn download" 
                        onClick={() => handleDownload(file)}
                      >
                        <Download size={16} />
                      </button>
                    </Tooltip>
                    {(activeTab === 'inputs' || activeTab === 'outputs') && (
                      <Tooltip content="Delete File">
                        <button 
                          className="fm-action-btn delete" 
                          onClick={() => handleDelete(file)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
