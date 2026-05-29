import React, { useState, useEffect, useMemo } from 'react';
import { X, ChevronDown, ChevronRight, Zap, Play, Plus, Search, Info, Settings, Code, Activity, Database, Sparkles, Wand2 } from 'lucide-react';
import './BIQuickMeasurePanel.css';

const BIQuickMeasurePanel = ({ isOpen, onClose, schema, onAddMeasure, isCollapsed, onToggleCollapse, fileId }) => {
  const [templates, setTemplates] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [measureName, setMeasureName] = useState('New Quick Measure');
  const [fieldMappings, setFieldMappings] = useState({});
  const [previewFormula, setPreviewFormula] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch templates and suggestions on mount
  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      fetchSuggestions();
    }
  }, [isOpen, schema]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/analytics/api/modeling/quick-measures/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e) {
      console.error("Failed to load Quick Measure templates", e);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/analytics/api/modeling/quick-measures/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: schema || [] })
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    } catch (e) {
      console.error("Failed to load Quick Measure suggestions", e);
    }
  };

  const currentTemplate = useMemo(() => {
    for (const cat of Object.values(templates)) {
      const found = cat.find(t => t.id === selectedTemplateId);
      if (found) return found;
    }
    return null;
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (currentTemplate) {
      setMeasureName(`Quick ${currentTemplate.label}`);
      setFieldMappings({});
      setPreviewFormula('');
      setPreviewResult(null);
      setValidationErrors([]);
    }
  }, [currentTemplate]);

  // Generate formula preview when mappings change
  useEffect(() => {
    if (!currentTemplate) return;
    
    // Check if all required mappings are present
    const hasAll = currentTemplate.params.every(p => fieldMappings[p.key] || p.default !== undefined);
    if (!hasAll) return;

    const generatePreview = async () => {
      try {
        const res = await fetch('/analytics/api/modeling/quick-measures/generate-formula', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: currentTemplate.id,
            field_mappings: fieldMappings,
            columns: schema || []
          })
        });
        if (res.ok) {
          const data = await res.json();
          setPreviewFormula(data.formula);
          setValidationErrors(data.errors || []);
        }
      } catch (e) {
        console.error("Failed to generate formula", e);
      }
    };
    generatePreview();
  }, [fieldMappings, currentTemplate, schema]);

  const handleExecutePreview = async () => {
    if (!currentTemplate || !fileId || validationErrors.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/analytics/api/modeling/quick-measures/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: currentTemplate.id,
          field_mappings: fieldMappings,
          file_id: fileId
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewResult(data.result !== null ? data.result : 'Error');
      }
    } catch (e) {
      setPreviewResult('Execution Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentTemplate || !measureName.trim()) return;

    // If formula hasn't been generated yet, generate it now before saving
    let formulaToSave = previewFormula;
    if (!formulaToSave) {
      try {
        const fRes = await fetch('/analytics/api/modeling/quick-measures/generate-formula', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: currentTemplate.id,
            field_mappings: fieldMappings,
            columns: schema || []
          })
        });
        if (fRes.ok) {
          const fData = await fRes.json();
          formulaToSave = fData.formula;
        }
      } catch (e) {
        console.error("Formula generation failed", e);
      }
    }

    // Build a fallback formula from template if still empty
    if (!formulaToSave) {
      formulaToSave = currentTemplate.formula_template || `${currentTemplate.label}()`;
    }

    setLoading(true);
    try {
      const payload = {
        name: measureName.trim(),
        category: currentTemplate.category,
        template_id: currentTemplate.id,
        template_label: currentTemplate.label,
        field_mappings: fieldMappings,
        formula: formulaToSave,
        aggregation: currentTemplate.aggregation,
        file_id: fileId || null
      };

      const res = await fetch('/analytics/api/modeling/quick-measures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        onAddMeasure({
          id: data.id,
          name: data.name,
          formula: data.formula,
          type: 'quick_measure',
          aggregation: data.aggregation,
          template_id: data.template_id,
          config: fieldMappings
        });
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          // Reset state for next use
          setSelectedTemplateId('');
          setMeasureName('New Quick Measure');
          setFieldMappings({});
          setPreviewFormula('');
          setPreviewResult(null);
          setValidationErrors([]);
          onClose();
        }, 1200);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to save: ${errData.detail || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error saving Quick Measure.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (isCollapsed) {
    return (
      <div className="bi-quick-measure-collapsed" onClick={onToggleCollapse}>
        <div className="qm-collapsed-icon">
          <Zap size={20} />
        </div>
        <div className="qm-collapsed-text">Quick Measures</div>
      </div>
    );
  }

  // Filter templates by search
  const filteredTemplates = Object.entries(templates).reduce((acc, [cat, items]) => {
    const filtered = items.filter(t => t.label.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filtered.length > 0) acc[cat] = filtered;
    return acc;
  }, {});

  const getCategoryIcon = (cat) => {
    switch(cat) {
      case 'aggregations': return <Activity size={16} />;
      case 'mathematical': return <Settings size={16} />;
      case 'time_intelligence': return <Activity size={16} />;
      case 'filtered_values': return <Database size={16} />;
      case 'comparison': return <Activity size={16} />;
      default: return <Zap size={16} />;
    }
  };

  const formatCategoryName = (cat) => {
    return cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="bi-quick-measure-panel">
      {/* Header */}
      <div className="qm-header">
        <div className="qm-header-title">
          <div className="qm-header-icon-box">
            <Zap size={18} />
          </div>
          <h3>Quick Measures</h3>
        </div>
        <div className="qm-header-actions">
          <button className="qm-icon-btn" onClick={onToggleCollapse} title="Collapse">
            <ChevronRight size={18} />
          </button>
          <button className="qm-icon-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="qm-content-scroll">
        
        {/* Step 1: Select Template */}
        <div className="qm-section qm-glass-panel">
          <div className="qm-section-header">
            <h4>1. Select Calculation</h4>
          </div>
          
          <div className="qm-search-box">
            <Search size={14} className="qm-search-icon" />
            <input 
              type="text" 
              placeholder="Search templates..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {suggestions.length > 0 && !searchQuery && (
            <div className="qm-suggestions">
              <div className="qm-suggestions-title">
                <Wand2 size={14} /> AI Suggestions
              </div>
              <div className="qm-suggestions-list">
                {suggestions.map((s, idx) => (
                  <button key={idx} className="qm-suggestion-chip" onClick={() => setSelectedTemplateId(s.template_id)}>
                    <Sparkles size={12} /> {s.template_id.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="qm-template-accordion">
            {Object.entries(filteredTemplates).map(([cat, items]) => (
              <div className={`qm-accordion-group ${activeCategory === cat ? 'expanded' : ''}`} key={cat}>
                <button 
                  className="qm-accordion-header" 
                  onClick={() => setActiveCategory(prev => prev === cat ? null : cat)}
                >
                  <div className="qm-accordion-label">
                    {getCategoryIcon(cat)}
                    <span>{formatCategoryName(cat)}</span>
                  </div>
                  <ChevronDown size={14} className="qm-accordion-chevron" />
                </button>
                <div className="qm-accordion-body">
                  {items.map(t => (
                    <button 
                      key={t.id} 
                      className={`qm-template-item ${selectedTemplateId === t.id ? 'active' : ''}`}
                      onClick={() => setSelectedTemplateId(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step 2: Configure Parameters */}
        {currentTemplate && (
          <div className="qm-section qm-glass-panel slide-up-anim">
            <div className="qm-section-header">
              <h4>2. Configure Mappings</h4>
              <div className="qm-tooltip-icon" title={currentTemplate.description}>
                <Info size={14} />
              </div>
            </div>

            <div className="qm-measure-name">
              <label>Measure Name</label>
              <input 
                type="text" 
                value={measureName}
                onChange={e => setMeasureName(e.target.value)}
              />
            </div>

            <div className="qm-params-list">
              {currentTemplate.params.map(param => (
                <div className="qm-param-row" key={param.key}>
                  <label>
                    {param.label}
                    {param.type && <span className={`qm-type-badge qm-type-${param.type}`}>{param.type}</span>}
                  </label>
                  {param.type === 'number' || param.type === 'text' ? (
                    <input 
                      type="text" 
                      className="qm-param-input"
                      placeholder={`Enter ${param.label}...`}
                      value={fieldMappings[param.key] || param.default || ''}
                      onChange={e => setFieldMappings(prev => ({...prev, [param.key]: e.target.value}))}
                    />
                  ) : (
                    <select 
                      className="qm-param-select"
                      value={fieldMappings[param.key] || ''}
                      onChange={e => setFieldMappings(prev => ({...prev, [param.key]: e.target.value}))}
                    >
                      <option value="">Select a column...</option>
                      {schema?.map(col => (
                        <option key={col.column_name} value={col.column_name}>
                          {col.column_name} ({col.data_type})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Formula Preview */}
        {currentTemplate && previewFormula && (
          <div className="qm-section qm-glass-panel slide-up-anim" style={{ animationDelay: '0.1s' }}>
            <div className="qm-section-header">
              <h4>3. Formula & Validation</h4>
            </div>

            {validationErrors.length > 0 ? (
              <div className="qm-validation-warnings">
                <div className="qm-warning-title">⚠ Type hints (you can still save):</div>
                {validationErrors.map((err, i) => <div key={i} className="qm-warning-item">{err}</div>)}
              </div>
            ) : previewFormula ? (
              <div className="qm-validation-success">
                ✓ Fields mapped correctly. Ready to add.
              </div>
            ) : null}

            <div className="qm-code-block">
              <div className="qm-code-header">
                <Code size={14} /> DAX Formula
              </div>
              <pre>{previewFormula}</pre>
            </div>

            <div className="qm-preview-actions">
              <button 
                className="qm-btn qm-btn-secondary" 
                onClick={handleExecutePreview}
                disabled={loading || validationErrors.length > 0 || !fileId}
              >
                {loading ? 'Evaluating...' : <><Play size={14} /> Evaluate Preview</>}
              </button>
              
              {previewResult !== null && (
                <div className="qm-preview-result">
                  Result: <strong>{previewResult}</strong>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="qm-footer">
        {saveSuccess ? (
          <div className="qm-save-success">
            ✓ Measure added to Fields pane
          </div>
        ) : (
          <>
            <button className="qm-btn qm-btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="qm-btn qm-btn-primary"
              disabled={!currentTemplate || loading}
              onClick={handleSave}
            >
              {loading ? 'Saving...' : <><Plus size={14} /> Add Measure</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default BIQuickMeasurePanel;
// Force Vite HMR reload

