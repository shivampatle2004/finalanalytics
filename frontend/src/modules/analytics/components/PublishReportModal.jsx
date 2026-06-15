import React from 'react';
import { createPortal } from 'react-dom';
import { Share2, X, Check, Copy, ExternalLink } from 'lucide-react';
import './PublishReportModal.css';

function permLabel(permission) {
  if (permission === 'view_edit') return 'Can View & Edit';
  if (permission === 'edit') return 'Can Edit';
  return 'Can View';
}

function effectivePermissionExplanation(selectedRoles) {
  const hierarchy = ['view_edit', 'edit', 'view'];
  let bestIdx = 2;
  selectedRoles.forEach((role) => {
    const idx = hierarchy.indexOf(role.permission || 'view');
    if (idx >= 0 && idx < bestIdx) bestIdx = idx;
  });
  const eff = hierarchy[bestIdx];
  const label = eff === 'view' ? 'View only' : eff === 'edit' ? 'Can edit' : 'Can view & edit';
  const expl = eff === 'view'
    ? 'Recipients get a read-only report.'
    : eff === 'edit'
      ? 'Recipients can edit visuals with role permissions applied.'
      : 'Recipients can view and edit with role permissions applied.';
  return { label, expl };
}

export default function PublishReportModal({
  isOpen,
  onClose,
  step,
  shareMode,
  onShareModeChange,
  rolesList,
  selectedRoleIds,
  onToggleRoleId,
  onUseViewAsRoles,
  viewAsActive,
  onConfirm,
  publishLink,
}) {
  if (!isOpen) return null;

  const selectedRoles = rolesList.filter((r) => selectedRoleIds.includes(r.id));
  const permNote = shareMode === 'rls' && selectedRoles.length > 0
    ? effectivePermissionExplanation(selectedRoles)
    : null;

  const panel = (
    <div className="prm-overlay" onClick={onClose}>
      <div className="prm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="prm-header">
          <div className="prm-header-icon">
            <Share2 size={20} strokeWidth={2} />
          </div>
          <div className="prm-header-text">
            <h2>Publish Report</h2>
            <p>Share a link with full or role-based access.</p>
          </div>
          <button type="button" className="prm-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="prm-body">
          {step === 'working' && (
            <div className="prm-working">
              <div className="prm-spinner" />
              <span>Creating your share link…</span>
            </div>
          )}

          {step === 'configure' && (
            <>
              <div className="prm-options">
                <label
                  className={`prm-option ${shareMode === 'full' ? 'prm-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="publish-share-mode"
                    checked={shareMode === 'full'}
                    onChange={() => onShareModeChange('full')}
                  />
                  <span>
                    <div className="prm-option-title">Full report access</div>
                    <div className="prm-option-desc">
                      Opens the report without forcing a security role.
                    </div>
                  </span>
                </label>

                <label
                  className={`prm-option ${shareMode === 'rls' ? 'prm-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="publish-share-mode"
                    checked={shareMode === 'rls'}
                    onChange={() => onShareModeChange('rls')}
                  />
                  <span>
                    <div className="prm-option-title">Restricted — security roles</div>
                    <div className="prm-option-desc">
                      Link applies selected roles. View or edit access follows each role&apos;s permission.
                    </div>
                  </span>
                </label>
              </div>

              {shareMode === 'rls' && (
                <div className="prm-roles">
                  <div className="prm-roles-head">
                    <span className="prm-roles-label">Roles on this link</span>
                    {viewAsActive && (
                      <button type="button" className="prm-roles-use-view" onClick={onUseViewAsRoles}>
                        Use current View as
                      </button>
                    )}
                  </div>

                  {!rolesList.length ? (
                    <p className="prm-roles-empty">
                      No roles yet. Add them under Modeling → Security → Manage roles.
                    </p>
                  ) : (
                    <ul className="prm-roles-list">
                      {rolesList.map((role) => (
                        <li key={role.id}>
                          <label className="prm-role-row">
                            <input
                              type="checkbox"
                              checked={selectedRoleIds.includes(role.id)}
                              onChange={() => onToggleRoleId(role.id)}
                            />
                            <span className="prm-role-name">{role.name}</span>
                            <span className="prm-role-perm">{permLabel(role.permission)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}

                  {permNote && (
                    <p className="prm-note">
                      <strong>Effective permission:</strong> {permNote.label}. {permNote.expl}
                    </p>
                  )}
                </div>
              )}

              <div className="prm-footer">
                <button type="button" className="prm-btn-ghost" onClick={onClose}>Cancel</button>
                <button type="button" className="prm-btn-primary" onClick={onConfirm}>Create link</button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="prm-done">
              <div className="prm-done-icon">
                <Check size={22} strokeWidth={2.5} />
              </div>
              <h3>Link ready</h3>
              <p>
                {shareMode === 'rls'
                  ? 'This URL applies the selected security roles and their permissions.'
                  : 'Anyone with this link can open the report with full access.'}
              </p>
              <div className="prm-link-row">
                <input className="prm-link-input" readOnly value={publishLink} />
                <button
                  type="button"
                  className="prm-link-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(publishLink);
                  }}
                >
                  <Copy size={12} />
                  Copy
                </button>
                <button
                  type="button"
                  className="prm-link-btn"
                  onClick={() => window.open(publishLink, '_blank', 'noopener,noreferrer')}
                  disabled={!publishLink}
                >
                  <ExternalLink size={12} />
                  Open
                </button>
              </div>
              <div className="prm-footer" style={{ width: '100%', borderTop: 'none', marginTop: 8, paddingTop: 0 }}>
                <button type="button" className="prm-btn-primary" onClick={onClose}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
