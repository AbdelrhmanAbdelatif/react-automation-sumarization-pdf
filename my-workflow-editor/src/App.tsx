import React, { useCallback, useRef, useState } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node
} from 'reactflow';
import 'reactflow/dist/style.css';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
import { customNodeTypes } from './CustomNodes';

const nodeTypes = [
  { type: 'open-pdf', label: 'Open PDF' },
  { type: 'extract-text', label: 'Extract Text' },
  { type: 'summarize', label: 'Summarize' },
  { type: 'send-email', label: 'Send Email' },
  { type: 'show-email-count', label: 'Show Email Count' },
];

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'open-pdf',
    data: { label: 'Open PDF' },
    position: { x: 250, y: 5 },
  },
  {
    id: '2',
    data: { label: 'Extract Text' },
    position: { x: 100, y: 100 },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
];

// Hugging Face API token
const HF_TOKEN = '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';
const HF_SUMMARIZATION_URL_EN = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
const HF_SUMMARIZATION_URL_AR = 'https://api-inference.huggingface.co/models/akhooli/arabic-summarization';

function detectLanguage(text: string): 'ar' | 'en' {
  const arabicChars = text.match(/[\u0600-\u06FF]/g) || [];
  const totalLetters = text.match(/[a-zA-Z\u0600-\u06FF]/g) || [];
  if (totalLetters.length === 0) return 'en';
  return arabicChars.length / totalLetters.length > 0.3 ? 'ar' : 'en';
}

async function summarizeWithHuggingFace(text: string, lang: 'ar' | 'en'): Promise<{ summary: string, model: string }> {
  const url = lang === 'ar' ? HF_SUMMARIZATION_URL_AR : HF_SUMMARIZATION_URL_EN;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text }),
  });
  if (!response.ok) {
    throw new Error('Failed to summarize text');
  }
  const result = await response.json();
  if (Array.isArray(result) && result[0]?.summary_text) {
    return { summary: result[0].summary_text, model: lang === 'ar' ? 'Arabic' : 'English' };
  }
  throw new Error('Unexpected response from Hugging Face API');
}

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const nodeId = useRef(3);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summaryModel, setSummaryModel] = useState<'ar' | 'en' | null>(null);

  // Email state for Send Email node
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Handler to open file picker
  const onOpenFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // When file is selected, just store it
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
  };

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addNode = (type: string, label: string) => {
    const id = String(nodeId.current++);
    const newNode: Node = {
      id,
      type: type,
      data: { label },
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 50,
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  // --- Workflow Execution Logic ---
  const runWorkflow = async () => {
    const incoming = new Map();
    edges.forEach(edge => {
      if (!incoming.has(edge.target)) incoming.set(edge.target, []);
      incoming.get(edge.target).push(edge.source);
    });
    const startNodes = nodes.filter(node => !incoming.has(node.id));
    if (startNodes.length === 0) {
      alert('No start node found!');
      return;
    }
    let order: Node<any, string | undefined>[] = [];
    let queue: Node<any, string | undefined>[] = [...startNodes];
    let visited = new Set();
    while (queue.length) {
      const node = queue.shift();
      if (!node || visited.has(node.id)) continue;
      order.push(node);
      visited.add(node.id);
      const children = edges
        .filter(e => e.source === node.id)
        .map(e => nodes.find(n => n.id === e.target))
        .filter((n): n is Node<any, string | undefined> => Boolean(n));
      queue.push(...children);
    }
    const hasOpenPDF = order.some(node => node.type === 'open-pdf');
    const hasExtractText = order.some(node => node.data.label === 'Extract Text');
    const hasSummarize = order.some(node => node.data.label === 'Summarize');
    const hasSendEmail = order.some(node => node.data.label === 'Send Email');
    if (hasOpenPDF && hasExtractText && hasSummarize) {
      if (!selectedFile) {
        alert('Please select a PDF file by clicking the Open PDF node first.');
        return;
      }
      setLoading(true);
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        // @ts-ignore
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(' ') + '\n';
        }
        if (!/[a-zA-Z\u0600-\u06FF]/.test(text)) {
          setSummary('No meaningful text found in PDF.');
          setShowModal(true);
          setLoading(false);
          return;
        }
        const lang = detectLanguage(text);
        setSummaryModel(lang);
        let summaryText = '';
        try {
          const result = await summarizeWithHuggingFace(text.slice(0, 2000), lang);
          summaryText = result.summary;
        } catch (summarizeErr) {
          summaryText = 'Summarization failed: ' + summarizeErr;
        }
        setSummary(summaryText);
        setShowModal(true);
        // Reset email state if Send Email node is present
        if (hasSendEmail) {
          setEmail('');
          setEmailStatus('idle');
        }
      } catch (err) {
        alert('Failed to read PDF: ' + err);
      } finally {
        setLoading(false);
      }
    } else {
      alert('Please add and connect Open PDF, Extract Text, and Summarize nodes.');
    }
  };

  // Mock email sending function
  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailStatus('sending');
    try {
      // Using formsubmit.co as a mock/demo service
      const res = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(email), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: summary })
      });
      if (res.ok) {
        setEmailStatus('sent');
      } else {
        setEmailStatus('error');
      }
    } catch {
      setEmailStatus('error');
    }
  };

  const nodesWithHandlers = nodes.map(node =>
    node.type === 'open-pdf'
      ? { ...node, data: { ...node.data, onOpenFilePicker, fileSelected: !!selectedFile } }
      : node
  );

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      {/* Sidebar */}
      <div style={{ width: 180, background: '#f4f4f4', padding: 16, borderRight: '1px solid #ddd' }}>
        <h4>Workflow Nodes</h4>
        {nodeTypes.map((nt) => (
          <button
            key={nt.type}
            style={{ display: 'block', width: '100%', marginBottom: 8, padding: 8, cursor: 'pointer' }}
            onClick={() => addNode(nt.type, nt.label)}
          >
            + {nt.label}
          </button>
        ))}
        <hr style={{ margin: '16px 0' }} />
        <button
          style={{ display: 'block', width: '100%', padding: 10, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          onClick={runWorkflow}
          disabled={loading}
        >
          {loading ? 'Processing...' : '▶️ Run Workflow'}
        </button>
        <input
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </div>
      {/* React Flow Canvas */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodesWithHandlers}
          nodeTypes={customNodeTypes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background color="#aaa" gap={16} />
        </ReactFlow>
        {/* Modal for summary */}
        {showModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
              <h2>PDF Summarization ({summaryModel === 'ar' ? 'Arabic' : summaryModel === 'en' ? 'English' : 'Unknown'})</h2>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{summary}</pre>
              {/* If Send Email node is present, show email form */}
              {nodes.some(n => n.data?.label === 'Send Email') && (
                <form onSubmit={sendEmail} style={{ marginTop: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8 }}>
                    Send summary to email:
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
                      placeholder="your@email.com"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={emailStatus === 'sending' || !email}
                    style={{ padding: 8, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >
                    {emailStatus === 'sending' ? 'Sending...' : 'Send Email'}
                  </button>
                  {emailStatus === 'sent' && <span style={{ color: 'green', marginLeft: 12 }}>Email sent!</span>}
                  {emailStatus === 'error' && <span style={{ color: 'red', marginLeft: 12 }}>Failed to send.</span>}
                </form>
              )}
              <button style={{ marginTop: 16, padding: 8, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }} onClick={() => setShowModal(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;