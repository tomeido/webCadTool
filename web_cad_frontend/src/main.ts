import './style.css';

interface WasmApi {
  init: () => Promise<unknown>;
  setActiveTool: (tool: string) => void;
  getSceneStateJson: () => string;
  applySceneStateJson: (payload: string) => boolean;
}

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

interface SceneStatePayload {
  scale: number;
  rotation_x: number;
  rotation_y: number;
  trans_x: number;
  trans_y: number;
  shape: string;
}

class HistoryStore {
  private readonly dbName = 'WebCadDB';
  private readonly storeName = 'commits';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        if (req.result && !req.result.objectStoreNames.contains(this.storeName)) {
          req.result.createObjectStore(this.storeName, { keyPath: 'hash' });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveCommit(commit: CommitState): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).put(commit);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }

  async getCommits(): Promise<CommitState[]> {
    if (!this.db) return [];
    const db = this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).getAll();
      req.onsuccess = () => {
        const sorted = (req.result as CommitState[]).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clearCommits(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }
}

const state: AppState = {
  currentTool: localStorage.getItem('webcad.currentTool') ?? 'select',
  isWalletConnected: false,
  walletAddress: null,
};

const historyStore = new HistoryStore();
let wasmApi: WasmApi | null = null;
let commitsCache: CommitState[] = [];
let commitCursor = -1;

const toolBtns = document.querySelectorAll('.tool-btn[data-tool]') as NodeListOf<HTMLButtonElement>;
const connectBtn = document.getElementById('connect-wallet-btn') as HTMLButtonElement | null;
const networkStatus = document.getElementById('network-status') as HTMLSpanElement | null;
const statusText = document.querySelector('.status-text') as HTMLDivElement | null;
const commitList = document.getElementById('commit-list') as HTMLUListElement | null;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement | null;
const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement | null;
const clearHistoryBtn = document.getElementById('clear-history-btn') as HTMLButtonElement | null;

function setStatus(message: string): void {
  if (statusText) statusText.innerText = message;
}

function getCurrentSceneSnapshot(): CommitState {
  if (!wasmApi) {
    return {
      hash: '',
      timestamp: '',
      shape: state.currentTool,
      scale: 1.0,
      rotationX: 0,
      rotationY: 0,
      transX: 0,
      transY: 0,
    };
  }

  try {
    const parsed = JSON.parse(wasmApi.getSceneStateJson()) as SceneStatePayload;
    return {
      hash: '',
      timestamp: '',
      shape: parsed.shape,
      scale: parsed.scale,
      rotationX: parsed.rotation_x,
      rotationY: parsed.rotation_y,
      transX: parsed.trans_x,
      transY: parsed.trans_y,
    };
  } catch {
    return {
      hash: '',
      timestamp: '',
      shape: state.currentTool,
      scale: 1.0,
      rotationX: 0,
      rotationY: 0,
      transX: 0,
      transY: 0,
    };
  }
}

function restoreCommit(commit: CommitState): void {
  if (wasmApi) {
    const ok = wasmApi.applySceneStateJson(
      JSON.stringify({
        scale: commit.scale,
        rotation_x: commit.rotationX,
        rotation_y: commit.rotationY,
        trans_x: commit.transX,
        trans_y: commit.transY,
        shape: commit.shape,
      }),
    );
    if (!ok) {
      setStatus('Failed to restore commit state.');
      return;
    }
  }

  if (['cube', 'sphere', 'cylinder'].includes(commit.shape)) {
    applyTool(commit.shape);
  }
  setStatus(`Checked out: ${commit.hash.substring(0, 8)} (${commit.shape})`);
}

function downloadTextFile(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function applyTool(toolName: string): void {
  state.currentTool = toolName;
  localStorage.setItem('webcad.currentTool', toolName);
  toolBtns.forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-tool') === toolName);
  });
  setStatus(`Tool: ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}`);
  if (wasmApi) wasmApi.setActiveTool(toolName);
}

function updateHistoryButtons(): void {
  if (undoBtn) undoBtn.disabled = commitCursor >= commitsCache.length - 1 || commitsCache.length === 0;
  if (redoBtn) redoBtn.disabled = commitCursor <= 0;
}

function checkoutByCursor(): void {
  if (commitCursor < 0 || commitCursor >= commitsCache.length) return;
  const commit = commitsCache[commitCursor];
  restoreCommit(commit);
  updateHistoryButtons();
}

function undoCommit(): void {
  if (commitCursor < commitsCache.length - 1) {
    commitCursor += 1;
    checkoutByCursor();
  }
}

function redoCommit(): void {
  if (commitCursor > 0) {
    commitCursor -= 1;
    checkoutByCursor();
  }
}

async function refreshHistoryUI(): Promise<void> {
  if (!commitList) return;

  commitList.innerHTML = '';
  commitsCache = await historyStore.getCommits();
  commitCursor = commitsCache.length ? 0 : -1;

  commitsCache.forEach((commit, index) => {
    const li = document.createElement('li');
    li.className = 'commit-item';
    li.innerHTML = `
      <div>
        <div class="hash">${commit.hash.substring(0, 8)}</div>
        <div class="time">${new Date(commit.timestamp).toLocaleTimeString()}</div>
      </div>
      <div>${commit.shape.substring(0, 8)}</div>
    `;
    li.addEventListener('click', () => {
      commitCursor = index;
      checkoutByCursor();
    });
    commitList.appendChild(li);
  });

  updateHistoryButtons();
}

