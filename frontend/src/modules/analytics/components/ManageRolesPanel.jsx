/**
 * ManageRolesPanel.jsx
 *
 * Role editor for row-level security — create, rename, and set permissions per role.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Plus, Trash2, X, Shield, Loader } from 'lucide-react';
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
} from '../services/rlsService';
import './ManageRolesPanel.css';

export default function ManageRolesPanel({ fileId, onClose }) {
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftPermission, setDraftPermission] = useState('view');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [deletingId, setDeletingId] = useState(null);
  const [addingRole, setAddingRole] = useState(false);

  const nameRef = useRef(null);

  useEffect(() => {
    loadRoles();
  }, [fileId]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await getRoles(fileId);
      setRoles(data);
    } catch (e) {
      flash(`Failed to load roles: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectRole = useCallback((role) => {
    setSelectedRoleId(role.id);
    setDraftName(role.name);
    setDraftDesc(role.description || '');
    setDraftPermission(role.permission || 'view');
    setStatusMsg({ text: '', type: '' });
  }, []);

  const nextRoleName = () => {
    const base = 'New Role';
    const names = new Set(roles.map((r) => r.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i += 1;
    return `${base} ${i}`;
  };

  const handleAddRole = async () => {
    if (!fileId) {
      flash('Open a report or dataset first — roles are scoped to the current file.', 'error');
      return;
    }
    setAddingRole(true);
    try {
      const role = await createRole({ name: nextRoleName(), fileId, description: '', permission: 'view' });
      setRoles((prev) => [...prev, role]);
      selectRole(role);
      setTimeout(() => nameRef.current?.focus(), 100);
    } catch (e) {
      flash(`Could not create role: ${e.message}`, 'error');
    } finally {
      setAddingRole(false);
    }
  };

  const handleDeleteRole = async (role, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    setDeletingId(role.id);
    try {
      await deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (selectedRoleId === role.id) {
        setSelectedRoleId(null);
        setDraftName('');
        setDraftDesc('');
        setDraftPermission('view');
      }
    } catch (e) {
      flash(`Delete failed: ${e.message}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    if (!selectedRoleId) return;

    const name = draftName.trim();
    if (!name) {
      flash('Role name cannot be empty.', 'error');
      return;
    }

    setSaving(true);
    try {
      const original = roles.find((r) => r.id === selectedRoleId);
      if (
        original.name !== name
        || (original.description || '') !== draftDesc
        || original.permission !== draftPermission
      ) {
        await updateRole(selectedRoleId, {
          name,
          description: draftDesc,
          permission: draftPermission,
        });
      }

      const freshRoles = await getRoles(fileId);
      setRoles(freshRoles);
      const freshRole = freshRoles.find((r) => r.id === selectedRoleId);
      if (freshRole) {
        setDraftName(freshRole.name);
        setDraftDesc(freshRole.description || '');
        setDraftPermission(freshRole.permission || 'view');
      }

      flash('Role saved successfully.', 'success');
    } catch (e) {
      flash(`Save failed: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const flash = (text, type) => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 4000);
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  const panel = (
    <div className="mrp-overlay" onClick={onClose}>
      <div className="mrp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mrp-header">
          <div className="mrp-header-icon">
            <Lock size={20} strokeWidth={2} />
          </div>
          <div className="mrp-header-text">
            <h2>Manage Roles</h2>
            <p>Set role name and permissions for this report.</p>
          </div>
          <button className="mrp-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mrp-body">
          <div className="mrp-sidebar">
            <div className="mrp-sidebar-header">Roles</div>
            <div className="mrp-roles-list">
              {loading && <div className="mrp-sidebar-empty">Loading…</div>}
              {!loading && roles.length === 0 && (
                <div className="mrp-sidebar-empty">No roles yet</div>
              )}
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={`mrp-role-item ${selectedRoleId === role.id ? 'active' : ''}`}
                  onClick={() => selectRole(role)}
                  title={role.name}
                >
                  <span className="mrp-role-item-icon">
                    <Shield size={14} strokeWidth={2} />
                  </span>
                  <span className="mrp-role-name">{role.name}</span>
                  <button
                    className="mrp-role-del-btn"
                    onClick={(e) => handleDeleteRole(role, e)}
                    disabled={deletingId === role.id}
                    title="Delete role"
                  >
                    {deletingId === role.id ? <Loader size={12} /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mrp-add-role-btn"
              onClick={handleAddRole}
              disabled={addingRole || !fileId}
              title={!fileId ? 'Open a report first' : 'Create a new role'}
            >
              {addingRole ? <Loader size={15} className="mrp-btn-spin" /> : <Plus size={15} />}
              {addingRole ? 'Creating…' : 'New Role'}
            </button>
          </div>

          <div className="mrp-editor">
            {!selectedRole ? (
              <div className="mrp-editor-empty">
                <Shield size={36} />
                <p>Select or create a role</p>
              </div>
            ) : (
              <>
                <div className="mrp-editor-content">
                  <div className="mrp-field-row-inline">
                    <div className="mrp-field mrp-field-name">
                      <label>Role name</label>
                      <input
                        ref={nameRef}
                        id="mrp-role-name-input"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="e.g. Manager"
                      />
                    </div>
                    <div className="mrp-field mrp-field-permission">
                      <label>Permission</label>
                      <select
                        value={draftPermission}
                        onChange={(e) => setDraftPermission(e.target.value)}
                      >
                        <option value="view">Can View</option>
                        <option value="edit">Can Edit</option>
                        <option value="view_edit">Can View & Edit</option>
                      </select>
                    </div>
                  </div>
                  <div className="mrp-field mrp-field-desc">
                    <label>Description</label>
                    <textarea
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      placeholder="Optional"
                      rows={2}
                    />
                  </div>
                </div>

                <div className={`mrp-editor-footer${statusMsg.text ? '' : ' mrp-editor-footer--actions-only'}`}>
                  {statusMsg.text && (
                    <p
                      className={`mrp-save-feedback mrp-save-feedback--${statusMsg.type}`}
                      role="status"
                      aria-live="polite"
                    >
                      {statusMsg.text}
                    </p>
                  )}
                  <div className="mrp-footer-actions">
                    <button type="button" className="mrp-cancel-btn" onClick={onClose}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="mrp-save-btn"
                      onClick={handleSave}
                      disabled={saving}
                      id="mrp-save-btn"
                    >
                      {saving ? <><span className="mrp-spinner" /> Saving…</> : 'Save Role'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {!selectedRole && statusMsg.text && (
          <p
            className={`mrp-panel-feedback mrp-panel-feedback--${statusMsg.type}`}
            role="status"
            aria-live="polite"
          >
            {statusMsg.text}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
