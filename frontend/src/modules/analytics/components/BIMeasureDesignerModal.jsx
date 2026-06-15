import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Search, Database, AlertCircle, CheckCircle, RefreshCw, Calculator, 
    ChevronRight, BookOpen, AlertTriangle, ShieldCheck, UserCheck, 
    Settings, Play, TrendingUp, Info, HelpCircle, Folder, Sliders, Code, Sparkles, Send, Bot, Trash2
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import './BIMeasureDesignerModal.css';

const CATEGORIES = ['Financial', 'Sales', 'Marketing', 'Operations', 'HR', 'Custom'];
const FORMATS = ['General', 'Currency', 'Percentage', 'Whole Number', 'Decimal Number', 'Growth Rate', 'Custom Format'];
const CURRENCIES = ['₹', '$', '€', '£', '¥'];
const DISPLAY_UNITS_OPTIONS = ['None', 'Thousands', 'Millions', 'Billions'];

const BIMeasureDesignerModal = ({
    isOpen,
    onClose,
    fileId,
    schema = [],
    existingMeasures = [],
    measureToEdit = null, // if editing
    onSave // callback (measure)
}) => {
    // Left Panel Tabs
    const [leftTab, setLeftTab] = useState('business'); // business | governance | formatting
    
    // Main Tabs for Semantic Metric Platform
    const [mainTab, setMainTab] = useState(measureToEdit ? 'editor' : 'library');
    const [showProperties, setShowProperties] = useState(true);
    const [showSchema, setShowSchema] = useState(true);
    
    // Metric Library filter states
    const [librarySearch, setLibrarySearch] = useState('');
    const [libraryCategory, setLibraryCategory] = useState('All');
    const [librarySort, setLibrarySort] = useState('name');
    const [libraryView, setLibraryView] = useState('flat');
    
    // Visual Builder states
    const [visualTemplate, setVisualTemplate] = useState('sum');
    const [visualColumn, setVisualColumn] = useState('');
    
    // AI Copilot states
    const [copilotMessages, setCopilotMessages] = useState([
        { sender: 'bot', text: 'Hello! I am your AI Semantic Metric assistant. Ask me to write a formula using columns from your dataset. For example, "calculate sum of Value" or "find average of Year".' }
    ]);
    const [copilotInput, setCopilotInput] = useState('');
    const [isGeneratingCopilot, setIsGeneratingCopilot] = useState(false);

    // Core states
    const [name, setName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('Financial');
    const [expression, setExpression] = useState('');
    const [format, setFormat] = useState('General');
    const [customFormat, setCustomFormat] = useState('');
    
    // Summary screen states
    const [isSaved, setIsSaved] = useState(false);
    const [savedMeasureData, setSavedMeasureData] = useState(null);
    const [activeTheme, setActiveTheme] = useState('semanticThemeDark');

    // Monitor platform theme changes
    useEffect(() => {
        const checkTheme = () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            setActiveTheme(isDark ? 'semanticThemeDark' : 'semanticThemeLight');
        };

        checkTheme();

        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        return () => observer.disconnect();
    }, []);

    // Collapse side panels on load if viewport is tablet or mobile size
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
            setShowProperties(false);
            setShowSchema(false);
        }
    }, []);
    
    // Extended properties
    const [businessDefinition, setBusinessDefinition] = useState('');
    const [tags, setTags] = useState('');
    const [owner, setOwner] = useState('');
    const [steward, setSteward] = useState('');
    const [certificationStatus, setCertificationStatus] = useState('Uncertified');
    const [approvalStatus, setApprovalStatus] = useState('Draft');
    
    // Formatting presentation engine states
    const [currency, setCurrency] = useState('₹');
    const [decimalPlaces, setDecimalPlaces] = useState(2);
    const [displayUnits, setDisplayUnits] = useState('None');
    const [colorRules, setColorRules] = useState({
        minThreshold: 0,
        minColor: '#ef4444',
        maxThreshold: 100000,
        maxColor: '#22c55e'
    });

    // Validation & dependencies
    const [isValid, setIsValid] = useState(true);
    const [errors, setErrors] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [dependencies, setDependencies] = useState({ fields: [], measures: [] });
    const [isValidating, setIsValidating] = useState(false);

    // Right Panel Preview and Library Tabs
    const [rightPanelTab, setRightPanelTab] = useState('analysis'); // analysis | library
    const [previewTab, setPreviewTab] = useState('kpi'); // kpi | scalar | table | chart
    const [groupByCol, setGroupByCol] = useState('');
    const [previewResult, setPreviewResult] = useState(null);
    const [previewFormatted, setPreviewFormatted] = useState('');
    const [previewError, setPreviewError] = useState(null);
    const [isCalculatingPreview, setIsCalculatingPreview] = useState(false);

    // Search fields
    const [searchFieldText, setSearchFieldText] = useState('');

    // Versions and lineage governance states
    const [versions, setVersions] = useState([]);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [lineage, setLineage] = useState({ parents: [], children: [] });
    const [isLoadingLineage, setIsLoadingLineage] = useState(false);
    const [impactData, setImpactData] = useState(null);
    const [isLoadingImpact, setIsLoadingImpact] = useState(false);

    const fetchVersions = async () => {
        if (!measureToEdit) return;
        setIsLoadingVersions(true);
        try {
            const response = await fetch(`/analytics/api/modeling/measures/${measureToEdit.id}/versions`);
            if (response.ok) {
                const data = await response.json();
                setVersions(data);
            }
        } catch (err) {
            console.error("Failed to load versions:", err);
        } finally {
            setIsLoadingVersions(false);
        }
    };

    const fetchLineage = async () => {
        if (!measureToEdit) {
            setLineage({ parents: [], children: [] });
            return;
        }
        setIsLoadingLineage(true);
        try {
            const response = await fetch(`/analytics/api/modeling/measures/${measureToEdit.id}/lineage`);
            if (response.ok) {
                const data = await response.json();
                setLineage(data);
            }
        } catch (err) {
            console.error("Failed to load lineage:", err);
        } finally {
            setIsLoadingLineage(false);
        }
    };

    const fetchImpact = async () => {
        if (!measureToEdit) {
            setImpactData(null);
            return;
        }
        setIsLoadingImpact(true);
        try {
            const response = await fetch(`/analytics/api/modeling/measures/${measureToEdit.id}/impact`);
            if (response.ok) {
                const data = await response.json();
                setImpactData(data);
            }
        } catch (err) {
            console.error("Failed to load impact:", err);
        } finally {
            setIsLoadingImpact(false);
        }
    };

    useEffect(() => {
        if (isOpen && measureToEdit) {
            fetchVersions();
            fetchLineage();
            fetchImpact();
        } else {
            setVersions([]);
            setLineage({ parents: [], children: [] });
            setImpactData(null);
        }
    }, [measureToEdit, isOpen]);

    const handleRollback = async (vNum) => {
        if (!window.confirm(`Are you sure you want to rollback to Version ${vNum}?`)) {
            return;
        }
        try {
            const response = await fetch(`/analytics/api/modeling/measures/${measureToEdit.id}/versions/${vNum}/rollback`, {
                method: 'POST'
            });
            if (response.ok) {
                const updated = await response.json();
                setName(updated.name || '');
                setDisplayName(updated.display_name || '');
                setDescription(updated.description || '');
                setCategory(updated.category || 'Financial');
                setExpression(updated.expression || '');
                setFormat(updated.format || 'General');
                setBusinessDefinition(updated.business_definition || '');
                setTags(Array.isArray(updated.tags) ? updated.tags.join(', ') : (updated.tags || ''));
                setOwner(updated.owner || '');
                setSteward(updated.steward || '');
                setCertificationStatus(updated.certification_status || 'Uncertified');
                setApprovalStatus(updated.approval_status || 'Draft');
                setCurrency(updated.currency || '₹');
                setDecimalPlaces(updated.decimal_places !== undefined ? updated.decimal_places : 2);
                setDisplayUnits(updated.display_units || 'None');
                if (updated.color_rules) {
                    setColorRules(updated.color_rules);
                }
                
                fetchVersions();
                fetchLineage();
                fetchImpact();
                
                if (onSave) {
                    onSave(updated);
                }
                alert(`Successfully rolled back to Version ${vNum}. Formula re-validated.`);
            } else {
                const err = await response.json();
                alert(`Rollback failed: ${err.detail || 'Server error'}`);
            }
        } catch (err) {
            alert(`Network error during rollback: ${err.message}`);
        }
    };

    const monacoEditorRef = useRef(null);
    const completionProviderRef = useRef(null);

    // Cleanup completion items provider on unmount
    useEffect(() => {
        return () => {
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
            }
        };
    }, []);

    // Load initial values if editing
    useEffect(() => {
        if (measureToEdit) {
            setName(measureToEdit.name || '');
            setDisplayName(measureToEdit.display_name || '');
            setDescription(measureToEdit.description || '');
            setCategory(measureToEdit.category || 'Financial');
            setExpression(measureToEdit.expression || '');
            setFormat(measureToEdit.format || 'General');
            setBusinessDefinition(measureToEdit.business_definition || '');
            setTags(Array.isArray(measureToEdit.tags) ? measureToEdit.tags.join(', ') : (measureToEdit.tags || ''));
            setOwner(measureToEdit.owner || '');
            setSteward(measureToEdit.steward || '');
            setCertificationStatus(measureToEdit.certification_status || 'Uncertified');
            setApprovalStatus(measureToEdit.approval_status || 'Draft');
            setCurrency(measureToEdit.currency || '₹');
            setDecimalPlaces(measureToEdit.decimal_places !== undefined ? measureToEdit.decimal_places : 2);
            setDisplayUnits(measureToEdit.display_units || 'None');
            if (measureToEdit.color_rules) {
                setColorRules(measureToEdit.color_rules);
            } else {
                setColorRules({ minThreshold: 0, minColor: '#ef4444', maxThreshold: 100000, maxColor: '#22c55e' });
            }
            setMainTab('editor');
        } else {
            setName('');
            setDisplayName('');
            setDescription('');
            setCategory('Financial');
            setExpression('');
            setFormat('General');
            setBusinessDefinition('');
            setTags('');
            setOwner('');
            setSteward('');
            setCertificationStatus('Uncertified');
            setApprovalStatus('Draft');
            setCurrency('₹');
            setDecimalPlaces(2);
            setDisplayUnits('None');
            setColorRules({ minThreshold: 0, minColor: '#ef4444', maxThreshold: 100000, maxColor: '#22c55e' });
            setMainTab('library');
        }
        setVisualTemplate('sum');
        setVisualColumn('');
        setCopilotMessages([
            { sender: 'bot', text: 'Hello! I am your AI Semantic Metric assistant. Ask me to write a formula using columns from your dataset. For example, "calculate sum of Value" or "find average of Year".' }
        ]);
        setCopilotInput('');
        setPreviewResult(null);
        setPreviewFormatted('');
        setPreviewError(null);
        setDependencies({ fields: [], measures: [] });
        setErrors([]);
        setWarnings([]);
        setIsSaved(false);
        setSavedMeasureData(null);
    }, [measureToEdit, isOpen]);

    // Live validation (Debounced)
    useEffect(() => {
        if (!expression.trim()) {
            setIsValid(true);
            setErrors([]);
            setWarnings([]);
            setDependencies({ fields: [], measures: [] });
            return;
        }

        const handler = setTimeout(async () => {
            setIsValidating(true);
            try {
                const response = await fetch('/analytics/api/modeling/measures/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name || 'TempMeasure',
                        expression,
                        file_id: fileId
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    setIsValid(data.is_valid);
                    setErrors(data.errors || []);
                    setWarnings(data.warnings || []);
                    setDependencies(data.dependencies || { fields: [], measures: [] });
                } else {
                    const errText = await response.text();
                    setErrors([`Validation request failed: ${errText}`]);
                    setIsValid(false);
                }
            } catch (err) {
                setErrors([`Failed to contact validation server: ${err.message}`]);
                setIsValid(false);
            } finally {
                setIsValidating(false);
            }
        }, 600);

        return () => clearTimeout(handler);
    }, [expression, name, fileId]);

    // Monaco Editor configuration
    const handleEditorBeforeMount = (monaco) => {
        // Register custom language
        if (!monaco.languages.getLanguages().some(lang => lang.id === 'semanticFormula')) {
            monaco.languages.register({ id: 'semanticFormula' });

            // Monarch token rules
            monaco.languages.setMonarchTokensProvider('semanticFormula', {
                tokenizer: {
                    root: [
                        [/\[[^\]]+\]/, 'custom-reference'],
                        [/\b\d+(\.\d+)?\b/, 'number'],
                        [/\b(DIVIDE|SUM|AVERAGE|COUNT|MIN|MAX|MEDIAN|MODE|YTD|MTD|QTD|CAGR)\b/, 'keyword'],
                        [/[+\-*/()=]/, 'operator']
                    ]
                }
            });

            // Register dark theme
            monaco.editor.defineTheme('semanticThemeDark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'custom-reference', foreground: '38bdf8', fontStyle: 'bold' }, // light blue
                    { token: 'keyword', foreground: '818cf8', fontStyle: 'bold' }, // indigo
                    { token: 'number', foreground: 'fbbf24' }, // amber
                    { token: 'operator', foreground: 'a7f3d0' } // emerald
                ],
                colors: {
                    'editor.background': '#1e293b', // slate-800
                    'editor.foreground': '#f8fafc', // slate-50
                    'editor.lineHighlightBackground': '#334155'
                }
            });

            // Register light theme
            monaco.editor.defineTheme('semanticThemeLight', {
                base: 'vs',
                inherit: true,
                rules: [
                    { token: 'custom-reference', foreground: '0284c7', fontStyle: 'bold' }, // darker blue for light bg
                    { token: 'keyword', foreground: '4f46e5', fontStyle: 'bold' }, // darker indigo
                    { token: 'number', foreground: 'd97706' }, // amber
                    { token: 'operator', foreground: '059669' } // green
                ],
                colors: {
                    'editor.background': '#ffffff',
                    'editor.foreground': '#0f172a',
                    'editor.lineHighlightBackground': '#f1f5f9'
                }
            });
        }
    };

    const handleEditorOnMount = (editor, monaco) => {
        monacoEditorRef.current = editor;

        // Dispose previous completion item provider if any
        if (completionProviderRef.current) {
            completionProviderRef.current.dispose();
        }

        // Register custom autocompletion list provider
        completionProviderRef.current = monaco.languages.registerCompletionItemProvider('semanticFormula', {
            triggerCharacters: ['['],
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };

                const suggestions = [];

                // Dataset columns
                schema.forEach(col => {
                    suggestions.push({
                        label: `[${col.column_name}]`,
                        kind: monaco.languages.CompletionItemKind.Field,
                        documentation: `Database schema field of type ${col.data_type}`,
                        insertText: `[${col.column_name}]`,
                        range: range
                    });
                });

                // Other measures
                existingMeasures.forEach(m => {
                    if (!measureToEdit || m.name !== measureToEdit.name) {
                        suggestions.push({
                            label: `[${m.name}]`,
                            kind: monaco.languages.CompletionItemKind.Method,
                            documentation: `Semantic measure expression: ${m.expression}`,
                            insertText: `[${m.name}]`,
                            range: range
                        });
                    }
                });

                // Functions catalog
                const fns = ['DIVIDE', 'SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX', 'MEDIAN', 'MODE', 'YTD', 'MTD', 'QTD', 'CAGR'];
                fns.forEach(fn => {
                    suggestions.push({
                        label: fn,
                        kind: monaco.languages.CompletionItemKind.Function,
                        documentation: `Semantic analytics BI function: ${fn}`,
                        insertText: `${fn}($0)`,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range: range
                    });
                });

                return { suggestions };
            }
        });
    };

    const handleEditorChange = (value) => {
        setExpression(value || '');
    };

    // Monaco selection helpers
    const insertTerm = (term) => {
        const editor = monacoEditorRef.current;
        if (!editor) return;
        const selection = editor.getSelection();
        const textEdit = {
            identifier: { major: 1, minor: 1 },
            range: selection,
            text: `[${term}]`,
            forceMoveMarkers: true
        };
        editor.executeEdits("insert-picker", [textEdit]);
        editor.focus();
    };

    const insertFunction = (funcName) => {
        const editor = monacoEditorRef.current;
        if (!editor) return;
        const selection = editor.getSelection();
        const textEdit = {
            identifier: { major: 1, minor: 1 },
            range: selection,
            text: `${funcName}()`,
            forceMoveMarkers: true
        };
        editor.executeEdits("insert-fn-picker", [textEdit]);
        
        // Relocate cursor inside brackets
        const position = editor.getPosition();
        editor.setPosition({
            lineNumber: position.lineNumber,
            column: position.column - 1
        });
        editor.focus();
    };

    // Formatting formula text helper
    const handleFormatFormulaText = () => {
        if (!expression.trim()) return;
        let formatted = expression.trim();
        const fns = ['divide', 'sum', 'average', 'count', 'min', 'max', 'median', 'mode', 'ytd', 'mtd', 'qtd', 'cagr'];
        fns.forEach(fn => {
            const regex = new RegExp(`\\b${fn}\\b`, 'gi');
            formatted = formatted.replace(regex, fn.toUpperCase());
        });
        formatted = formatted.replace(/\s*([\+\-\*\/])\s*/g, ' $1 ');
        formatted = formatted.replace(/ {2,}/g, ' ');
        setExpression(formatted);
    };

    const handleCalculatePreview = async () => {
        if (!expression.trim()) return;
        setIsCalculatingPreview(true);
        setPreviewError(null);
        try {
            const response = await fetch('/analytics/api/modeling/measures/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name || 'TempMeasure',
                    expression,
                    file_id: fileId,
                    format_type: format,
                    group_by: groupByCol || null,
                    decimal_places: Number(decimalPlaces),
                    currency: currency || null,
                    display_units: displayUnits
                })
            });
            const data = await response.json();
            if (data.error) {
                setPreviewError(data.error);
                setPreviewResult(null);
                setPreviewFormatted('');
            } else {
                setPreviewResult(data.result);
                setPreviewFormatted(data.formatted);
            }
        } catch (err) {
            setPreviewError(`Preview failed: ${err.message}`);
        } finally {
            setIsCalculatingPreview(false);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert('Measure Name is required.');
            return;
        }
        if (!expression.trim()) {
            alert('Measure formula expression is required.');
            return;
        }
        if (!isValid) {
            alert('Please fix expression validation errors before saving.');
            return;
        }

        const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t !== '');
        const measurePayload = {
            name: name.trim(),
            display_name: displayName.trim() || name.trim(),
            description: description.trim(),
            category,
            expression: expression.trim(),
            format,
            file_id: fileId,
            
            uuid: measureToEdit?.uuid || null,
            version: measureToEdit?.version || 1,
            status: measureToEdit?.status || 'Active',
            created_by: measureToEdit?.created_by || 'Current User',
            modified_by: 'Current User',
            business_definition: businessDefinition.trim(),
            tags: tagsArray,
            currency,
            decimal_places: Number(decimalPlaces),
            color_rules: colorRules,
            display_units: displayUnits,
            owner: owner.trim(),
            steward: steward.trim(),
            certification_status: certificationStatus,
            approval_status: approvalStatus
        };

        try {
            const url = measureToEdit 
                ? `/analytics/api/modeling/measures/${measureToEdit.id}`
                : '/analytics/api/modeling/measures';
            
            const method = measureToEdit ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(measurePayload)
            });

            if (response.ok) {
                const saved = await response.json();
                onSave(saved);
                setSavedMeasureData(saved);
                setIsSaved(true);
            } else {
                const err = await response.json();
                alert(`Error saving measure: ${err.detail || 'Unknown server error'}`);
            }
        } catch (err) {
            alert(`Network error saving measure: ${err.message}`);
        }
    };

    const handleSaveVisual = async () => {
        if (!name.trim()) {
            alert('Metric Name is required.');
            return;
        }
        if (!visualColumn) {
            alert('Please select a column to map.');
            return;
        }
        const generatedExpr = `${visualTemplate.toUpperCase()}([${visualColumn}])`;
        setExpression(generatedExpr);

        const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t !== '');
        const measurePayload = {
            name: name.trim(),
            display_name: displayName.trim() || name.trim(),
            description: description.trim(),
            category,
            expression: generatedExpr.trim(),
            format,
            file_id: fileId,
            
            uuid: measureToEdit?.uuid || null,
            version: measureToEdit?.version || 1,
            status: measureToEdit?.status || 'Active',
            created_by: measureToEdit?.created_by || 'Current User',
            modified_by: 'Current User',
            business_definition: businessDefinition.trim(),
            tags: tagsArray,
            currency,
            decimal_places: Number(decimalPlaces),
            color_rules: colorRules,
            display_units: displayUnits,
            owner: owner.trim(),
            steward: steward.trim(),
            certification_status: certificationStatus,
            approval_status: approvalStatus
        };

        try {
            const url = measureToEdit 
                ? `/analytics/api/modeling/measures/${measureToEdit.id}`
                : '/analytics/api/modeling/measures';
            
            const method = measureToEdit ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(measurePayload)
            });

            if (response.ok) {
                const saved = await response.json();
                onSave(saved);
                setSavedMeasureData(saved);
                setIsSaved(true);
            } else {
                const err = await response.json();
                alert(`Error saving metric: ${err.detail || 'Unknown server error'}`);
            }
        } catch (err) {
            alert(`Network error saving metric: ${err.message}`);
        }
    };

    const handleSendCopilot = () => {
        if (!copilotInput.trim()) return;
        
        const userMsg = copilotInput.trim();
        setCopilotMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
        setCopilotInput('');
        setIsGeneratingCopilot(true);
        
        setTimeout(() => {
            let suggestedFormula = '';
            let matchedCol = '';
            let matchedFunc = 'SUM';
            
            schema.forEach(col => {
                if (userMsg.toLowerCase().includes(col.column_name.toLowerCase())) {
                    matchedCol = col.column_name;
                }
            });
            
            if (userMsg.toLowerCase().includes('average') || userMsg.toLowerCase().includes('avg')) {
                matchedFunc = 'AVERAGE';
            } else if (userMsg.toLowerCase().includes('count')) {
                matchedFunc = 'COUNT';
            } else if (userMsg.toLowerCase().includes('min')) {
                matchedFunc = 'MIN';
            } else if (userMsg.toLowerCase().includes('max')) {
                matchedFunc = 'MAX';
            }
            
            if (matchedCol) {
                suggestedFormula = `${matchedFunc}([${matchedCol}])`;
            } else {
                if (userMsg.toLowerCase().includes('margin') || userMsg.toLowerCase().includes('profit')) {
                    const rev = schema.find(c => c.column_name.toLowerCase().includes('revenue'))?.column_name || 'Revenue';
                    const cost = schema.find(c => c.column_name.toLowerCase().includes('cost'))?.column_name || 'Cost';
                    suggestedFormula = `DIVIDE([${rev}] - [${cost}], [${rev}])`;
                } else if (schema.length > 0) {
                    const firstNumCol = schema.find(c => c.data_type === 'numeric' || c.data_type === 'integer' || c.data_type === 'real')?.column_name || schema[0].column_name;
                    suggestedFormula = `${matchedFunc}([${firstNumCol}])`;
                } else {
                    suggestedFormula = 'SUM([Value])';
                }
            }
            
            const botResponse = {
                sender: 'bot',
                text: `I've analyzed the schema columns and generated this formula for you:`,
                formula: suggestedFormula
            };
            
            setCopilotMessages(prev => [...prev, botResponse]);
            setIsGeneratingCopilot(false);
        }, 800);
    };

    const applyCopilotFormula = (formula) => {
        setExpression(formula);
        setMainTab('editor');
    };

    const filteredMeasures = useMemo(() => {
        return existingMeasures.filter(m => {
            const matchesSearch = m.name.toLowerCase().includes(librarySearch.toLowerCase()) || 
                                  (m.display_name && m.display_name.toLowerCase().includes(librarySearch.toLowerCase())) ||
                                  (m.description && m.description.toLowerCase().includes(librarySearch.toLowerCase()));
            const matchesCategory = libraryCategory === 'All' || m.category === libraryCategory;
            return matchesSearch && matchesCategory;
        }).sort((a, b) => {
            if (librarySort === 'category') {
                return a.category.localeCompare(b.category);
            }
            return a.name.localeCompare(b.name);
        });
    }, [existingMeasures, librarySearch, libraryCategory, librarySort]);

    // Filter fields & measures
    const filteredFields = schema.filter(f => 
        f.column_name.toLowerCase().includes(searchFieldText.toLowerCase())
    );
    const filteredExistingMeasures = existingMeasures.filter(m => 
        m.name.toLowerCase().includes(searchFieldText.toLowerCase()) && 
        (!measureToEdit || m.name !== measureToEdit.name)
    );

    // KPI Card color calculations
    const getKpiColor = () => {
        if (typeof previewResult === 'number') {
            if (previewResult <= colorRules.minThreshold) return colorRules.minColor;
            if (previewResult >= colorRules.maxThreshold) return colorRules.maxColor;
        }
        return '#6366f1'; // Default indigo
    };

    // Recharts Data preparation
    const chartData = useMemo(() => {
        if (typeof previewResult === 'object' && previewResult !== null) {
            return Object.entries(previewResult).map(([name, value]) => ({ name, value }));
        } else if (typeof previewResult === 'number') {
            return [
                { name: 'Q1', value: previewResult * 0.8 },
                { name: 'Q2', value: previewResult * 0.95 },
                { name: 'Q3', value: previewResult * 0.9 },
                { name: 'Q4', value: previewResult }
            ];
        }
        return [];
    }, [previewResult]);

    if (!isOpen) return null;

    if (isSaved && savedMeasureData) {
        return createPortal(
            <div className="bi-measure-designer-overlay">
                <div className="bi-measure-designer-modal summary-mode">
                    {/* Modal Header */}
                    <div className="bi-designer-header">
                        <div className="bi-header-title-area">
                            <CheckCircle className="bi-designer-logo success-icon" size={24} />
                            <div>
                                <h2>Measure Saved Successfully!</h2>
                                <p>Your semantic measure has been governed and is now ready for use across the platform.</p>
                            </div>
                        </div>
                    </div>

                    {/* Summary Workspace */}
                    <div className="bi-designer-body summary-body">
                        <div className="summary-card-container">
                            <div className="summary-section">
                                <div className="summary-field">
                                    <span className="summary-label">Display Name</span>
                                    <span className="summary-value name">{savedMeasureData.display_name || savedMeasureData.name}</span>
                                </div>
                                <div className="summary-field">
                                    <span className="summary-label">Internal Identifier</span>
                                    <span className="summary-value code">{savedMeasureData.name}</span>
                                </div>
                            </div>

                            <div className="summary-section text-fields">
                                <div className="summary-field">
                                    <span className="summary-label">Description</span>
                                    <span className="summary-value desc">{savedMeasureData.description || 'No description provided.'}</span>
                                </div>
                                {savedMeasureData.business_definition && (
                                    <div className="summary-field">
                                        <span className="summary-label">Business Definition</span>
                                        <span className="summary-value desc">{savedMeasureData.business_definition}</span>
                                    </div>
                                )}
                            </div>

                            <div className="summary-section grid-fields">
                                <div className="summary-field">
                                    <span className="summary-label">Category</span>
                                    <span className="summary-value badge">{savedMeasureData.category}</span>
                                </div>
                                <div className="summary-field">
                                    <span className="summary-label">Format Style</span>
                                    <span className="summary-value badge">{savedMeasureData.format}</span>
                                </div>
                                <div className="summary-field">
                                    <span className="summary-label">Preview Value (Grand Total)</span>
                                    <span className="summary-value preview-val">
                                        {previewFormatted || 'Not calculated (Preview not executed)'}
                                    </span>
                                </div>
                            </div>

                            <div className="summary-section formula-section">
                                <span className="summary-label">Formula Expression</span>
                                <pre className="summary-formula">
                                    <code>{savedMeasureData.expression}</code>
                                </pre>
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer Controls */}
                    <div className="bi-designer-footer">
                        <button className="designer-btn primary" onClick={onClose}>
                            Done
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="bi-measure-designer-overlay">
            <div className={`bi-measure-designer-modal main-tab-${mainTab}`}>
                {/* Modal Header */}
                <div className="bi-designer-header">
                    <div className="bi-header-title-area">
                        <Calculator className="bi-designer-logo" />
                        <div>
                            <h2>Semantic Metric Platform</h2>
                            <p>Manage, build, and deploy single-source-of-truth business calculations across dashboards and reports.</p>
                        </div>
                    </div>
                    <button className="bi-designer-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Top-level Tabs */}
                <div className="bi-platform-tabs">
                    <button 
                        className={`platform-tab-btn ${mainTab === 'library' ? 'active' : ''}`} 
                        onClick={() => setMainTab('library')}
                    >
                        <BookOpen size={15} />
                        <span>Metric Library</span>
                    </button>
                    <button 
                        className={`platform-tab-btn ${mainTab === 'visual' ? 'active' : ''}`} 
                        onClick={() => setMainTab('visual')}
                    >
                        <Sliders size={15} />
                        <span>Visual Builder</span>
                    </button>
                    <button 
                        className={`platform-tab-btn ${mainTab === 'editor' ? 'active' : ''}`} 
                        onClick={() => setMainTab('editor')}
                    >
                        <Code size={15} />
                        <span>Advanced Formula Editor</span>
                    </button>
                    <button 
                        className={`platform-tab-btn ${mainTab === 'copilot' ? 'active' : ''}`} 
                        onClick={() => setMainTab('copilot')}
                    >
                        <Sparkles size={15} />
                        <span>AI Copilot</span>
                    </button>
                </div>

                {/* Tab content area */}
                <div className="bi-designer-body">
                    {/* 1. METRIC LIBRARY TAB */}
                    {mainTab === 'library' && (
                        <div className="metric-library-tab">
                            <div className="library-filters-bar">
                                <div className="search-input-container">
                                    <Search size={14} />
                                    <input 
                                        type="text" 
                                        placeholder="Search metrics..." 
                                        value={librarySearch}
                                        onChange={(e) => setLibrarySearch(e.target.value)}
                                        className="designer-input"
                                    />
                                </div>
                                
                                <select 
                                    value={libraryCategory} 
                                    onChange={(e) => setLibraryCategory(e.target.value)}
                                    className="designer-select filter-select"
                                >
                                    <option value="All">All Categories</option>
                                    {CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                
                                <select 
                                    value={librarySort} 
                                    onChange={(e) => setLibrarySort(e.target.value)}
                                    className="designer-select filter-select"
                                >
                                    <option value="name">Sort by Name</option>
                                    <option value="category">Sort by Category</option>
                                </select>
                                
                                <select 
                                    value={libraryView} 
                                    onChange={(e) => setLibraryView(e.target.value)}
                                    className="designer-select filter-select"
                                >
                                    <option value="flat">Flat List</option>
                                </select>
                                
                                <button className="create-metric-btn" onClick={() => {
                                    // Clear form and go to Visual Builder
                                    setName('');
                                    setDisplayName('');
                                    setDescription('');
                                    setExpression('');
                                    setFormat('General');
                                    setVisualColumn('');
                                    setMainTab('visual');
                                }}>
                                    + Create Metric
                                </button>
                            </div>
                            
                            <div className="library-content-area">
                                {filteredMeasures.length === 0 ? (
                                    <div className="no-metrics-msg">
                                        <Info size={24} />
                                        <p>No metrics found matching criteria.</p>
                                    </div>
                                ) : (
                                    <div className="metrics-list-grid">
                                        {filteredMeasures.map(measure => (
                                            <div key={measure.id} className="metric-item-card" onClick={() => {
                                                setName(measure.name || '');
                                                setDisplayName(measure.display_name || '');
                                                setDescription(measure.description || '');
                                                setCategory(measure.category || 'Financial');
                                                setExpression(measure.expression || '');
                                                setFormat(measure.format || 'General');
                                                setBusinessDefinition(measure.business_definition || '');
                                                setTags(Array.isArray(measure.tags) ? measure.tags.join(', ') : (measure.tags || ''));
                                                setOwner(measure.owner || '');
                                                setSteward(measure.steward || '');
                                                setCertificationStatus(measure.certification_status || 'Uncertified');
                                                setApprovalStatus(measure.approval_status || 'Draft');
                                                setCurrency(measure.currency || '₹');
                                                setDecimalPlaces(measure.decimal_places !== undefined ? measure.decimal_places : 2);
                                                setDisplayUnits(measure.display_units || 'None');
                                                if (measure.color_rules) {
                                                    setColorRules(measure.color_rules);
                                                }
                                                setMainTab('editor');
                                            }}>
                                                <div className="metric-card-header">
                                                    <Calculator className="metric-card-icon" size={16} />
                                                    <div className="metric-card-title-grp">
                                                        <span className="metric-card-name">{measure.display_name || measure.name}</span>
                                                        <span className="metric-card-identifier">[{measure.name}]</span>
                                                    </div>
                                                    <span className="metric-card-category-badge">{measure.category}</span>
                                                </div>
                                                <div className="metric-card-expr-container">
                                                    <code>{measure.expression}</code>
                                                </div>
                                                {measure.description && (
                                                    <div className="metric-card-desc">
                                                        {measure.description}
                                                    </div>
                                                )}
                                                <div className="metric-card-meta">
                                                    <span>Style: {measure.format}</span>
                                                    {measure.usage_count !== undefined && (
                                                        <span>Used: {measure.usage_count} visuals</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 2. VISUAL BUILDER TAB */}
                    {mainTab === 'visual' && (
                        <div className="visual-builder-tab">
                            <div className="visual-builder-columns">
                                <div className="visual-column details-col">
                                    <h3 className="visual-column-title">1. CALCULATION DETAILS</h3>
                                    
                                    <div className="form-group">
                                        <label>Select Template</label>
                                        <select 
                                            value={visualTemplate} 
                                            onChange={(e) => setVisualTemplate(e.target.value)}
                                            className="designer-select"
                                        >
                                            <option value="sum">Sum of Column</option>
                                            <option value="average">Average of Column</option>
                                            <option value="count">Count of Column</option>
                                            <option value="min">Min of Column</option>
                                            <option value="max">Max of Column</option>
                                        </select>
                                        <span className="template-desc">
                                            {visualTemplate === 'sum' && 'Calculates the sum of all values in a numeric column.'}
                                            {visualTemplate === 'average' && 'Calculates the average of all values in a numeric column.'}
                                            {visualTemplate === 'count' && 'Calculates the total count of non-empty values in a column.'}
                                            {visualTemplate === 'min' && 'Calculates the minimum value in a column.'}
                                            {visualTemplate === 'max' && 'Calculates the maximum value in a column.'}
                                        </span>
                                    </div>

                                    <div className="form-group">
                                        <label>Metric Name <span className="required">*</span></label>
                                        <input 
                                            type="text"
                                            placeholder="e.g. Sales_YTD"
                                            value={name}
                                            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                            disabled={!!measureToEdit}
                                            className="designer-input"
                                        />
                                        <small className="help-text">Internal identifier. Unique, alphanumeric, no spaces.</small>
                                    </div>

                                    <div className="form-group">
                                        <label>Display Name</label>
                                        <input 
                                            type="text"
                                            placeholder="e.g. Sales Year to Date"
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            className="designer-input"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Category</label>
                                        <select 
                                            value={category} 
                                            onChange={(e) => setCategory(e.target.value)}
                                            className="designer-select"
                                        >
                                            {CATEGORIES.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Description</label>
                                        <textarea 
                                            placeholder="Business purpose of this calculation..."
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            rows={2}
                                            className="designer-textarea"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Format</label>
                                        <select 
                                            value={format} 
                                            onChange={(e) => setFormat(e.target.value)}
                                            className="designer-select"
                                        >
                                            {FORMATS.map(f => (
                                                <option key={f} value={f}>{f}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="visual-column map-col">
                                    <h3 className="visual-column-title">2. MAP DATABASE FIELDS</h3>
                                    
                                    <div className="form-group">
                                        <label>
                                            {visualTemplate === 'sum' && 'Column to Sum'}
                                            {visualTemplate === 'average' && 'Column to Average'}
                                            {visualTemplate === 'count' && 'Column to Count'}
                                            {visualTemplate === 'min' && 'Column to Min'}
                                            {visualTemplate === 'max' && 'Column to Max'}
                                        </label>
                                        <div className="mapped-column-selector-wrapper">
                                            <select 
                                                value={visualColumn} 
                                                onChange={(e) => setVisualColumn(e.target.value)}
                                                className="designer-select"
                                            >
                                                <option value="">Select column...</option>
                                                {schema.map(col => (
                                                    <option key={col.column_name} value={col.column_name}>
                                                        {col.column_name}
                                                    </option>
                                                ))}
                                            </select>
                                            {visualColumn && (
                                                <span className="column-type-badge numeric">
                                                    {schema.find(c => c.column_name === visualColumn)?.data_type || 'numeric'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="visual-builder-action-container">
                                        <button 
                                            className="save-build-btn" 
                                            onClick={handleSaveVisual}
                                            disabled={!name.trim() || !visualColumn}
                                        >
                                            Save & Build Metric
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. ADVANCED FORMULA EDITOR TAB */}
                    {mainTab === 'editor' && (
                        <div className="formula-editor-tab-content">
                            {/* PROPERTIES SIDEBAR (LEFT) */}
                            {showProperties && (
                                <div className="bi-designer-left-panel properties-column-panel">
                                    <h3 className="pane-sidebar-title">PROPERTIES</h3>
                                    <div className="tab-scroll-content">
                                        <div className="tab-panel-section">
                                            <div className="form-group">
                                                <label>Measure Name <span className="required">*</span></label>
                                                <input 
                                                    type="text"
                                                    placeholder="e.g. Profit Margin"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                                    disabled={!!measureToEdit}
                                                    className="designer-input"
                                                />
                                                <small className="help-text">Internal identifier. Avoid spaces or special characters.</small>
                                            </div>

                                            <div className="form-group">
                                                <label>Display Name</label>
                                                <input 
                                                    type="text"
                                                    placeholder="e.g. Net Profit Margin (%)"
                                                    value={displayName}
                                                    onChange={(e) => setDisplayName(e.target.value)}
                                                    className="designer-input"
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Category</label>
                                                <select 
                                                    value={category} 
                                                    onChange={(e) => setCategory(e.target.value)}
                                                    className="designer-select"
                                                >
                                                    {CATEGORIES.map(cat => (
                                                        <option key={cat} value={cat}>{cat}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label>Description</label>
                                                <textarea 
                                                    placeholder="Describe what this reusable metric computes..."
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    rows={2}
                                                    className="designer-textarea"
                                                />
                                            </div>
                                            
                                            <div className="pane-section-header">FORMATTING</div>

                                            <div className="form-group">
                                                <label>Format String</label>
                                                <select 
                                                    value={format} 
                                                    onChange={(e) => setFormat(e.target.value)}
                                                    className="designer-select"
                                                >
                                                    {FORMATS.map(f => (
                                                        <option key={f} value={f}>{f}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {(format === 'Currency' || format === 'Custom Format') && (
                                                <div className="form-group">
                                                    <label>Currency Symbol</label>
                                                    <select 
                                                        value={currency} 
                                                        onChange={(e) => setCurrency(e.target.value)}
                                                        className="designer-select"
                                                    >
                                                        {CURRENCIES.map(curr => (
                                                            <option key={curr} value={curr}>{curr}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            {format !== 'Whole Number' && (
                                                <div className="form-group">
                                                    <label>Decimal Places</label>
                                                    <select 
                                                        value={decimalPlaces} 
                                                        onChange={(e) => setDecimalPlaces(Number(e.target.value))}
                                                        className="designer-select"
                                                    >
                                                        {[0, 1, 2, 3, 4].map(dp => (
                                                            <option key={dp} value={dp}>{dp}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            {format !== 'Percentage' && format !== 'Growth Rate' && (
                                                <div className="form-group">
                                                    <label>Display Units</label>
                                                    <select 
                                                        value={displayUnits} 
                                                        onChange={(e) => setDisplayUnits(e.target.value)}
                                                        className="designer-select"
                                                    >
                                                        {DISPLAY_UNITS_OPTIONS.map(du => (
                                                            <option key={du} value={du}>{du}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <div className="pane-section-header">GOVERNANCE & DISCOVERY</div>

                                            <div className="form-group">
                                                <label>Business Owner</label>
                                                <input 
                                                    type="text"
                                                    placeholder="e.g. Sales Director"
                                                    value={owner}
                                                    onChange={(e) => setOwner(e.target.value)}
                                                    className="designer-input"
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Data Steward</label>
                                                <input 
                                                    type="text"
                                                    placeholder="e.g. BI Lead Analyst"
                                                    value={steward}
                                                    onChange={(e) => setSteward(e.target.value)}
                                                    className="designer-input"
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Certification Status</label>
                                                <select 
                                                    value={certificationStatus} 
                                                    onChange={(e) => setCertificationStatus(e.target.value)}
                                                    className="designer-select"
                                                >
                                                    <option value="Uncertified">Uncertified</option>
                                                    <option value="Under Review">Under Review</option>
                                                    <option value="Certified">Certified</option>
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label>Approval Status</label>
                                                <select 
                                                    value={approvalStatus} 
                                                    onChange={(e) => setApprovalStatus(e.target.value)}
                                                    className="designer-select"
                                                >
                                                    <option value="Draft">Draft</option>
                                                    <option value="Under Review">Under Review</option>
                                                    <option value="Approved">Approved</option>
                                                    <option value="Rejected">Rejected</option>
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label>Business Definition</label>
                                                <textarea 
                                                    placeholder="Detailed business definition, context..."
                                                    value={businessDefinition}
                                                    onChange={(e) => setBusinessDefinition(e.target.value)}
                                                    rows={2}
                                                    className="designer-textarea"
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>Tags</label>
                                                <input 
                                                    type="text"
                                                    placeholder="e.g. KPI, Sales"
                                                    value={tags}
                                                    onChange={(e) => setTags(e.target.value)}
                                                    className="designer-input"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CENTER WORKSPACE (MONACO, PREVIEW) */}
                            <div className="bi-designer-center-panel formula-workspace-center">
                                <div className="editor-section-header">
                                    <div className="editor-header-controls">
                                        <button 
                                            onClick={() => setShowProperties(!showProperties)} 
                                            className="toggle-sidebar-btn"
                                        >
                                            {showProperties ? '← Hide Properties' : 'Show Properties →'}
                                        </button>
                                        <button 
                                            onClick={() => setShowSchema(!showSchema)} 
                                            className="toggle-sidebar-btn"
                                        >
                                            {showSchema ? '— Hide Schema' : 'Show Schema +'}
                                        </button>
                                    </div>
                                    <button 
                                        onClick={handleFormatFormulaText} 
                                        className="format-formula-btn"
                                        title="Format formula code"
                                    >
                                        <Settings size={12} />
                                        <span>Format Formula</span>
                                    </button>
                                </div>

                                <div className="monaco-container">
                                    <Editor
                                        height="100%"
                                        language="semanticFormula"
                                        theme={activeTheme}
                                        value={expression}
                                        onChange={handleEditorChange}
                                        beforeMount={handleEditorBeforeMount}
                                        onMount={handleEditorOnMount}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            lineNumbers: 'on',
                                            scrollBeyondLastLine: false,
                                            wordWrap: 'on',
                                            bracketPairColorization: { enabled: true },
                                            automaticLayout: true
                                        }}
                                    />
                                </div>

                                {/* Validation Panel */}
                                <div className="governed-card validation formula-pane-card">
                                    <h4 className="card-label">VALIDATION PANEL</h4>
                                    {isValidating ? (
                                        <div className="val-loading">
                                            <RefreshCw size={12} className="spinning" />
                                            <span>Running lint diagnostics...</span>
                                        </div>
                                    ) : expression.trim() === '' ? (
                                        <div className="val-text empty">
                                            <Info size={13} />
                                            <span>Formula is empty. Start typing to validate.</span>
                                        </div>
                                    ) : isValid && errors.length === 0 ? (
                                        <div className="val-text success">
                                            <CheckCircle size={13} />
                                            <span>Formula is valid. Ready to deploy.</span>
                                        </div>
                                    ) : (
                                        <div className="val-errors-list">
                                            {errors.map((err, idx) => (
                                                <div key={idx} className="val-item err">
                                                    <AlertCircle size={12} />
                                                    <span>{err}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {warnings.length > 0 && (
                                        <div className="val-warnings-list" style={{ marginTop: 6 }}>
                                            {warnings.map((warn, idx) => (
                                                <div key={idx} className="val-item warn">
                                                    <AlertTriangle size={12} />
                                                    <span>{warn}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Dependency View */}
                                <div className="governed-card lineage formula-pane-card">
                                    <h4 className="card-label">DEPENDENCY VIEW</h4>
                                    <div className="lineage-tree">
                                        <div className="lineage-node">
                                            {dependencies.measures.length === 0 && dependencies.fields.length === 0 ? (
                                                <span className="node-empty">No fields or measures referenced.</span>
                                            ) : (
                                                <div className="node-list inline-nodes">
                                                    {dependencies.measures.map(m => (
                                                        <div key={m} className="node-item measure-ref">
                                                            <span>[{m}] (measure)</span>
                                                        </div>
                                                    ))}
                                                    {dependencies.fields.map(f => (
                                                        <div key={f} className="node-item field-ref">
                                                            <span>[{f}] (column)</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Live Preview Panel */}
                                <div className="governed-card preview-card formula-pane-card">
                                    <div className="preview-header-row">
                                        <h4 className="card-label">LIVE PREVIEW</h4>
                                        <div className="preview-controls-grp">
                                            <div className="group-by-config">
                                                <label>Group By Context:</label>
                                                <select 
                                                    value={groupByCol} 
                                                    onChange={(e) => setGroupByCol(e.target.value)}
                                                    className="preview-group-select"
                                                >
                                                    <option value="">(None - Grand Total Scalar)</option>
                                                    {schema.map(col => (
                                                        <option key={col.column_name} value={col.column_name}>{col.column_name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button 
                                                onClick={handleCalculatePreview}
                                                disabled={isCalculatingPreview || !expression.trim() || !isValid}
                                                className="preview-calc-trigger"
                                            >
                                                <RefreshCw size={10} className={isCalculatingPreview ? 'spinning' : ''} />
                                                <span>Refresh Preview</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="preview-tabs">
                                        <button 
                                            className={`preview-tab-btn ${previewTab === 'kpi' ? 'active' : ''}`}
                                            onClick={() => setPreviewTab('kpi')}
                                        >
                                            KPI Card
                                        </button>
                                        <button 
                                            className={`preview-tab-btn ${previewTab === 'scalar' ? 'active' : ''}`}
                                            onClick={() => setPreviewTab('scalar')}
                                        >
                                            Scalar
                                        </button>
                                        <button 
                                            className={`preview-tab-btn ${previewTab === 'table' ? 'active' : ''}`}
                                            onClick={() => setPreviewTab('table')}
                                        >
                                            Table
                                        </button>
                                        <button 
                                            className={`preview-tab-btn ${previewTab === 'chart' ? 'active' : ''}`}
                                            onClick={() => setPreviewTab('chart')}
                                        >
                                            Chart
                                        </button>
                                    </div>

                                    <div className="preview-tab-display">
                                        {isCalculatingPreview ? (
                                            <div className="preview-spinner-box">
                                                <RefreshCw size={18} className="spinning" />
                                                <span>Calculating...</span>
                                            </div>
                                        ) : previewError ? (
                                            <div className="preview-msg error">
                                                <AlertCircle size={14} />
                                                <span>{previewError}</span>
                                            </div>
                                        ) : previewResult !== null ? (
                                            <>
                                                {previewTab === 'kpi' && (
                                                    <div 
                                                        className="premium-kpi-preview"
                                                        style={{ borderLeftColor: getKpiColor() }}
                                                    >
                                                        <div className="kpi-name">{displayName || name || 'KPI Title'}</div>
                                                        <div className="kpi-value" style={{ color: getKpiColor() }}>
                                                            {typeof previewResult === 'object' ? previewFormatted[Object.keys(previewFormatted)[0]] : previewFormatted}
                                                        </div>
                                                        <div className="kpi-desc">{description || 'No description provided.'}</div>
                                                    </div>
                                                )}

                                                {previewTab === 'scalar' && (
                                                    <div className="premium-scalar-preview">
                                                        <div className="sc-val">{typeof previewResult === 'object' ? String(Object.values(previewResult)[0]) : previewFormatted}</div>
                                                        <div className="sc-raw">Raw Output: {typeof previewResult === 'object' ? String(Object.values(previewResult)[0]) : String(previewResult)}</div>
                                                    </div>
                                                )}

                                                {previewTab === 'table' && (
                                                    <div className="premium-table-preview">
                                                        {typeof previewResult === 'object' ? (
                                                            <table className="mini-tbl">
                                                                <thead>
                                                                    <tr>
                                                                        <th>{groupByCol || 'Category'}</th>
                                                                        <th className="num">Raw</th>
                                                                        <th className="num">Formatted</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {Object.entries(previewResult).map(([k, v]) => (
                                                                        <tr key={k}>
                                                                            <td>{k}</td>
                                                                            <td className="num">{typeof v === 'number' ? v.toFixed(3) : String(v)}</td>
                                                                            <td className="num fmt">{previewFormatted[k]}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <div className="no-grouping-table-msg">
                                                                Table preview requires a group context.
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {previewTab === 'chart' && (
                                                    <div className="premium-chart-preview">
                                                        {chartData.length > 0 ? (
                                                            <ResponsiveContainer width="100%" height={120}>
                                                                {typeof previewResult === 'object' ? (
                                                                    <BarChart data={chartData} margin={{ top: 5, bottom: 5, left: -20, right: 5 }}>
                                                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                                                                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                                                                        <Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 6, fontSize: 10 }} />
                                                                        <Bar dataKey="value" fill="#818cf8" radius={[2, 2, 0, 0]} />
                                                                    </BarChart>
                                                                ) : (
                                                                    <LineChart data={chartData} margin={{ top: 5, bottom: 5, left: -20, right: 5 }}>
                                                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                                                                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                                                                        <Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 6, fontSize: 10 }} />
                                                                        <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
                                                                    </LineChart>
                                                                )}
                                                            </ResponsiveContainer>
                                                        ) : (
                                                            <span className="no-chart-msg">Preview calculation first</span>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="preview-msg empty">
                                                <Info size={13} />
                                                <span>Click "Refresh Preview" to run scalar calculation.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* SCHEMA LIBRARY (RIGHT) */}
                            {showSchema && (
                                <div className="bi-designer-right-panel schema-column-panel">
                                    <h3 className="pane-sidebar-title">MODEL SCHEMA</h3>
                                    <div className="right-panel-tab-scroller">
                                        <span className="schema-sidebar-subtitle">Click item to insert into editor</span>
                                        <div className="library-search-box">
                                            <Search size={12} />
                                            <input 
                                                type="text"
                                                placeholder="Search columns or measures..."
                                                value={searchFieldText}
                                                onChange={(e) => setSearchFieldText(e.target.value)}
                                                className="lib-search-input"
                                            />
                                        </div>

                                        <div className="library-tree-scroller">
                                            {/* Columns */}
                                            <div className="library-tree-group">
                                                <span className="group-label">DATASET COLUMNS</span>
                                                <div className="group-items-list">
                                                    {filteredFields.map(f => (
                                                        <div 
                                                            key={f.column_name} 
                                                            className="lib-click-item field"
                                                            onClick={() => insertTerm(f.column_name)}
                                                        >
                                                            <Database size={11} />
                                                            <span className="item-name">{f.column_name}</span>
                                                            <span className="item-type">{f.data_type}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Measures */}
                                            {filteredExistingMeasures.length > 0 && (
                                                <div className="library-tree-group" style={{ marginTop: 12 }}>
                                                    <span className="group-label">EXISTING MEASURES</span>
                                                    <div className="group-items-list">
                                                        {filteredExistingMeasures.map(m => (
                                                            <div 
                                                                key={m.name} 
                                                                className="lib-click-item measure"
                                                                onClick={() => insertTerm(m.name)}
                                                            >
                                                                <Calculator size={11} />
                                                                <span className="item-name">{m.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Functions */}
                                            <div className="library-tree-group" style={{ marginTop: 12 }}>
                                                <span className="group-label">FUNCTIONS REFERENCE</span>
                                                <div className="group-items-list">
                                                    <div className="lib-click-item function" onClick={() => insertFunction('DIVIDE')}>
                                                        <span className="fn-sig">DIVIDE(a, b, [default])</span>
                                                    </div>
                                                    <div className="lib-click-item function" onClick={() => insertFunction('SUM')}>
                                                        <span className="fn-sig">SUM(column)</span>
                                                    </div>
                                                    <div className="lib-click-item function" onClick={() => insertFunction('AVERAGE')}>
                                                        <span className="fn-sig">AVERAGE(column)</span>
                                                    </div>
                                                    <div className="lib-click-item function" onClick={() => insertFunction('COUNT')}>
                                                        <span className="fn-sig">COUNT(column)</span>
                                                    </div>
                                                    <div className="lib-click-item function" onClick={() => insertFunction('MIN')}>
                                                        <span className="fn-sig">MIN(column)</span>
                                                    </div>
                                                    <div className="lib-click-item function" onClick={() => insertFunction('MAX')}>
                                                        <span className="fn-sig">MAX(column)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 4. AI COPILOT TAB */}
                    {mainTab === 'copilot' && (
                        <div className="ai-copilot-tab">
                            <div className="copilot-messages-container">
                                {copilotMessages.map((msg, idx) => (
                                    <div key={idx} className={`copilot-message-bubble ${msg.sender}`}>
                                        <div className="message-header">
                                            {msg.sender === 'bot' ? <Bot size={14} /> : <UserCheck size={14} />}
                                            <span className="sender-name">{msg.sender === 'bot' ? 'AI Assistant' : 'You'}</span>
                                        </div>
                                        <div className="message-body">
                                            <p>{msg.text}</p>
                                            {msg.formula && (
                                                <div className="generated-formula-box">
                                                    <pre>
                                                        <code>{msg.formula}</code>
                                                    </pre>
                                                    <button 
                                                        className="apply-formula-btn"
                                                        onClick={() => applyCopilotFormula(msg.formula)}
                                                    >
                                                        Apply to Formula Editor
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isGeneratingCopilot && (
                                    <div className="copilot-message-bubble bot thinking">
                                        <RefreshCw size={14} className="spinning" />
                                        <span>AI is generating formula...</span>
                                    </div>
                                )}
                            </div>
                            
                            <div className="copilot-input-bar-area">
                                <div className="suggestion-chips-row">
                                    <button 
                                        className="suggestion-chip-btn"
                                        onClick={() => setCopilotInput('Create a SUM formula for Column')}
                                    >
                                        SUM formula
                                    </button>
                                    <button 
                                        className="suggestion-chip-btn"
                                        onClick={() => setCopilotInput('Calculate average of units sold')}
                                    >
                                        Average formula
                                    </button>
                                    <button 
                                        className="suggestion-chip-btn"
                                        onClick={() => setCopilotInput('Calculate profit margin using Revenue and Cost')}
                                    >
                                        Profit Margin
                                    </button>
                                </div>
                                <div className="input-input-wrapper">
                                    <input 
                                        type="text" 
                                        placeholder="Describe what you want to calculate..."
                                        value={copilotInput}
                                        onChange={(e) => setCopilotInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendCopilot()}
                                        className="designer-input"
                                    />
                                    <button 
                                        onClick={handleSendCopilot}
                                        disabled={!copilotInput.trim() || isGeneratingCopilot}
                                        className="send-copilot-btn"
                                    >
                                        <Send size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer Controls */}
                <div className="bi-designer-footer">
                    <button className="designer-btn secondary" onClick={onClose}>
                        {mainTab === 'library' ? 'Close' : 'Cancel'}
                    </button>
                    {mainTab === 'editor' && (
                        <button 
                            className="designer-btn primary" 
                            onClick={handleSave}
                            disabled={!name.trim() || !expression.trim() || !isValid || isValidating}
                        >
                            Save Measure
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default BIMeasureDesignerModal;
