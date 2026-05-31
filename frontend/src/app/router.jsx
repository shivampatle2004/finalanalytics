import { createBrowserRouter, Navigate, useNavigate, useParams } from "react-router-dom";

import DashboardLayout from "../shared/components/Layout/DashboardLayout";

import { Dashboard as EtlDashboard } from "../modules/etl/pages/Dashboard/Dashboard";

// Bridge: connects legacy onNavigate prop to React Router
function EtlDashboardPage() {
  const navigate = useNavigate();
  const handleNavigate = (target) => {
    navigate(`/etl/${target}`);
  };
  return <EtlDashboard onNavigate={handleNavigate} />;
}

import { PipelineList as Pipelines } from "../modules/etl/pages/Pipelines/PipelineList";

function PipelinesPage() {
  const navigate = useNavigate();
  const handleNavigate = (target) => {
    navigate(`/etl/${target}`);
  };
  return <Pipelines onNavigate={handleNavigate} />;
}

import { PipelineEditor } from "../modules/etl/pages/PipelineEditor/PipelineEditor";

function PipelineEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const handleNavigate = (target) => {
    navigate(`/etl/${target}`);
  };
  return <PipelineEditor pipelineId={id} onNavigate={handleNavigate} />;
}

import { JobMonitor as Logs } from "../modules/etl/pages/Jobs/JobMonitor";
import { TransformPage as Transform } from "../modules/etl/pages/Transform/TransformPage";
import { ConnectorHub as Connectors } from "../modules/etl/pages/Connectors/ConnectorHub";
import EtlCatalog from "../modules/etl/pages/Catalog/Catalog";
import { FileManager } from "../modules/etl/pages/FileManager/FileManager";
import { DocumentationPage } from "../modules/etl/pages/Documentation/DocumentationPage";

function DocumentationPageWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const handleNavigate = (target) => {
    if (target === 'copilot') {
      window.dispatchEvent(new CustomEvent('open-copilot'));
      return;
    }
    if (target === 'docs') {
      window.open('/etl/docs', '_blank');
      return;
    }
    navigate(`/etl/${target}`);
  };
  return <DocumentationPage subPath={id} onNavigate={handleNavigate} />;
}

import { Settings as EtlSettings } from "../modules/etl/pages/Settings/Settings";
import { ProfilePage as EtlProfile } from "../modules/etl/pages/Profile/ProfilePage";
import { TableManager as EtlTableManager } from "../modules/etl/pages/TableManager/TableManager";
import { SQLEditorPage as EtlSQLEditor } from "../modules/etl/pages/SQLEditor/SQLEditorPage";
import { DataLineage as EtlDataLineage } from "../modules/etl/pages/Pipelines/DataLineage";

import DWProviderWrapper from "../modules/DW/DWProviderWrapper";
import SqlLab from "../modules/DW/pages/SqlEditor/SqlLab";
import SavedQueriesPage from "../modules/DW/pages/SqlEditor/SavedQueriesPage";
import QueryHistoryPage from "../modules/DW/pages/SqlEditor/QueryHistoryPage";
import Catalog from "../modules/DW/pages/Catalog/Catalog";
import WorkspacePage from "../modules/DW/pages/Workspace/WorkspacePage";
import JobsList from "../modules/DW/pages/Jobs/JobsList";
import CreateJob from "../modules/DW/pages/Jobs/CreateJob";
import CreateJobSimple from "../modules/DW/pages/Jobs/CreateJobSimple";
import JobDetails from "../modules/DW/pages/Jobs/JobDetails";
import GlobalRunsPage from "../modules/DW/pages/Runs/GlobalRunsPage";
import AnalyticsLauncher from "../modules/analytics/AnalyticsLauncher";
import AnalyticsHub from "../modules/analytics/AnalyticsHub";
import AnalyticsDashboard from "../modules/analytics/src/pages/AnalyticsDashboard";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardLayout />,

    children: [
      {
        index: true,
        element: <Navigate to="/etl/dashboard" replace />
      },
      {
        path: "etl",
        children: [
          { path: "dashboard", element: <EtlDashboardPage /> },
          { path: "pipelines", element: <PipelinesPage /> },
          { path: "editor", element: <PipelineEditorPage /> },
          { path: "editor/:id", element: <PipelineEditorPage /> },
          { path: "logs", element: <Logs /> },
          { path: "transform", element: <Transform /> },
          { path: "connectors", element: <Connectors /> },
          { path: "catalog", element: <EtlCatalog /> },
          { path: "files", element: <FileManager /> },
          { path: "settings", element: <EtlSettings /> },
          { path: "profile", element: <EtlProfile /> },
          { path: "table-manager", element: <EtlTableManager /> },
          { path: "sql-editor", element: <EtlSQLEditor /> },
          { path: "lineage", element: <EtlDataLineage /> },
          { path: "docs", element: <DocumentationPageWrapper /> },
          { path: "docs/:id", element: <DocumentationPageWrapper /> },
        ]
      },

      {
        path: "dw",
        element: <DWProviderWrapper />,
        children: [
          { path: "sql-editor", element: <SqlLab /> },
          { path: "saved-queries", element: <SavedQueriesPage /> },
          { path: "query-history", element: <QueryHistoryPage /> },
          { path: "catalog", element: <Catalog /> },
          { path: "workspace", element: <WorkspacePage /> },
          { path: "jobs", element: <JobsList /> },
          { path: "jobs/create", element: <CreateJob /> },
          { path: "jobs/create-job", element: <CreateJobSimple /> },
          { path: "jobs/:jobId", element: <JobDetails /> },
          { path: "runs", element: <GlobalRunsPage /> },
        ]
      },

      {
        path: "analytics",
        children: [
          { index: true, element: <AnalyticsHub /> },
          { path: "launcher", element: <AnalyticsLauncher /> }
        ]
      },
    ],
  },
  {
    path: "/analytics-studio",
    element: <AnalyticsDashboard />
  },
  {
    path: "/analytics-studio/:fileId",
    element: <AnalyticsDashboard />
  }
]);