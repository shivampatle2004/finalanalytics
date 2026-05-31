import React, { useState, useEffect, useRef } from 'react';
import { FiSave, FiX } from 'react-icons/fi';

const SaveQueryModal = ({ isOpen, onClose, onSave, initialName = '' }) => {
    const [name, setName] = useState(initialName);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            // Small delay to ensure modal is mounted before focusing
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, initialName]);

    if (!isOpen) return null;

    const handleSave = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        onSave(trimmed);
        onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border"
                style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, var(--df-accent), color-mix(in srgb, var(--df-accent) 70%, #000))' }}
                        >
                            <FiSave size={15} color="#fff" />
                        </div>
                        <div>
                            <h3 className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--df-strong)' }}>
                                Name your query
                            </h3>
                            <p className="text-[11px]" style={{ color: 'var(--df-text-muted)' }}>
                                It will appear in your workspace
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[var(--df-sidebar-hover)]"
                        style={{ color: 'var(--df-text-muted)' }}
                    >
                        <FiX size={16} />
                    </button>
                </div>

                {/* Input */}
                <div className="px-5 pb-5">
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="e.g. Monthly Sales Report"
                        className="w-full df-input py-2.5 px-4 rounded-xl text-sm mb-4"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-[13px] font-medium rounded-xl transition-all hover:bg-[var(--df-sidebar-hover)]"
                            style={{ color: 'var(--df-text-muted)' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!name.trim()}
                            className="px-5 py-2 text-[13px] font-bold rounded-xl text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: 'linear-gradient(135deg, var(--df-accent), color-mix(in srgb, var(--df-accent) 80%, #000))' }}
                        >
                            Save Query
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SaveQueryModal;
