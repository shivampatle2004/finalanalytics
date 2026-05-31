import React, { useState, useRef, useEffect } from 'react';
import { FiFileText, FiTrash2, FiRotateCcw, FiMoreVertical, FiStar, FiUsers, FiFolder } from 'react-icons/fi';
import Breadcrumbs from '../../components/workspace/Breadcrumbs';
import CreateDropdown from '../../components/workspace/CreateDropdown';
import FileList from '../../components/workspace/FileList';
import NotebookEditor from '../../components/workspace/NotebookEditor';
import WorkspaceSidebar from '../../components/workspace/WorkspaceSidebar';
import ContextMenu from '../../components/workspace/ContextMenu';
import SearchBar from '../../components/workspace/SearchBar';
import ActionModal from '../../components/workspace/ActionModal';
import { useWorkspace } from '../../context/WorkspaceContext';
import '../../styles/Workspace.css';

const FilePreview = ({ file, onBack }) => (
  <div className="flex flex-col h-full rounded-xl overflow-hidden min-h-[400px] border border-[#E5E7EB]" style={{ backgroundColor: '#FFFFFF' }}>
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]" style={{ backgroundColor: '#F9FAFB' }}>
      <div className="flex items-center space-x-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
          style={{ color: '#4B5563' }}
        >
          ←
        </button>
        <h2 className="text-[13px] font-semibold flex items-center" style={{ color: '#111827' }}>
          <span className="text-[9px] px-1.5 py-0.5 rounded mr-2 uppercase tracking-wider font-medium bg-gray-100 text-gray-500 border border-gray-200">File</span>
          {file.name}
        </h2>
      </div>
    </div>
    <div className="flex-1 p-8 flex flex-col items-center justify-center text-center bg-white">
      <FiFileText size={48} className="text-gray-300 mb-4" />
      <h3 className="text-lg font-semibold text-[#111827]">{file.name}</h3>
      <p className="text-sm mt-2 text-gray-500">Preview is not available for this file type.</p>
    </div>
  </div>
);

