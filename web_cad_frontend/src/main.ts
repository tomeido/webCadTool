import './style.css'
import initWasm, { set_active_tool } from './pkg/web_cad_core.js';

// Interfaces & State Types
interface AppState {
  currentTool: string;
  isWalletConnected: boolean;
  walletAddress: string | null;
}

interface CommitState {
  hash: string;
  timestamp: string;
  shape: string;
  scale: number;
  rotationX: number;
  rotationY: number;
  transX: number;
  transY: number;
}

const state: AppState = {
  currentTool: 'select',
  isWalletConnected: false,
  walletAddress: null,
};

// DOM Elements
const toolBtns = document.querySelectorAll('.tool-btn') as NodeListOf<HTMLButtonElement>;
const connectBtn = document.getElementById('connect-wallet-btn') as HTMLButtonElement;
const networkStatus = document.getElementById('network-status') as HTMLSpanElement;
const statusText = document.querySelector('.status-text') as HTMLDivElement;
const commitList = document.getElementById('commit-list') as HTMLUListElement;

// IndexedDB Helper
class HistoryStore {
  private dbName = 'WebCadDB';
  private storeName = 'commits';
  private db: IDBDatabase | null = null;

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        if (req.result) {
          req.result.createObjectStore(this.storeName, { keyPath: 'hash' });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveCommit(commit: CommitState) {
    if (!this.db) return;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).put(commit);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
    });
  }

  async getCommits(): Promise<CommitState[]> {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).getAll();
      req.onsuccess = () => {
        // Sort newest first
        const sorted = (req.result as CommitState[]).sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        resolve(sorted);
      };
    });
  }
}

const historyStore = new HistoryStore();
let latestCommitHash: string | null = null;

// Interactivity Initialization
async function initUI() {
  await historyStore.init();
  await refreshHistoryUI();

  // Sidebar Tools Logic
  toolBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const toolName = target.getAttribute('data-tool');

      if (!toolName) return;

      if (['mint', 'export', 'commit'].includes(toolName)) {
        // One-shot actions
        await handleAction(toolName);
      } else {
        // Toggle Tools
        toolBtns.forEach(b => {
          if (!['mint', 'export', 'commit'].includes(b.getAttribute('data-tool') || '')) {
            b.classList.remove('active');
          }
        });
        target.classList.add('active');
        state.currentTool = toolName;
        statusText.innerText = `Tool: ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}`;

        // Push event to Rust WASM layer
        try {
          set_active_tool(toolName);
        } catch (e) { /* ignore if wasm not loaded yet */ }
        console.log(`[UI] Tool changed to: ${toolName}`);
      }
    });
  });

  // Wallet Connection Logic
  connectBtn.addEventListener('click', async () => {
    if (state.isWalletConnected) {
      alert(`Wallet already connected: ${state.walletAddress}`);
      return;
    }

    try {
      connectBtn.innerText = 'Connecting...';

      // Check for injected Web3 provider (MetaMask, etc.)
      const w = window as any;
      if (typeof w.ethereum !== 'undefined') {
        const accounts = await w.ethereum.request({ method: 'eth_requestAccounts' });
        const account = accounts[0];

        state.isWalletConnected = true;
        state.walletAddress = account;

        // Update UI
        connectBtn.innerText = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
        networkStatus.innerText = 'Connected';
        networkStatus.classList.remove('status-disconnected');
        networkStatus.classList.add('status-connected');
        statusText.innerText = `Web3 Wallet Connected.`;

        // Inform WASM later
        console.log(`[Web3] Connected: ${account}`);
      } else {
        alert("Please install MetaMask or another Web3 wallet.");
        connectBtn.innerText = 'Connect Wallet';
      }
    } catch (error) {
      console.error(error);
      connectBtn.innerText = 'Connect Wallet';
      statusText.innerText = `Connection failed.`;
    }
  });
}

async function refreshHistoryUI() {
  if (!commitList) return;
  commitList.innerHTML = '';
  const commits = await historyStore.getCommits();
  commits.forEach(commit => {
    const li = document.createElement('li');
    li.className = 'commit-item';
    li.innerHTML = `
      <div>
        <div class="hash">${commit.hash.substring(0, 8)}</div>
        <div class="time">${new Date(commit.timestamp).toLocaleTimeString()}</div>
      </div>
      <div>${commit.shape.substring(0, 6)}</div>
    `;
    li.addEventListener('click', () => {
      // In a real app we would call Rust to load this state
      console.log('Restoring commit', commit.hash);
      statusText.innerText = `Checked out: ${commit.hash.substring(0, 8)}`;
      latestCommitHash = commit.hash;
    });
    commitList.appendChild(li);
  });
}

async function handleAction(action: string) {
  if (action === 'commit') {
    statusText.innerText = `Creating local commit...`;

    // Create a mock commit object (in prod, we would request full state from Rust)
    const newCommit: CommitState = {
      hash: "lcl_" + Math.random().toString(16).slice(2, 10),
      timestamp: new Date().toISOString(),
      shape: state.currentTool,
      scale: 1.0,
      rotationX: 0,
      rotationY: 0,
      transX: 0,
      transY: 0
    };

    await historyStore.saveCommit(newCommit);
    latestCommitHash = newCommit.hash;
    await refreshHistoryUI();
    statusText.innerText = `Committed: ${newCommit.hash.substring(0, 8)}`;

  } else if (action === 'mint') {
    if (!state.isWalletConnected) {
      alert("Connect your wallet first to mint an NFT.");
      return;
    }
    if (!latestCommitHash) {
      alert("You need to create a local commit before pushing/minting to Web3!");
      return;
    }

    statusText.innerText = `Preparing NFT Mint transaction for ${latestCommitHash.substring(0, 8)}...`;

    // Mock Web3 transaction flow
    setTimeout(() => {
      statusText.innerText = `Confirming transaction on Polygon Testnet...`;
      setTimeout(() => {
        const txHash = "0x" + Math.random().toString(16).slice(2, 12);
        statusText.innerText = `Mint successful! Tx: ${txHash}`;
        alert(`Successfully minted NFT for commit ${latestCommitHash?.substring(0, 8)}...`);
      }, 2000);
    }, 1000);

  } else if (action === 'export') {
    statusText.innerText = `Exporting 3D Model...`;

    setTimeout(() => {
      statusText.innerText = `Export complete. Downloading...`;

      const blob = new Blob([`# Web3 Rust CAD Export
# Generated at ${new Date().toISOString()}
o Mock_${state.currentTool}
v 0 0 0
v 1 1 1
# This is a mock OBJ generation
`], { type: "text/plain" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `web3_cad_export_${Date.now()}.obj`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }
}

// Coordinate dummy updater (simulating mouse tracking until Rust hooks up)
document.addEventListener('mousemove', (e) => {
  const xSpan = document.getElementById('coord-x');
  const ySpan = document.getElementById('coord-y');
  // Simple mapping relative to window
  if (xSpan && ySpan) {
    xSpan.innerText = ((e.clientX / window.innerWidth) * 10 - 5).toFixed(2);
    ySpan.innerText = (-(e.clientY / window.innerHeight) * 10 + 5).toFixed(2);
  }
});

// Init
async function run() {
  try {
    await initWasm();
    statusText.innerText = "Rust WASM Initialized";
  } catch (err) {
    console.error("WASM Load Error", err);
    statusText.innerText = "Failed to load WebCAD Core";
  }
  initUI();
}
run();
