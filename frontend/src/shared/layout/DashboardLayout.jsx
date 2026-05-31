import React, { useState, useEffect } from 'react';
import Navbar from '../navbar/Navbar';
import Sidebar from '../sidebar/Sidebar';
import { useTheme } from '../context/ThemeContext';
import { CopilotDrawer } from '../components/Layout/CopilotDrawer';
import '../../styles/dashboard-theme.css';

const DashboardContent = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const { isDark } = useTheme();

  // Listen for open-copilot custom event globally
  useEffect(() => {
    const handleOpenCopilot = () => setCopilotOpen(true);
    window.addEventListener('open-copilot', handleOpenCopilot);
    return () => window.removeEventListener('open-copilot', handleOpenCopilot);
  }, []);

  return (
    <div
      className="h-screen w-full flex flex-col transition-colors duration-300 overflow-hidden"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: 'var(--df-bg)',
        color: 'var(--df-text)',
      }}
    >
      <Navbar />
      <div className="flex flex-1 pt-16 h-full overflow-hidden w-full">
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        <main
          className="flex-1 flex flex-col overflow-hidden df-page-enter df-scrollbar"
          style={{
            backgroundColor: 'var(--df-bg-secondary)',
            marginLeft: 'var(--df-sidebar-width, 72px)',
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {children}
        </main>
      </div>

      <CopilotDrawer 
        isOpen={copilotOpen} 
        onClose={() => setCopilotOpen(false)} 
        theme={isDark ? 'dark' : 'light'} 
      />
    </div>
  );
};

const DashboardLayout = ({ children }) => {
  return <DashboardContent>{children}</DashboardContent>;
};

export default DashboardLayout;
