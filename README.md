# WebCAD Tool

WebCAD Tool is an interactive 3D CAD application that runs directly in your web browser. It leverages WebAssembly (Wasm), Rust, and WebGL to deliver high-performance 3D rendering and modeling capabilities.

## Architecture

The project is split into two main components:

- **`web_cad_core` (Rust)**: The core logic and rendering engine. It uses `winit`, `glow`, and `egui` to manage 3D rendering and user interfaces inside the browser via WebAssembly.
- **`web_cad_frontend` (TypeScript & Vite)**: The web frontend that hosts the WebAssembly module and provides the web-native UI wrapping the CAD canvas.

## Prerequisites

To build and run the project locally, you need the following tools installed:

- [Rust](https://rustup.rs/) (latest stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- [Node.js](https://nodejs.org/) (v18 or higher) and npm

## Build & Run Instructions

### 1. Build the WebAssembly Core

Navigate to the `web_cad_core` directory and build the Wasm package targeting the web:

```bash
cd web_cad_core
wasm-pack build --target web --out-dir ../web_cad_frontend/src/pkg
```

### 2. Run the Web Frontend

Navigate to the `web_cad_frontend` directory, install dependencies, and start the Vite development server:

```bash
cd web_cad_frontend
npm install
npm run dev
```

The application will be accessible at `http://localhost:5173` (or the port specified by Vite).

## Vision & Roadmap

- **Advanced 3D Primitives**: Support for spheres, cylinders, and more complex shapes.
- **Version Control**: Local, offline tracking of model history using IndexedDB (commits and reverts).
- **Web3 Integration**: Future capabilities to permanently record model states on the blockchain and IPFS by minting NFTs.
