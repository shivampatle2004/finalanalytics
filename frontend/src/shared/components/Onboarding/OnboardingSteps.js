export const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'OneStopAnalytics Tour',
    description: 'Welcome to the Unified Data & Analytics ecosystem. In this short tour, we will explore the three fully integrated workloads (ETL, Warehousing, Analytics) that allow you to ingest, transform, query, and visualize your company data.',
    target: null,
    position: 'center',
    proTip: 'OneStopAnalytics leverages native Polars memory frames and DuckDB pipelines to process massive datasets in sub-second speeds.'
  },
  {
    id: 'connectors',
    title: 'Ingestion & Pipelines (ETL)',
    description: 'The first application workspace is the ETL Engine. Connect to databases, file uploads, cloud destinations, and configure high-performance pipelines that automate data cleaning, schema validation, and scheduling.',
    target: '[data-tour="etl-pipelines"]',
    position: 'right',
    actionLabel: 'Launch Pipelines Portal',
    actionPath: '/#/etl/pipelines',
    proTip: 'You can configure schema verification rules on any source to reject problematic records automatically.'
  },
  {
    id: 'warehouse',
    title: 'Warehouse & SQL Workspace (DW)',
    description: 'The second application workspace is the DW (Data Warehouse) Engine. Directly run optimized analytical SQL queries on your unified tables, build database schemas, and manage server-side automated processing tasks.',
    target: '[data-tour="dw-sql"]',
    position: 'right',
    actionLabel: 'Launch SQL Workspace',
    actionPath: '/#/dw/sql-editor',
    proTip: 'Use SQL variables and historical query metrics to optimize long-running warehouse procedures.'
  },
  {
    id: 'analytics',
    title: 'Analytics & Studio Hub',
    description: 'The third application workspace is the BI Analytics Studio. Assemble interactive charts, map regions, format tables, and share dashboards that derive instant dynamic insights from your DW tables.',
    target: '[data-tour="analytics-dashboard"]',
    position: 'right',
    actionLabel: 'Launch Analytics Hub',
    actionPath: '/#/analytics',
    proTip: 'Use Row-Level Security (RLS) policies to isolate viewer access to only their relevant data subsets.'
  },
  {
    id: 'copilot',
    title: 'Platform AI Copilot',
    description: 'Have a question? Meet the Platform Copilot. Powered by Groq, this chatbot understands your schema definitions and assists you with query building, pipeline design, and connector setups.',
    target: '.floating-copilot',
    position: 'left',
    proTip: 'Click the Ask AI button in the navigation header or this floating bubble to summon the chatbot from any page.'
  }
];
