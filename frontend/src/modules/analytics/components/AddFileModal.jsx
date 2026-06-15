import React from 'react';
import {
  BlankCanvasIcon,
  ExcelIcon,
  DatabaseIcon,
  EnterDataIcon,
  SampleDataIcon,
  TextFileIcon,
  ChevronRightIcon,
} from './AddFileModalIcons';
import './AddFileModal.css';

const SOURCE_OPTIONS = [
  {
    id: 'blank',
    title: 'Blank Canvas',
    subtitle: 'Create a new empty report canvas without any data sources and build your layout first',
    Icon: BlankCanvasIcon,
    action: 'blank',
  },
  {
    id: 'excel',
    title: 'Import data from Excel',
    subtitle: '.xlsx or .xls workbook',
    Icon: ExcelIcon,
    action: 'excel',
  },
  {
    id: 'sql',
    title: 'Connect to a database',
    subtitle: 'PostgreSQL, MySQL, SQL Server',
    Icon: DatabaseIcon,
    action: 'database',
  },
  {
    id: 'enter',
    title: 'Enter data in a table',
    subtitle: 'Type or paste rows like Excel',
    Icon: EnterDataIcon,
    action: 'enter',
  },
  {
    id: 'sample',
    title: 'Try a sample dataset',
    subtitle: 'Small demo table to explore',
    Icon: SampleDataIcon,
    action: 'sample',
  },
];

const AddFileModal = ({
  isOpen,
  onClose,
  onDismiss,
  onPickExcel,
  onPickLocalFile,
  onDatabase,
  onEnterData,
  onSampleData,
  onBlankCanvas,
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onDismiss?.();
      onClose();
    }
  };

  const handleDismiss = () => {
    onDismiss?.();
    onClose();
  };

  const runAction = (action) => {
    onClose();
    switch (action) {
      case 'blank':
        onBlankCanvas?.();
        break;
      case 'excel':
        onPickExcel?.();
        break;
      case 'database':
        onDatabase?.();
        break;
      case 'enter':
        onEnterData?.();
        break;
      case 'sample':
        onSampleData?.();
        break;
      default:
        break;
    }
  };

  return (
    <div className="add-file-modal-overlay" onClick={handleOverlayClick}>
      <div className="add-file-modal-container" role="dialog" aria-labelledby="add-file-modal-title">
        <button type="button" className="add-file-modal-close" onClick={handleDismiss} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="add-file-modal-header">
          <h2 id="add-file-modal-title" className="add-file-modal-title">
            Add data to your report
          </h2>
          <p className="add-file-modal-subtitle">
            Choose a source. After data loads, you can build visuals, use <strong>Model view</strong> for relationships,
            or write a <strong>custom SQL dataset</strong>.
          </p>
        </div>

        <div className="add-file-modal-body">
          <ul className="add-file-source-list">
            {SOURCE_OPTIONS.map((opt) => {
              const OptionIcon = opt.Icon;
              return (
                <li key={opt.id}>
                  <button type="button" className="add-file-source-row" onClick={() => runAction(opt.action)}>
                    <span className="add-file-source-row__icon" aria-hidden>
                      <OptionIcon />
                    </span>
                    <span className="add-file-source-row__text">
                      <span className="add-file-source-row__title">{opt.title}</span>
                      <span className="add-file-source-row__sub">{opt.subtitle}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="add-file-source-row add-file-source-row--link"
            onClick={() => {
              onClose();
              onPickLocalFile?.();
            }}
          >
            <span className="add-file-source-row__icon" aria-hidden>
              <TextFileIcon />
            </span>
            <span className="add-file-source-row__text">
              <span className="add-file-source-row__title">Get data from a CSV, JSON, or other text file</span>
            </span>
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddFileModal;
