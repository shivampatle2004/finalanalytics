import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';

const FILTER_OPTIONS = {
  Type: ['All', 'Folder', 'Python', 'SQL', 'Notebook'],
  Owner: ['All', 'me@onestop.ai', 'Others'],
  Modified: ['All', 'Today', 'Last 7 Days', 'Last 30 Days']
};

const SearchBar = ({ searchQuery, setSearchQuery, searchScope, setSearchScope, filters, setFilters }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFilterSelect = (filterName, option) => {
    setFilters(prev => ({ ...prev, [filterName]: option }));
    setActiveDropdown(null);
  };

  return (
    <div className="dw-search-inner">
      {/* Search Input (Left) */}
      <div className="dw-search-input-wrap">
        <FiSearch
          className="dw-search-icon"
          size={16}
        />
        <input
          type="text"
          placeholder="Search"
          className="dw-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-[var(--df-sidebar-hover)] transition-colors text-[var(--df-text-muted)]"
          >
            <FiX size={14} />
          </button>
        )}
      </div>

      {/* Filter Buttons (Right) */}
      <div className="flex items-center gap-4" ref={dropdownRef}>
        <div className="dw-filter-pills flex-shrink-0 whitespace-nowrap">
          {['folder', 'global'].map((scope) => (
            <button
              key={scope}
              onClick={() => setSearchScope(scope)}
              className={`dw-filter-pill ${searchScope === scope ? 'active' : ''} whitespace-nowrap`}
            >
              {scope === 'folder' ? 'This' : 'Global'}
            </button>
          ))}
        </div>

        {['Type', 'Owner', 'Modified'].map((filter) => {
          const isActive = filters[filter] && filters[filter] !== 'All';
          const isDropdownOpen = activeDropdown === filter;
          
          return (
            <div key={filter} className="relative flex-shrink-0">
              <button
                onClick={() => setActiveDropdown(isDropdownOpen ? null : filter)}
                className={`dw-filter-btn ${isActive || isDropdownOpen ? 'active' : ''} whitespace-nowrap flex-shrink-0`}
              >
                <span>{isActive ? `${filter}: ${filters[filter]}` : filter}</span>
                <span className="dw-filter-btn-icon">▼</span>
              </button>

              {isDropdownOpen && (
                <div className="dw-dropdown-menu">
                  <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest mb-1 opacity-40" style={{ color: 'var(--df-text)' }}>
                    {filter}
                  </div>
                  {FILTER_OPTIONS[filter].map(option => (
                    <button
                      key={option}
                      className={`dw-dropdown-item ${filters[filter] === option ? 'active' : ''}`}
                      onClick={() => handleFilterSelect(filter, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SearchBar;