const WorkspacePage = () => {
  const {
    items,
    currentFolderId,
    activeItem,
    loading,
    setActiveItem,
    handleNavigate,
    handleOpen,
    handleCreate,
    handleRename,
    handleDelete,
    handleRestore,
    handlePermanentDelete,
    handleToggleFavorite,
    handleSaveContent,
    handleEmptyTrash,
    handleRestoreAll,
    handleClone,
    handleMove,
  } = useWorkspace();

  const [contextMenu, setContextMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('folder');
  const [filters, setFilters] = useState({ Type: 'All', Owner: 'All', Modified: 'All' });

  const [showShareModal, setShowShareModal] = useState(false);
  const [createModalState, setCreateModalState] = useState({ isOpen: false, type: null, extra: null, nameValue: '' });
  const [actionModal, setActionModal] = useState({ isOpen: false, type: null, item: null });
  const headerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        // No-op for now
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Virtual view helpers
  const isTrashView = currentFolderId === '__trash__';
  const isFavoritesView = currentFolderId === '__favorites__';
  const isSharedView = currentFolderId === '__shared__';
  const isUsersView = currentFolderId === '__users__';
  const isVirtualView = isTrashView || isFavoritesView || isSharedView || isUsersView;

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const triggerAction = (type, item) => {
    setActionModal({ isOpen: true, type, item });
  };

  const handleActionConfirm = (value) => {
    const { type, item } = actionModal;
    if (type === 'rename') handleRename(item, value);
    else if (type === 'move') handleMove(item, value);
    else if (type === 'clone') handleClone(item, value);
    setActionModal({ isOpen: false, type: null, item: null });
  };

  const getSearchItems = () => {
    if (searchQuery && searchScope === 'workspace') {
      return items.filter(i => !i.isDeleted);
    }
    return items;
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ backgroundColor: 'var(--df-bg)', fontFamily: "'Inter', sans-serif" }}>
      {/* ── Row 1: Heading spanning full width at the top ── */}
      <div className="dw-header">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <h1>
              {activeItem
                ? activeItem.name
                : isTrashView ? 'Trash'
                  : isFavoritesView ? 'Favorites'
                    : isSharedView ? 'Shared with me'
                      : isUsersView ? 'My Notebooks'
                        : 'Workspace'
              }
              {!activeItem && (
                <span className="dw-header-badge">
                  {getSearchItems().filter(i => (i.parentId === currentFolderId || (isVirtualView && i.isDeleted === isTrashView))).length}
                </span>
              )}
            </h1>
            <p>
              {activeItem
                ? `Editing ${activeItem.type}: ${activeItem.name}`
                : isTrashView ? 'Recover and manage your deleted notebooks and folders'
                  : isFavoritesView ? 'Quickly access your most important notebooks and assets'
                    : isSharedView ? 'Collaborate on assets shared with you by other team members'
                      : isUsersView ? 'Browse and organize your personal workspace notebooks'
                        : 'Central hub for all your analytics projects and workspaces'
              }
            </p>
          </div>

          {!activeItem && !isVirtualView && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setShowShareModal(true)}
                className="dw-btn-secondary"
              >
                Share
              </button>
              <CreateDropdown onCreate={(type, extra) => {
                setCreateModalState({ isOpen: true, type, extra, nameValue: `New ${type}` });
              }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Sidebar + Content side by side ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Workspace sidebar */}
        <WorkspaceSidebar
          activeSection={currentFolderId}
          onNavigate={handleNavigate}
          items={items}
        />

        {/* Main content */}
        <div className="dw-workspace-container">
          {/* Search row */}
          {!activeItem && (
            <div className="dw-search-container" style={{ padding: '12px 24px 12px 0' }}>
              <div className="flex items-center gap-4">
                <div className="flex-1 w-full">
                  <SearchBar
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    searchScope={searchScope}
                    setSearchScope={setSearchScope}
                    filters={filters}
                    setFilters={setFilters}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Main content area - Scrolling */}
          <div className="dw-content-scroll df-scrollbar">
            <div className="min-h-0 h-full">
              {activeItem ? (
                activeItem.type === 'file' ? (
                  <FilePreview file={activeItem} onBack={() => setActiveItem(null)} />
                ) : (
                  <NotebookEditor
                    notebook={activeItem}
                    onBack={() => setActiveItem(null)}
                    onSave={handleSaveContent}
                  />
                )
              ) : items.filter(i => (i.parentId === currentFolderId || (isVirtualView && i.isDeleted === isTrashView))).length === 0 ? (
                <div className="dw-empty-container">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--df-bg)] border border-[var(--df-border-light)] shadow-sm flex items-center justify-center mb-4">
                    <FiFolder size={32} className="text-[var(--df-text-muted)] opacity-30" />
                  </div>
                  <p className="text-[15px] font-medium text-[var(--df-text-muted)]">This folder is empty</p>
                </div>
              ) : (
                <FileList
                  items={getSearchItems()}
                  currentFolderId={(searchScope === 'workspace' && searchQuery) ? null : currentFolderId}
                  onOpen={handleOpen}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onToggleFavorite={handleToggleFavorite}
                  onContextMenu={handleContextMenu}
                  isTrashView={isTrashView}
                  isFavoritesView={isFavoritesView}
                  isSharedView={isSharedView || (searchScope === 'workspace' && searchQuery)}
                  isUsersView={isUsersView}
                  searchQuery={searchQuery}
                  filters={filters}
                  onRestore={handleRestore}
                  onPermanentDelete={handlePermanentDelete}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-Screen Modals */}      {/* Create Modal */}
      {createModalState.isOpen && (
        <div className="dw-modal-overlay" onClick={() => setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' })}>
          <div className="dw-modal-content !max-w-[480px]" onClick={e => e.stopPropagation()}>
            <div className="dw-modal-header">
              <h2 className="dw-modal-title">
                Create {createModalState.type === 'folder' ? 'Folder' : `Notebook (${createModalState.extra?.language?.toUpperCase() || 'SQL'})`}
              </h2>
              <button
                onClick={() => setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' })}
                className="p-2 rounded-xl transition-all hover:bg-[var(--df-sidebar-hover)] text-[var(--df-text-muted)] hover:text-[var(--df-strong)]"
              >
                <FiRotateCcw className="rotate-45" size={18} />
              </button>
            </div>

            <div className="dw-modal-body">
              <div className="mb-8">
                <label className="block text-[11px] mb-3 font-black uppercase tracking-[0.1em] text-[var(--df-text-muted)]">
                  Name for new {createModalState.type}
                </label>
                <div className="w-full flex items-center border border-[var(--df-border)] rounded-2xl px-5 py-3 text-sm focus-within:border-[var(--df-accent)] focus-within:ring-4 focus-within:ring-[var(--df-accent-soft)] bg-[var(--df-bg-secondary)] transition-all">
                  <input
                    autoFocus
                    type="text"
                    className="flex-1 bg-transparent outline-none text-[var(--df-text)] placeholder-[var(--df-text-muted)] font-medium"
                    placeholder={`Enter name...`}
                    value={createModalState.nameValue}
                    onChange={(e) => setCreateModalState(prev => ({ ...prev, nameValue: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && createModalState.nameValue.trim()) {
                        handleCreate(createModalState.type, { ...createModalState.extra, name: createModalState.nameValue.trim() });
                        setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' });
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="dw-modal-footer">
              <button
                onClick={() => setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' })}
                className="px-6 py-2.5 text-[13.5px] font-bold text-[var(--df-text-muted)] hover:bg-[var(--df-sidebar-hover)] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (createModalState.nameValue.trim()) {
                    handleCreate(createModalState.type, { ...createModalState.extra, name: createModalState.nameValue.trim() });
                    setCreateModalState({ isOpen: false, type: null, extra: null, nameValue: '' });
                  }
                }}
                className="dw-btn-primary !px-8"
                disabled={!createModalState.nameValue.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Share Modal */}
      {showShareModal && (
        <div className="dw-modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="dw-modal-content" onClick={e => e.stopPropagation()}>
            <div className="dw-modal-header">
              <h2 className="dw-modal-title">
                Sharing: admin@arithwise.com
              </h2>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-2 rounded-xl transition-all hover:bg-[var(--df-sidebar-hover)] text-[var(--df-text-muted)] hover:text-[var(--df-strong)]"
              >
                <FiRotateCcw className="rotate-45" size={18} />
              </button>
            </div>

            <div className="dw-modal-body">
              {/* User Search Input */}
              <div className="mb-8">
                <div className="w-full flex items-center border border-[var(--df-border)] rounded-2xl px-5 py-3 text-sm focus-within:border-[var(--df-accent)] focus-within:ring-4 focus-within:ring-[var(--df-accent-soft)] bg-[var(--df-bg-secondary)] transition-all">
                  <input
                    type="text"
                    className="flex-1 bg-transparent outline-none text-[var(--df-text)] placeholder-[var(--df-text-muted)]"
                    placeholder="Type to add multiple users, groups or service principals"
                  />
                  <span className="text-[var(--df-text-muted)] text-[10px] ml-2">▼</span>
                </div>
              </div>

              {/* People List */}
              <div className="flex flex-col">
                <div className="text-[11px] mb-5 font-black uppercase tracking-[0.1em] text-[var(--df-text-muted)] flex items-center gap-2">
                  People with access
                  <span className="cursor-help w-4 h-4 rounded-full border border-[var(--df-border)] flex items-center justify-center text-[9px] font-bold">?</span>
                </div>

                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[var(--df-accent-soft)] flex items-center justify-center text-[var(--df-accent)] text-sm font-black border border-[var(--df-accent-medium)]">A</div>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-[var(--df-strong)]">admin@arithwise.com</span>
                        <span className="text-[11px] text-[var(--df-text-muted)] font-medium">Owner</span>
                      </div>
                    </div>
                    <button className="text-[13px] font-bold text-[var(--df-accent)] hover:underline">Can Manage</button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[var(--df-bg-secondary)] flex items-center justify-center text-[var(--df-text-muted)] text-sm font-black border border-[var(--df-border)]">G</div>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-[var(--df-strong)]">Admins</span>
                        <span className="text-[11px] text-[var(--df-text-muted)] font-medium">Group</span>
                      </div>
                    </div>
                    <button className="text-[13px] font-bold text-[var(--df-text-muted)] cursor-not-allowed">
                      Can Manage <span className="opacity-40 text-[10px] font-medium">(inherited)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="dw-modal-footer">
              <button className="text-[13.5px] font-bold text-[var(--df-accent)] flex items-center gap-2 hover:bg-[var(--df-accent-soft)] px-4 py-2 rounded-xl transition-all">
                <span className="text-base">🔗</span> Copy link
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onRename={(item) => triggerAction('rename', item)}
          onDelete={handleDelete}
          onToggleFavorite={handleToggleFavorite}
          onRestore={handleRestore}
          onPermanentDelete={handlePermanentDelete}
          onClone={(item) => triggerAction('clone', item)}
          onMove={(item) => triggerAction('move', item)}
          isTrashView={isTrashView}
        />
      )
      }

      {/* Action Modals */}
      <ActionModal
        isOpen={actionModal.isOpen}
        type={actionModal.type}
        item={actionModal.item}
        onClose={() => setActionModal({ ...actionModal, isOpen: false })}
        onConfirm={handleActionConfirm}
        initialValue={actionModal.item?.name || ''}
      />
    </div>
  );
};

export default WorkspacePage;
