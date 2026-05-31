import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../../context/JobsContext';
import { useToast } from '../../context/ToastContext';
import { FiArrowLeft, FiGitBranch, FiInfo, FiChevronDown, FiChevronRight, FiSettings } from 'react-icons/fi';
import ScheduleConfigurator from '../../components/jobs/ScheduleConfigurator';
import JobParameters from '../../components/jobs/JobParameters';

const CreateJob = () => {
  const navigate = useNavigate();
  const { addJob } = useJobs();
  const toast = useToast();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    parameters: [],
    retryCount: 0,
    timeout: 3600,
    scheduleType: 'none',
    scheduleInterval: '',
    scheduleTime: '',
    scheduleDay: 'Monday',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    let schedule = { type: 'none', value: '' };
    if (form.scheduleType === 'interval') schedule = { type: 'interval', value: form.scheduleInterval };
    else if (form.scheduleType === 'daily') schedule = { type: 'daily', value: form.scheduleTime };
    else if (form.scheduleType === 'weekly') schedule = { type: 'weekly', value: `${form.scheduleDay} ${form.scheduleTime}` };

    const resultId = await addJob({
      name: form.name,
      type: 'Pipeline',
      description: form.description,
      schedule,
      parameters: form.parameters.filter(p => p.key.trim()),
      tasks: [],  // No tasks at creation — added from Job Detail page
    });

    if (resultId) {
      // Redirect to the Pipeline Detail page to add tasks
      navigate(`/jobs/${resultId}`);
      toast?.success?.(`Pipeline "${form.name}" created! Now add tasks to build your DAG.`);
    }
  };

    return (
        <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: 'var(--df-bg-secondary)' }}>
            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto df-scrollbar" style={{ padding: '32px 40px' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    {/* Back to Jobs Link (accent color) */}
                    <button 
                        onClick={() => navigate('/dw/jobs')} 
                        className="flex items-center gap-1.5 text-[14px] font-semibold mb-6 transition-colors hover:opacity-85" 
                        style={{ color: 'var(--df-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                        <FiArrowLeft size={16} /> Back to Jobs
                    </button>

                    {/* The main card */}
                    <div style={{
                        backgroundColor: 'var(--df-bg)',
                        border: '1px solid var(--df-border)',
                        borderRadius: '12px',
                        padding: '48px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        {/* Header Row */}
                        <div className="flex items-center gap-4 mb-7">
                            <div style={{
                                backgroundColor: 'var(--df-accent-soft)',
                                color: 'var(--df-accent)',
                                borderRadius: '8px',
                                width: '44px',
                                height: '44px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                                fontWeight: 700
                            }}>
                                <FiGitBranch size={20} />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--df-strong)', margin: 0 }}>
                                    Create New Pipeline
                                </h1>
                                <p className="text-[14px]" style={{ color: 'var(--df-text-muted)', margin: '6px 0 0 0' }}>
                                    Define a multi-task workflow. You'll add tasks and connect dependencies after creation.
                                </p>
                            </div>
                        </div>

                        {/* Info Banner */}
                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg mb-10" style={{ backgroundColor: 'var(--df-accent-soft)', border: '1px solid var(--df-accent-medium)' }}>
                            <FiInfo size={15} className="shrink-0" style={{ color: 'var(--df-accent)' }} />
                            <div className="text-[12px] leading-none font-medium" style={{ color: 'var(--df-accent)' }}>
                                Workflow: Create Pipeline → Add Tasks → Connect Dependencies → Run
                            </div>
                        </div>

                        <form id="create-pipeline-form" onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10">
                                {/* Left Column (3/5 width) */}
                                <div className="lg:col-span-3 space-y-8">
                                    <div>
                                        <label className="df-label block text-[13px] font-semibold mb-2.5" style={{ color: 'var(--df-strong)' }}>
                                            Pipeline Name <span style={{ color: 'var(--df-accent)' }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="df-input w-full"
                                            placeholder="e.g., Daily Sales ETL Pipeline"
                                            value={form.name}
                                            onChange={e => setForm({ ...form, name: e.target.value })}
                                            style={{ padding: '14px 18px', borderRadius: '8px', fontSize: '14px' }}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="df-label block text-[13px] font-semibold mb-2.5" style={{ color: 'var(--df-strong)' }}>
                                            Description
                                        </label>
                                        <textarea
                                            className="df-input w-full"
                                            rows={6}
                                            placeholder="What does this data workflow accomplish?"
                                            value={form.description}
                                            onChange={e => setForm({ ...form, description: e.target.value })}
                                            style={{ padding: '14px 18px', borderRadius: '8px', fontSize: '14px', resize: 'none' }}
                                        />
                                    </div>
                                </div>

                                {/* Right Column (2/5 width) */}
                                <div className="lg:col-span-2 space-y-8">
                                    {/* Schedule card */}
                                    <div style={{ backgroundColor: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: '12px', padding: '28px' }}>
                                        <ScheduleConfigurator form={form} setForm={setForm} />
                                    </div>

                                    {/* Global Parameters card */}
                                    <div style={{ backgroundColor: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: '12px', padding: '28px' }}>
                                        <JobParameters form={form} setForm={setForm} />
                                    </div>
                                </div>
                            </div>

                            {/* Advanced Settings */}
                            <div className="pt-8 mb-8" style={{ borderTop: '1px solid var(--df-border-light)' }}>
                                <button
                                    type="button"
                                    onClick={() => setAdvancedOpen(!advancedOpen)}
                                    className="flex items-center gap-2 text-left transition-colors"
                                    style={{ color: 'var(--df-text-muted)' }}
                                >
                                    {advancedOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                                    <FiSettings size={13} />
                                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--df-strong)' }}>Default Task Settings</span>
                                </button>

                                {advancedOpen && (
                                    <div className="grid grid-cols-2 gap-6 mt-6 max-w-md">
                                        <div>
                                            <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Default Retry Count</label>
                                            <input
                                                type="number"
                                                min="0" max="10"
                                                className="df-input text-sm"
                                                value={form.retryCount}
                                                onChange={e => setForm({ ...form, retryCount: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Default Timeout (sec)</label>
                                            <input
                                                type="number"
                                                min="30"
                                                className="df-input text-sm"
                                                value={form.timeout}
                                                onChange={e => setForm({ ...form, timeout: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions Row at Bottom */}
                            <div className="flex items-center gap-4 mt-10">
                                <button type="submit" style={{
                                    backgroundColor: 'var(--df-accent)',
                                    color: 'white',
                                    borderRadius: '8px',
                                    padding: '14px 28px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s, transform 0.1s'
                                }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--df-accent-alt)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--df-accent)'}>
                                    <FiGitBranch size={15} /> Create Pipeline & Add Tasks →
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => navigate('/dw/jobs')} 
                                    style={{
                                        backgroundColor: 'var(--df-bg)',
                                        color: 'var(--df-strong)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--df-border)',
                                        padding: '14px 28px',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }} 
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--df-bg-secondary)'} 
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--df-bg)'}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateJob;
