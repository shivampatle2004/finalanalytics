import React, { useState, useEffect } from "react";

import Navbar from "../Navbar/Navbar.jsx";

import Sidebar from "../Sidebar/Sidebar.jsx";

import { useTheme } from "../../context/ThemeContext.jsx";
import { CopilotDrawer } from "./CopilotDrawer.jsx";

import "../../styles/dashboard-theme.css";
import "../../styles/dashboard-theme-base.css";
import "../../styles/dashboard-theme-components.css";
import "../../styles/dashboard-theme-extended.css";
import "../../../modules/etl/styles/etl.css";

import { Outlet } from "react-router-dom";

const DashboardContent = () => {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
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
      
      <div 
        className="flex flex-1 relative overflow-hidden w-full h-[calc(100vh-var(--df-navbar-height))]"
        style={{ marginTop: 'var(--df-navbar-height)' }}
      >
        <Sidebar 
          isExpanded={isSidebarExpanded} 
          setIsExpanded={setIsSidebarExpanded} 
        />
        
        <main
          className="flex-1 flex flex-col overflow-y-auto df-page-enter df-scrollbar transition-all duration-300 ease-in-out"
          style={{
            backgroundColor: 'var(--df-bg-secondary)',
            marginLeft: '192px',
            padding: '0 var(--df-content-padding) 0 var(--df-content-padding)',
            minHeight: '100%',
          }}
        >
          <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>
      </div>

      <CopilotDrawer isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} theme={isDark ? 'dark' : 'light'} />
    </div>
  );
};

const DashboardLayout = ({ children }) => {
  return <DashboardContent>{children}</DashboardContent>;
};

export default DashboardLayout;
