import { useState, useCallback } from 'react';

export const useQueryTabs = () => {
  const [tabs, setTabs] = useState([
    { 
      id: 'tab1', 
      name: 'Query 1', 
      content: 'SELECT * \nFROM catalog.schema.table \nLIMIT 100;', 
      results: null,
      status: 'idle',
      executionTime: null
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab1');

  const addTab = useCallback((initialContent = '') => {
    const newId = `tab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newTab = { 
      id: newId, 
      name: `Query ${tabs.length + 1}`, 
      content: initialContent, 
      results: null,
      status: 'idle',
      executionTime: null
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    return newId;
  }, [tabs]);

  const removeTab = useCallback((e, id) => {
    if (e) e.stopPropagation();
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (id === activeTabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const updateTabContent = useCallback((id, content) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, content } : t));
  }, []);

  const updateTabResults = useCallback((id, resultData) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...resultData } : t));
  }, []);

  const renameTab = useCallback((id, name) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  }, []);

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    removeTab,
    updateTabContent,
    updateTabResults,
    renameTab
  };
};
