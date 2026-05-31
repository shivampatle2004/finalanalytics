import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { useTheme } from "../../../shared/context/ThemeContext";

// Configure loader to use the local assets copied to the public folder.
// loader.config({
//   paths: {
//     vs: '/monaco-editor/min/vs',
//   },
// });

const SqlEditor = forwardRef(({ value, onChange, onExecute, onFormat, onSave }, ref) => {
  const { isDark } = useTheme();
  const editorRef = useRef(null);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Ctrl/Cmd + Enter to execute query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onExecute) onExecute();
    });
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getSelectedText: () => {
      if (!editorRef.current) return '';
      const selection = editorRef.current.getSelection();
      if (!selection || selection.isEmpty()) return '';
      return editorRef.current.getModel().getValueInRange(selection);
    },
    getFullText: () => {
      if (!editorRef.current) return '';
      return editorRef.current.getValue();
    },
  }));

  return (
    <div className="flex-1 relative flex flex-col overflow-hidden min-h-0" style={{ backgroundColor: 'var(--df-card-bg)' }}>
      <Editor
        height="100%"
        defaultLanguage="sql"
        theme={isDark ? 'vs-dark' : 'light'}
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 16, bottom: 16 },
          fixedOverflowWidgets: true,
          smoothScrolling: true,
          mouseWheelScrollSensitivity: 1,
          fastScrollSensitivity: 5,
          fontFamily: "'JetBrains Mono', ui-monospace, Consolas, 'Courier New', monospace"
        }}
      />
    </div>
  );
});

SqlEditor.displayName = 'SqlEditor';

export default SqlEditor;
