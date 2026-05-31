import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { useToast } from '../../../shared/context/ToastContext';
import { FiArrowLeft, FiInfo, FiCode, FiBook, FiCheck, FiChevronDown, FiChevronRight, FiSettings, FiRefreshCw } from 'react-icons/fi';
import ScheduleConfigurator from './ScheduleConfigurator';
import JobParameters from './JobParameters';
import { workspace } from '../../../shared/services/api';

const CreateJobSimple = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { addJob } = useJobs();
    const toast = useToast();
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [executionType, setExecutionType] = useState('sql');
    const [notebooks, setNotebooks] = useState([]);
    const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(false);

    const initialQuery = location.state?.initialQuery || '';

    const [form, setForm] = useState({
        name: '', description: '', query: initialQuery, notebookPath: '', parameters: [], retryCount: 0, timeout: 3600,
        scheduleType: 'none', scheduleInterval: '', scheduleTime: '', scheduleDay: 'Monday',
    });

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
            if (data?.length > 0 && !form.notebookPath) {
                setForm(prev => ({ ...prev, notebookPath: data[0].id || data[0].name }));
            }
        } catch (err) {
            console.error("Failed to fetch notebooks:", err);
        } finally {
            setIsLoadingNotebooks(false);
        }
    };

    const handleSubmit = async (e) => {
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

        let schedule = { type: 'none', value: '' };
        if (form.scheduleType === 'interval') schedule = { type: 'interval', value: form.scheduleInterval };
        else if (form.scheduleType === 'daily') schedule = { type: 'daily', value: form.scheduleTime };
        else if (form.scheduleType === 'weekly') schedule = { type: 'weekly', value: `${form.scheduleDay} ${form.scheduleTime}` };

        const taskConfig = {
            name: form.name,
            type: executionType,
            task_type: executionType === 'sql' ? 'sql' : 'notebook',
            retry_count: parseInt(form.retryCount) || 0,
            timeout: parseInt(form.timeout) || 3600,
            compute: 'Serverless',
            depends_on: [],
        };

        if (executionType === 'sql') {
            taskConfig.query = form.query;
        } else {
            taskConfig.notebook_path = form.notebookPath;
        }

        const resultId = await addJob({
            name: form.name, type: 'Job', description: form.description, schedule,
            parameters: form.parameters.filter(p => p.key.trim()),
            tasks: [taskConfig],
        });

        if (resultId) { navigate(`/dw/jobs/${resultId}`); toast?.success?.(`Job "${form.name}" created successfully!`); }
    };

    return (
        <div className="h-full overflow-y-auto df-scrollbar w-full">
            <div className="p-8 max-w-5xl mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
                <button onClick={() => navigate('/dw/jobs')} className="flex items-center gap-2 text-sm font-semibold mb-6 transition-colors hover:opacity-80" style={{ color: 'var(--df-accent)' }}>
                    <FiArrowLeft size={16} /> Back to Jobs
                </button>

                <div className="df-card p-8">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-accent-soft)' }}>
                            <FiCode size={18} style={{ color: 'var(--df-icon-accent)' }} />
                        </div>
                        <div><h1 className="text-xl font-medium tracking-tight" style={{ color: 'var(--df-strong)' }}>Create New Job</h1><p className="text-sm" style={{ color: 'var(--df-text-soft)' }}>Define a single task execution — SQL or Notebook.</p></div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 rounded-lg mt-5 mb-6" style={{ backgroundColor: 'var(--df-accent-soft)', border: '1px solid var(--df-accent)', borderWidth: '1px', opacity: 0.8 }}>
                        <FiInfo size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--df-accent)' }} />
                        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--df-text)' }}><strong>Job:</strong> A single task (SQL query or Notebook) that runs directly — no dependency graph needed.</div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div>
                                    <label className="df-label">Job Name <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                    <input type="text" className="df-input" placeholder="e.g., Refresh Sales Summary" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>

                                <div>
                                    <label className="df-label">Description</label>
                                    <textarea className="df-input" rows={3} placeholder="What does this job do?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
                                </div>

                                {/* Execution Type Selector */}
                                <div>
                                    <label className="df-label mb-2">Execution Type <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { type: 'sql', icon: FiCode, label: 'SQL Query', desc: 'Run a SQL query directly' },
                                            { type: 'notebook', icon: FiBook, label: 'Notebook', desc: 'Run a Python notebook' },
                                        ].map(opt => (
                                            <div key={opt.type} onClick={() => setExecutionType(opt.type)}
                                                className="relative p-3.5 rounded-xl cursor-pointer border-2 transition-all flex items-center gap-3"
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

                                {/* SQL Query Input */}
                                {executionType === 'sql' ? (
                                    <div>
                                        <label className="df-label flex items-center gap-1.5"><FiCode size={13} style={{ color: 'var(--df-text-muted)' }} /> SQL Query <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                        <textarea className="df-input font-mono text-xs" rows={8} placeholder={"SELECT * FROM table_name\nWHERE date = '{{date}}'..."} value={form.query} onChange={e => setForm({ ...form, query: e.target.value })} style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.6, resize: 'vertical' }} required />
                                        <p className="text-[10px] mt-1" style={{ color: 'var(--df-text-muted)' }}>Use <code style={{ color: 'var(--df-accent)' }}>{"{{param_name}}"}</code> for dynamic parameters.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="df-label flex items-center gap-1.5 mb-0"><FiBook size={13} style={{ color: 'var(--df-text-muted)' }} /> Select Notebook <span style={{ color: 'var(--df-danger)' }}>*</span></label>
                                            <button type="button" onClick={fetchNotebooks} className="text-[10px] flex items-center gap-1 hover:underline" style={{ color: 'var(--df-accent)' }}>
                                                <FiRefreshCw size={10} className={isLoadingNotebooks ? 'animate-spin' : ''} /> Refresh
                                            </button>
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
                                {advancedOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}<FiSettings size={13} /><span className="text-[11px] font-bold uppercase tracking-widest">Advanced Settings</span>
                            </button>
                            {advancedOpen && (
                                <div className="grid grid-cols-2 gap-4 mt-3">
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

                        <div className="flex items-center gap-3 pt-5">
                            <button type="submit" className="df-btn df-btn-primary flex items-center gap-2">
                                {executionType === 'sql' ? <FiCode size={14} /> : <FiBook size={14} />}
                                Create Job
                            </button>
                            <button type="button" onClick={() => navigate('/dw/jobs')} className="df-btn df-btn-secondary">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreateJobSimple;
