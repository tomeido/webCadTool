import './style.css'
import initWasm, { set_active_tool } from './pkg/web_cad_core.js';

// Interfaces & State Types
interface AppState {
  currentTool: string;
  isWalletConnected: boolean;
  walletAddress: string | null;
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

// Interactivity Initialization
function initUI() {
  // Sidebar Tools Logic
  toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const toolName = target.getAttribute('data-tool');

      if (!toolName) return;

      if (toolName === 'mint' || toolName === 'export') {
        // One-shot actions
        handleAction(toolName);
      } else {
        // Toggle Tools
        toolBtns.forEach(b => {
          if (b.getAttribute('data-tool') !== 'mint' && b.getAttribute('data-tool') !== 'export') {
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

function handleAction(action: string) {
  if (action === 'mint') {
    if (!state.isWalletConnected) {
      alert("Connect your wallet first to mint an NFT.");
      return;
    }
    statusText.innerText = `Preparing NFT Mint transaction...`;
    // Trigger smart contract / Rust WASM mint flow here
  } else if (action === 'export') {
    statusText.innerText = `Exporting STL...`;
    // Call Rust WASM to extract geometry as STL
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