async function handleAction(action: string): Promise<void> {
  if (action === 'commit') {
    setStatus('Creating local commit...');
    const snapshot = getCurrentSceneSnapshot();
    const newCommit: CommitState = {
      hash: `lcl_${Math.random().toString(16).slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      shape: snapshot.shape,
      scale: snapshot.scale,
      rotationX: snapshot.rotationX,
      rotationY: snapshot.rotationY,
      transX: snapshot.transX,
      transY: snapshot.transY,
    };
    await historyStore.saveCommit(newCommit);
    await refreshHistoryUI();
    setStatus(`Committed: ${newCommit.hash.substring(0, 8)}`);
    return;
  }

  if (action === 'mint') {
    if (!state.isWalletConnected) {
      alert('Connect your wallet first to mint an NFT.');
      return;
    }
    if (!commitsCache.length) {
      alert('Create a local commit before minting.');
      return;
    }

    const latest = commitsCache[0];
    setStatus(`Preparing NFT mint for ${latest.hash.substring(0, 8)}...`);
    window.setTimeout(() => {
      setStatus('Confirming transaction on Polygon testnet...');
      window.setTimeout(() => {
        const txHash = `0x${Math.random().toString(16).slice(2, 14)}`;
        setStatus(`Mint successful! Tx: ${txHash}`);
      }, 1600);
    }, 800);
    return;
  }

  if (action === 'export') {
    setStatus('Exporting 3D model...');
    const timestamp = new Date().toISOString();
    downloadTextFile(
      `webcad_export_${Date.now()}.obj`,
      `# Web CAD Export\n# Generated at ${timestamp}\no Mock_${state.currentTool}\nv 0 0 0\nv 1 1 1\n`,
    );
    setStatus('Export complete.');
  }
}

async function loadWasm(): Promise<WasmApi | null> {
  const wasmPath = './pkg/web_cad_core.js';
  try {
    const mod = (await import(/* @vite-ignore */ wasmPath)) as {
      default: () => Promise<unknown>;
      set_active_tool: (tool: string) => void;
      get_scene_state_json: () => string;
      apply_scene_state_json: (payload: string) => boolean;
    };
    return {
      init: mod.default,
      setActiveTool: mod.set_active_tool,
      getSceneStateJson: mod.get_scene_state_json,
      applySceneStateJson: mod.apply_scene_state_json,
    };
  } catch (error) {
    console.warn('WASM package is not available yet. Run wasm-pack build first.', error);
    return null;
  }
}

function bindEvents(): void {
  toolBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const toolName = target.getAttribute('data-tool');
      if (!toolName) return;
      if (['commit', 'mint', 'export'].includes(toolName)) {
        await handleAction(toolName);
        return;
      }
      applyTool(toolName);
    });
  });

  if (undoBtn) undoBtn.addEventListener('click', () => undoCommit());
  if (redoBtn) redoBtn.addEventListener('click', () => redoCommit());
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
      if (!confirm('Delete all local commit history?')) return;
      await historyStore.clearCommits();
      await refreshHistoryUI();
      setStatus('Local history cleared.');
    });
  }

  if (connectBtn && networkStatus) {
    connectBtn.addEventListener('click', async () => {
      if (state.isWalletConnected) {
        alert(`Wallet already connected: ${state.walletAddress}`);
        return;
      }
      try {
        connectBtn.innerText = 'Connecting...';
        const w = window as Window & { ethereum?: { request: (payload: { method: string }) => Promise<string[]> } };
        if (!w.ethereum) {
          alert('Please install MetaMask or another Web3 wallet.');
          connectBtn.innerText = 'Connect Wallet';
          return;
        }
        const accounts = await w.ethereum.request({ method: 'eth_requestAccounts' });
        const account = accounts[0];
        state.isWalletConnected = true;
        state.walletAddress = account;
        connectBtn.innerText = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
        networkStatus.innerText = 'Connected';
        networkStatus.classList.remove('status-disconnected');
        networkStatus.classList.add('status-connected');
        setStatus('Web3 wallet connected.');
      } catch (error) {
        console.error(error);
        connectBtn.innerText = 'Connect Wallet';
        setStatus('Wallet connection failed.');
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoCommit();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoCommit();
    }
  });

  document.addEventListener('mousemove', (e) => {
    const xSpan = document.getElementById('coord-x');
    const ySpan = document.getElementById('coord-y');
    const zSpan = document.getElementById('coord-z');
    if (xSpan && ySpan && zSpan) {
      xSpan.innerText = ((e.clientX / window.innerWidth) * 10 - 5).toFixed(2);
      ySpan.innerText = (-(e.clientY / window.innerHeight) * 10 + 5).toFixed(2);
      zSpan.innerText = (Math.sin((e.clientX + e.clientY) * 0.01) * 2).toFixed(2);
    }
  });
}

async function run(): Promise<void> {
  await historyStore.init();
  await refreshHistoryUI();
  bindEvents();
  applyTool(state.currentTool);

  wasmApi = await loadWasm();
  if (!wasmApi) {
    setStatus('WASM not found. Run wasm-pack build, then refresh.');
    return;
  }

  try {
    await wasmApi.init();
    wasmApi.setActiveTool(state.currentTool);
    setStatus('Rust WASM initialized.');
  } catch (error) {
    console.error('WASM init failed', error);
    setStatus('Failed to initialize WASM core.');
  }
}

void run();
