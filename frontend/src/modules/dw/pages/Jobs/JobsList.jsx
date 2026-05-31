import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../../context/JobsContext';
import { FiPlus, FiSearch, FiGitBranch, FiLayers, FiChevronDown, FiCode } from 'react-icons/fi';
import { JobsTableRow } from '../../components/jobs/JobsTableRow';

const JobsList = () => {
  const { jobs, deleteJob } = useJobs();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setCreateOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const tabs = ['All', 'Jobs', 'Pipelines', 'Runs'];

  const filtered = jobs.filter(job => {
    const matchesTab = activeTab === 'All' || (activeTab === 'Jobs' && job.type === 'Job') || (activeTab === 'Pipelines' && job.type === 'Pipeline');
    const matchesSearch = job.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleDelete = async (e, jobId, jobName) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${jobName}"? This will remove all run history and cannot be undone.`)) {
      await deleteJob(jobId);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: 'var(--df-bg)' }}>
      {/* ── Heading Row ── */}
      <div style={{ padding: '20px 24px 14px 20px', borderBottom: '1px solid var(--df-border-light)', backgroundColor: 'var(--df-bg)', flexShrink: 0 }}>
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3" style={{ color: 'var(--df-strong)', margin: 0 }}>
              Jobs & Pipelines
            </h1>
            <p className="text-[14px] mt-1" style={{ color: 'var(--df-text-muted)', opacity: 0.8, margin: 0 }}>Manage and monitor your data workflows</p>
          </div>

          <div className="relative flex-shrink-0" ref={dropdownRef}>
            <button 
              onClick={() => setCreateOpen(!createOpen)} 
              style={{
                backgroundColor: 'var(--df-accent)',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15, 82, 186, 0.15)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--df-accent-alt)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--df-accent)'}
            >
              <FiPlus size={16} strokeWidth={3} /> Create
              <FiChevronDown size={14} style={{ marginLeft: 2, transition: 'transform 0.2s', transform: createOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {createOpen && (
              <div 
                className="absolute right-0 mt-2 w-[290px] rounded-2xl overflow-hidden z-50" 
                style={{ 
                  backgroundColor: 'var(--df-bg)', 
                  border: '1px solid var(--df-border)', 
                  boxShadow: '0 10px 30px rgba(0,0,0,0.08)' 
                }}
              >
                <div className="flex flex-col">
                  {/* Job Option */}
                  <button 
                    onClick={() => { setCreateOpen(false); navigate('/dw/jobs/create-job'); }} 
                    className="w-full flex items-center gap-4 px-4.5 py-4 text-left transition-colors hover:bg-[var(--df-bg-secondary)]"
                  >
                    <div className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                      <FiCode size={18} style={{ color: 'var(--df-accent)' }} />
                    </div>
                    <div>
                      <div className="font-semibold text-[14px]" style={{ color: 'var(--df-strong)' }}>Job</div>
                      <div className="text-[12px] mt-0.5" style={{ color: 'var(--df-text-muted)', lineHeight: '1.4' }}>Single SQL task execution</div>
                    </div>
                  </button>

                  {/* Divider line */}
                  <div style={{ borderTop: '1px solid var(--df-border-light)' }} />

                  {/* Pipeline Option */}
                  <button 
                    onClick={() => { setCreateOpen(false); navigate('/dw/jobs/create'); }} 
                    className="w-full flex items-center gap-4 px-4.5 py-4 text-left transition-colors hover:bg-[var(--df-bg-secondary)]"
                  >
                    <div className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                      <FiGitBranch size={18} style={{ color: 'var(--df-accent)' }} />
                    </div>
                    <div>
                      <div className="font-semibold text-[14px]" style={{ color: 'var(--df-strong)' }}>Pipeline</div>
                      <div className="text-[12px] mt-0.5" style={{ color: 'var(--df-text-muted)', lineHeight: '1.4' }}>Multi-task DAG with dependencies</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs + Search Row ── */}
      <div className="flex items-center justify-between" style={{ padding: '16px 32px 16px 24px', borderBottom: '1px solid var(--df-border-light)', flexShrink: 0 }}>
        <div className="flex items-center gap-4">
          {tabs.map(tab => (
            <button 
              key={tab} 
              onClick={() => { if (tab === 'Runs') { navigate('/dw/runs'); return; } setActiveTab(tab); }} 
              className="flex items-center gap-2.5 rounded-full text-[13px] font-semibold transition-all hover:opacity-80" 
              style={{ 
                padding: '8px 20px',
                backgroundColor: activeTab === tab ? 'var(--df-accent-soft)' : 'transparent', 
                color: activeTab === tab ? 'var(--df-text-accent)' : 'var(--df-text-soft)',
                border: activeTab === tab ? '1px solid var(--df-accent-medium, transparent)' : '1px solid transparent'
              }}
            >
              <span>{tab}</span>
              {tab !== 'Runs' && (
                <span className="text-[12px] font-bold px-2 py-0.5 rounded-md" style={{ 
                  backgroundColor: activeTab === tab ? 'var(--df-accent-medium)' : 'var(--df-bg-secondary)', 
                  color: activeTab === tab ? 'var(--df-text-accent)' : 'var(--df-text-muted)',
                  border: activeTab === tab ? 'none' : '1px solid var(--df-border-light)'
                }}>
                  {tab === 'All' ? jobs?.length || 0 : tab === 'Jobs' ? (jobs || []).filter(j => j.type === 'Job').length : (jobs || []).filter(j => j.type === 'Pipeline').length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative group">
          <FiSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--df-text-muted)', zIndex: 1 }} />
          <input 
            type="text" 
            placeholder="Search jobs..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="rounded-xl py-2.5 text-[14px] outline-none transition-all focus:ring-2 focus:ring-[var(--df-accent-soft)] shadow-sm hover:shadow-md" 
            style={{ width: 280, paddingLeft: '42px', paddingRight: '16px', border: '1px solid var(--df-border)', backgroundColor: 'var(--df-bg-secondary)', color: 'var(--df-text)' }}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="df-table" style={{ width: '100%' }}>
          <thead>
            <tr><th style={{ paddingLeft: 20 }}>Name</th><th>Type</th><th>Status</th><th>Schedule</th><th>Last Run</th><th>Owner</th><th>Tasks</th><th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--df-text-muted)' }}>
                    <FiLayers size={28} style={{ opacity: 0.25, marginBottom: 12 }} />
                    <h3 className="text-[15px] font-semibold" style={{ color: 'var(--df-strong)' }}>No jobs found</h3>
                    <p className="text-[13px] mt-1" style={{ color: 'var(--df-text-muted)' }}>Try adjusting your search or create a new job.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(job => <JobsTableRow key={job.id} job={job} navigate={navigate} handleDelete={handleDelete} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JobsList;
