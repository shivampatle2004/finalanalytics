import React, { useState, useEffect } from 'react';
import { 
  FiUsers, FiStar, FiTrash2, FiShare2, FiHome, FiFolder, FiChevronRight, FiChevronDown, FiGrid
} from 'react-icons/fi';

const SidebarItem = ({ icon: Icon, label, isActive, onClick, depth = 0, iconColor }) => {
  return (
    <button
      className={`dw-sidebar-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      style={{ paddingLeft: `${depth * 16 + 16}px` }}
    >
      <div className="dw-sidebar-item-icon">
        <Icon 
          size={18} 
          strokeWidth={isActive ? 2.5 : 2} 
          style={{ color: isActive ? 'var(--df-accent)' : (iconColor || 'var(--df-text-muted)') }} 
        />
      </div>
      <span className="truncate">{label}</span>
    </button>
  );
};

const WorkspaceSidebar = ({ activeSection, onNavigate }) => {
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const newWidth = Math.min(Math.max(e.clientX, 200), 400);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const burgColor = 'var(--df-accent)';
  const blueColor = 'var(--df-accent)';

  return (
    <div
      className="dw-sidebar-container"
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* Drag Handle */}
      <div 
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-[var(--df-accent)] transition-colors opacity-0 hover:opacity-100"
        onMouseDown={handleMouseDown}
      />


      <nav className="dw-sidebar-nav df-scrollbar overflow-y-auto pb-6">
        <SidebarItem
          icon={FiGrid}
          label="Workspace"
          isActive={activeSection === null || activeSection === 'home'}
          onClick={() => onNavigate(null)}
          iconColor={burgColor}
        />

        <SidebarItem
          icon={FiShare2}
          label="Shared with me"
          isActive={activeSection === '__shared__'}
          onClick={() => onNavigate('__shared__')}
          iconColor={burgColor}
        />

        <div className="mt-2">
           <SidebarItem
            icon={FiFolder}
            label="File System"
            isActive={false}
            onClick={() => {}}
            iconColor={blueColor}
          />
          <SidebarItem
            icon={FiUsers}
            label="Users"
            isActive={activeSection === '__users__'}
            onClick={() => onNavigate('__users__')}
            depth={1}
            iconColor={burgColor}
          />
        </div>

        <SidebarItem
          icon={FiStar}
          label="Favorites"
          isActive={activeSection === '__favorites__'}
          onClick={() => onNavigate('__favorites__')}
          iconColor={burgColor}
        />

        <SidebarItem
          icon={FiTrash2}
          label="Trash"
          isActive={activeSection === '__trash__'}
          onClick={() => onNavigate('__trash__')}
          iconColor="#6B7280"
        />
      </nav>
    </div>
  );
};

export default WorkspaceSidebar;
