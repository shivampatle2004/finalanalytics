import React from 'react';
import { Outlet } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { JobsProvider } from './context/JobsContext';
import { WorkspaceProvider } from './context/WorkspaceContext';

export default function DWProviderWrapper() {
  return (
    <DataProvider>
      <WorkspaceProvider>
        <JobsProvider>
          <Outlet />
        </JobsProvider>
      </WorkspaceProvider>
    </DataProvider>
  );
}
