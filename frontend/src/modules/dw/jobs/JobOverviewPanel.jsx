import React, { useState, useEffect } from 'react';
import { useJobs } from '../context/JobsContext';
import { useToast } from '../../../shared/context/ToastContext';
import { FiCode, FiSave, FiSettings, FiChevronDown, FiChevronRight, FiBook, FiCheck, FiRefreshCw } from 'react-icons/fi';
import ScheduleConfigurator from './ScheduleConfigurator';
import JobParameters from './JobParameters';
import { workspace } from '../../../shared/services/api';

const JobOverviewPanel = ({ job, tasks }) => {
    const { updateJob, updateTask } = useJobs();
    const toast = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [executionType, setExecutionType] = useState('sql');
    const [notebooks, setNotebooks] = useState([]);
    const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(false);

    // Default to the first task since this is a Simple Job
    const primaryTask = tasks && tasks.length > 0 ? tasks[0] : null;

    const [form, setForm] = useState({
        name: '', description: '', query: '', notebookPath: '', parameters: [], retryCount: 0, timeout: 3600,
        scheduleType: 'none', scheduleInterval: '', scheduleTime: '', scheduleDay: 'Monday',
    });

    useEffect(() => {
        if (!job) return;
        if (isEditing) return; // Prevent overwriting while user is editing

        let scheduleType = 'none';
        let scheduleInterval = '';
        let scheduleTime = '';
        let scheduleDay = 'Monday';

        if (job.schedule) {
            scheduleType = job.schedule.type || 'none';
            if (scheduleType === 'interval') scheduleInterval = job.schedule.value || '';
            if (scheduleType === 'daily') scheduleTime = job.schedule.value || '';
            if (scheduleType === 'weekly' && job.schedule.value) {
                const parts = job.schedule.value.split(' ');
                scheduleDay = parts[0] || 'Monday';
                scheduleTime = parts[1] || '';
            }
        }

        const initialTaskType = primaryTask?.task_type || 'sql';
        setExecutionType(initialTaskType);

        setForm({
            name: job.name || '',
            description: job.description || '',
            parameters: job.parameters || [],
            query: primaryTask?.query || '',
            notebookPath: primaryTask?.notebook_path || '',
            retryCount: primaryTask?.retry_count || 0,
            timeout: primaryTask?.timeout || 3600,
            scheduleType,
            scheduleInterval,
            scheduleTime,
            scheduleDay,
        });
    }, [job, primaryTask]);

    useEffect(() => {
        if (executionType === 'notebook') {
            fetchNotebooks();
        }
    }, [executionType]);

    const fetchNotebooks = async () => {
        setIsLoadingNotebooks(true);
        try {
            const data = await workspace.listNotebooks();
            setNotebooks(data || []);
            if (data?.length > 0 && !form.notebookPath && primaryTask?.task_type !== 'notebook') {
                setForm(prev => ({ ...prev, notebookPath: data[0].id || data[0].name }));
            }
        } catch (err) {
            console.error("Failed to fetch notebooks:", err);
        } finally {
            setIsLoadingNotebooks(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        
        if (executionType === 'sql' && !form.query.trim()) {
            toast?.warning?.('Please enter a SQL query for the job.');
            return;
        }
        if (executionType === 'notebook' && !form.notebookPath) {
            toast?.warning?.('Please select a notebook for the job.');
            return;
        }

        setIsSaving(true);

        try {
            // 1. Update Job Metadata
            let schedule = { type: 'none', value: '' };
            if (form.scheduleType === 'interval') schedule = { type: 'interval', value: form.scheduleInterval };
            else if (form.scheduleType === 'daily') schedule = { type: 'daily', value: form.scheduleTime };
            else if (form.scheduleType === 'weekly') schedule = { type: 'weekly', value: `${form.scheduleDay} ${form.scheduleTime}` };

            const jobUpdates = {
                name: form.name,
                description: form.description,
                schedule,
                parameters: form.parameters.filter(p => p.key.trim()),
            };

            const jobSuccess = await updateJob(job.id, jobUpdates);

            // 2. Update Primary Task
            if (primaryTask && jobSuccess) {
                const taskUpdates = {
                    name: form.name, // Keep task name in sync with job for Simple Jobs
                    task_type: executionType,
                    retry_count: parseInt(form.retryCount) || 0,
                    timeout: parseInt(form.timeout) || 3600,
                };
                
                if (executionType === 'sql') {
                    taskUpdates.query = form.query;
                } else {
                    taskUpdates.notebook_path = form.notebookPath;
                }
                
                await updateTask(job.id, primaryTask.id, taskUpdates);
            }
            setIsEditing(false);
            toast?.success?.('Job updated successfully!');
        } finally {
            setIsSaving(false);
        }
    };

    if (!job || !primaryTask) {
        return (
            <div className="flex-1 min-w-0 p-6 overflow-y-auto df-scrollbar" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
                <div className="df-empty-state py-16">
                    <div className="df-empty-state-icon"><FiCode size={24} /></div>
                    <h3>No task defined</h3>
                    <p>This job has no SQL task attached.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-w-0 p-6 overflow-y-auto df-scrollbar relative" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
            <div className="max-w-4xl mx-auto space-y-6">
                <form onSubmit={handleSave} className="df-card p-6">
                    <div className="flex items-center justify-between mb-6 pb-4" style={{ borderBottom: '1px solid var(--df-border)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                                <FiSettings size={18} style={{ color: 'var(--df-icon-accent)' }} />
                            </div>
                            <div>
                                <h3 className="text-xl font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>Job Configuration</h3>
                                <p className="text-[11px]" style={{ color: 'var(--df-text-soft)' }}>View or edit your job's execution settings and task.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isEditing ? (
                                <button type="button" onClick={(e) => { e.preventDefault(); setIsEditing(true); }} className="df-btn df-btn-secondary flex items-center gap-2">
                                    <FiSettings size={14} /> Edit Configuration
                                </button>
                            ) : (
                                <>
                                    <button type="button" onClick={() => {
                                        setIsEditing(false);
                                        // Force a re-sync from props by temporarily clearing job from dependency array logic
                                        // We just toggle isEditing, next render or poll will sync it back
                                    }} className="df-btn df-btn-secondary" disabled={isSaving}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="df-btn df-btn-primary flex items-center gap-2" disabled={isSaving}>
                                        <FiSave size={14} /> {isSaving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <fieldset disabled={!isEditing} className="space-y-6 border-none p-0 m-0">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            <div className="space-y-5">
                                <div>
                                    <label className="df-label">Job Name <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                    <input type="text" className="df-input" placeholder="e.g., Refresh Sales Summary" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>

                                <div>
                                    <label className="df-label">Description</label>
                                    <textarea className="df-input" rows={3} placeholder="What does this job do?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
                                </div>

                                <div>
                                    <label className="df-label mb-2">Execution Type <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { type: 'sql', icon: FiCode, label: 'SQL Query', desc: 'Run a SQL query directly' },
                                            { type: 'notebook', icon: FiBook, label: 'Notebook', desc: 'Run a Python notebook' },
                                        ].map(opt => (
                                            <div key={opt.type} onClick={() => isEditing && setExecutionType(opt.type)}
                                                className={`relative p-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${isEditing ? 'cursor-pointer' : 'opacity-80 cursor-default'}`}
                                                style={{
                                                    borderColor: executionType === opt.type ? 'var(--df-accent)' : 'var(--df-border)',
                                                    backgroundColor: executionType === opt.type ? 'var(--df-accent-soft)' : 'transparent',
                                                }}>
                                                {executionType === opt.type && (<div className="absolute top-2 right-2" style={{ color: 'var(--df-accent)' }}><FiCheck size={12} /></div>)}
                                                <opt.icon size={20} style={{ color: executionType === opt.type ? 'var(--df-accent)' : 'var(--df-text-muted)' }} />
                                                <div>
                                                    <div className="text-sm font-medium" style={{ color: executionType === opt.type ? 'var(--df-accent)' : 'var(--df-text)' }}>{opt.label}</div>
                                                    <div className="text-[10px]" style={{ color: 'var(--df-text-muted)' }}>{opt.desc}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {executionType === 'sql' ? (
                                    <div>
                                        <label className="df-label flex items-center gap-1.5 min-h-6">
                                            <FiCode size={13} style={{ color: 'var(--df-text-muted)' }} /> SQL Query <span style={{ color: 'var(--df-danger)' }}>*</span>
                                        </label>
                                        <textarea className="df-input font-mono text-[11px]" rows={12} placeholder={"SELECT * FROM table_name\nWHERE date = '{{date}}'..."} value={form.query} onChange={e => setForm({ ...form, query: e.target.value })} style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.6, resize: 'vertical', backgroundColor: 'var(--df-code-bg)', color: 'var(--df-text)' }} required />
                                        <p className="text-[10px] mt-1.5" style={{ color: 'var(--df-text-muted)' }}>Use <code style={{ color: 'var(--df-accent)' }}>{"{{param_name}}"}</code> to inject dynamic parameters into your query.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="df-label flex items-center gap-1.5 mb-0"><FiBook size={13} style={{ color: 'var(--df-text-muted)' }} /> Select Notebook <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                            {isEditing && (
                                                <button type="button" onClick={fetchNotebooks} className="text-[10px] flex items-center gap-1 hover:underline" style={{ color: 'var(--df-accent)' }}>
                                                    <FiRefreshCw size={10} className={isLoadingNotebooks ? 'animate-spin' : ''} /> Refresh
                                                </button>
                                            )}
                                        </div>

                                        {isLoadingNotebooks && notebooks.length === 0 ? (
                                            <div className="df-input w-full py-4 text-center text-xs animate-pulse" style={{ color: 'var(--df-text-muted)' }}>
                                                Loading your notebooks...
                                            </div>
                                        ) : notebooks.length === 0 ? (
                                            <div className="df-input w-full py-4 text-center text-xs italic" style={{ color: 'var(--df-text-muted)' }}>
                                                No notebooks found in your workspace.
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <select
                                                    required
                                                    value={form.notebookPath}
                                                    onChange={e => setForm({ ...form, notebookPath: e.target.value })}
                                                    className="df-input w-full text-sm appearance-none cursor-pointer pr-10"
                                                    style={{ border: '2px solid var(--df-border)' }}
                                                >
                                                    <option value="">— Select a notebook —</option>
                                                    {notebooks.map(nb => (
                                                        <option key={nb.id} value={nb.id}>{nb.name}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--df-text-muted)' }}>
                                                    <FiChevronDown size={14} />
                                                </div>
                                            </div>
                                        )}

                                        {form.notebookPath && (
                                            <p className="text-[10px] mt-2 flex items-center gap-1.5" style={{ color: 'var(--df-text-muted)' }}>
                                                <FiCheck size={10} className="text-green-500" />
                                                Selected: <span className="font-mono" style={{ color: 'var(--df-accent)' }}>{notebooks.find(n => n.id === form.notebookPath)?.name || form.notebookPath}</span>
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                <ScheduleConfigurator form={form} setForm={setForm} />
                                <JobParameters form={form} setForm={setForm} />
                            </div>
                        </div>

                        <div className="pt-4 border-t" style={{ borderColor: 'var(--df-border)' }}>
                            <button type="button" onClick={() => setAdvancedOpen(!advancedOpen)} className="flex items-center gap-2 w-full text-left transition-colors" style={{ color: 'var(--df-text-muted)' }}>
                                {advancedOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}<FiSettings size={13} /><span className="text-[11px] font-bold uppercase tracking-widest">Advanced Task Options</span>
                            </button>
                            {advancedOpen && (
                                <div className="grid grid-cols-2 gap-4 mt-3 pl-6">
                                    <div>
                                        <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Retry Count</label>
                                        <input type="number" min="0" max="10" className="df-input text-sm" value={form.retryCount} onChange={e => setForm({ ...form, retryCount: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-medium uppercase mb-1.5 block" style={{ color: 'var(--df-text-muted)' }}>Timeout (sec)</label>
                                        <input type="number" min="30" className="df-input text-sm" value={form.timeout} onChange={e => setForm({ ...form, timeout: e.target.value })} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </fieldset>
                </form>
            </div>
        </div>
    );
};

export default JobOverviewPanel;

