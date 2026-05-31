import React from 'react';
import './LandingConnectors.css';

// 32 real-world ETL connectors with category + icon emoji
const CONNECTORS = [
  // Databases
  { name: 'PostgreSQL',   icon: '🐘', cat: 'Database' },
  { name: 'MySQL',        icon: '🐬', cat: 'Database' },
  { name: 'MongoDB',      icon: '🍃', cat: 'Database' },
  { name: 'Redis',        icon: '🔴', cat: 'Database' },
  { name: 'Cassandra',    icon: '👁️', cat: 'Database' },
  { name: 'DynamoDB',     icon: '⚡', cat: 'Database' },
  { name: 'Firestore',    icon: '🔥', cat: 'Database' },
  { name: 'CockroachDB',  icon: '🪳', cat: 'Database' },
  // Cloud Warehouses
  { name: 'Snowflake',    icon: '❄️', cat: 'Warehouse' },
  { name: 'BigQuery',     icon: '🔵', cat: 'Warehouse' },
  { name: 'Redshift',     icon: '🌀', cat: 'Warehouse' },
  { name: 'Databricks',   icon: '🧱', cat: 'Warehouse' },
  { name: 'ClickHouse',   icon: '🏠', cat: 'Warehouse' },
  // Storage
  { name: 'Amazon S3',    icon: '🪣', cat: 'Storage' },
  { name: 'Google GCS',   icon: '☁️', cat: 'Storage' },
  { name: 'Azure Blob',   icon: '🔷', cat: 'Storage' },
  { name: 'SFTP',         icon: '📂', cat: 'Storage' },
  // Streaming
  { name: 'Kafka',        icon: '📨', cat: 'Streaming' },
  { name: 'Kinesis',      icon: '🌊', cat: 'Streaming' },
  { name: 'Pub/Sub',      icon: '📡', cat: 'Streaming' },
  { name: 'RabbitMQ',     icon: '🐇', cat: 'Streaming' },
  // SaaS / CRM
  { name: 'Salesforce',   icon: '☁️', cat: 'CRM' },
  { name: 'HubSpot',      icon: '🟠', cat: 'CRM' },
  { name: 'Zendesk',      icon: '🟢', cat: 'CRM' },
  { name: 'Pipedrive',    icon: '🔧', cat: 'CRM' },
  // Marketing
  { name: 'Google Ads',   icon: '📢', cat: 'Marketing' },
  { name: 'Facebook Ads', icon: '📘', cat: 'Marketing' },
  { name: 'Mixpanel',     icon: '📊', cat: 'Analytics' },
  { name: 'Amplitude',    icon: '📈', cat: 'Analytics' },
  // APIs & Others
  { name: 'REST API',     icon: '🔗', cat: 'API' },
  { name: 'GraphQL',      icon: '🔮', cat: 'API' },
  { name: 'Stripe',       icon: '💳', cat: 'Payments' },
];

// Double the array for seamless infinite marquee
const row1 = [...CONNECTORS.slice(0, 16), ...CONNECTORS.slice(0, 16)];
const row2 = [...CONNECTORS.slice(16), ...CONNECTORS.slice(16)];

function ConnectorChip({ name, icon, cat }) {
  return (
    <div className="connector-chip">
      <span className="connector-chip__icon">{icon}</span>
      <div className="connector-chip__text">
        <span className="connector-chip__name">{name}</span>
        <span className="connector-chip__cat">{cat}</span>
      </div>
    </div>
  );
}

export function LandingConnectors() {
  return (
    <section className="connectors-section">
      {/* ambient blobs */}
      <div className="conn-blob conn-blob--tl" />
      <div className="conn-blob conn-blob--br" />

      <div className="connectors-inner">
        {/* Header */}
        <div className="connectors-header">
          <span className="connectors-eyebrow">Ecosystem</span>
          <h2 className="connectors-title">
            Connect to <span className="connectors-title--accent">30+ Sources</span>
            <br />out of the box
          </h2>
          <p className="connectors-subtitle">
            Plug in databases, warehouses, SaaS tools, streaming platforms and APIs —
            no custom code required.
          </p>
        </div>

        {/* Stats bar */}
        <div className="connectors-stats">
          {[
            { value: '32+', label: 'Native Connectors' },
            { value: '<5 min', label: 'Avg. Setup Time' },
            { value: '99.9%', label: 'Uptime SLA' },
            { value: 'New', label: 'Added Every Sprint' },
          ].map((s) => (
            <div key={s.label} className="conn-stat">
              <span className="conn-stat__value">{s.value}</span>
              <span className="conn-stat__label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Marquee rows */}
        <div className="marquee-wrapper">
          {/* Edge fades */}
          <div className="marquee-fade marquee-fade--left" />
          <div className="marquee-fade marquee-fade--right" />

          {/* Row 1 — left */}
          <div className="marquee-track">
            <div className="marquee-row marquee-row--ltr">
              {row1.map((c, i) => (
                <ConnectorChip key={i} {...c} />
              ))}
            </div>
          </div>

          {/* Row 2 — right */}
          <div className="marquee-track">
            <div className="marquee-row marquee-row--rtl">
              {row2.map((c, i) => (
                <ConnectorChip key={i} {...c} />
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="connectors-cta">
          <span>Don't see yours?</span>
          <a href="#" className="connectors-cta-link">Request a connector →</a>
        </div>
      </div>
    </section>
  );
}
