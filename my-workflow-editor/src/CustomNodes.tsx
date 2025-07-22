import React from 'react';
import { Handle, Position } from 'reactflow';

export function OpenPDFNode({ data }: any) {
  // Show a visual indicator if a file is selected
  return (
    <div
      style={{
        border: '2px solid #1976d2',
        borderRadius: 8,
        padding: 16,
        background: data.fileSelected ? '#b2dfdb' : '#e3f2fd',
        cursor: 'pointer',
        minWidth: 120,
        textAlign: 'center',
        fontWeight: 'bold',
      }}
      onClick={() => {
        if (data.onOpenFilePicker) data.onOpenFilePicker();
      }}
      title="Click to select a PDF file"
    >
      📄 Open PDF
      {data.fileSelected && (
        <div style={{ fontSize: 12, color: '#388e3c', marginTop: 8 }}>
          File selected
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const customNodeTypes = {
  'open-pdf': OpenPDFNode,
};