<p align="center">
  <img src="https://raw.githubusercontent.com/MizPahPulse/MizPahPulse/main/screenshots/01-landing.png" alt="MizpahPulse Banner" width="800" />
</p>

<h1 align="center">⚡ MizpahPulse</h1>
<p align="center"><em>The heartbeat of on-chain activity on Stellar</em></p>

<p align="center">
  <a href="https://github.com/MizPahPulse/MizPahPulse/actions/workflows/ci.yml"><img src="https://github.com/MizPahPulse/MizPahPulse/actions/workflows/ci.yml/badge.svg" alt="CI/CD" /></a>
  <a href="https://mizpah-pulse.vercel.app"><img src="https://img.shields.io/badge/demo-live-22c55e?style=flat&logo=vercel" alt="Live Demo" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="#tests"><img src="https://img.shields.io/badge/tests-55%2F55%20passed-brightgreen" alt="Tests: 55/55" /></a>
  <img src="https://img.shields.io/badge/next.js-15-black?logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/stellar-testnet-7B5BDB?logo=stellar" alt="Stellar Testnet" />
  <img src="https://img.shields.io/badge/soroban-deployed-7B5BDB?logo=stellar" alt="Soroban Deployed" />
  <img src="https://img.shields.io/badge/typescript-5.6-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/rust-1.88-orange?logo=rust" alt="Rust" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Live Demo](#-live-demo)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Smart Contract](#-smart-contract)
- [Wallet Integration](#-wallet-integration)
- [API Reference](#-api-reference)
- [Event Streaming](#-event-streaming)
- [Testing](#-testing)
- [CI/CD](#-cicd)
- [Screenshots](#-screenshots)
- [Environment Variables](#-environment-variables)
- [Credits](#-credits)
- [License](#-license)

---

## 🌐 Overview

**MizpahPulse** is a real-time blockchain intelligence platform purpose-built for the **Stellar ecosystem**. It ingests, processes, and visualizes every heartbeat of the network — from simple XLM payments to complex Soroban smart contract invocations.

### ✨ Key Capabilities

| Category | Coverage |
|---|---|
| 💸 **Payments** | XLM transfers, path payments, cross-border remittances |
| 🤖 **Smart Contracts** | Soroban invocations, deployments, events, TTL extensions |
| 📊 **DEX Activity** | Trades, order books, liquidity pool operations |
| 🎨 **NFTs** | Minting, transfers, burns, metadata |
| 🪙 **Tokens** | Trustline changes, asset issuance, clawbacks |
| 👤 **Accounts** | Creation, merging, signer updates, sponsorship |

### 🚀 Deliverables

- **Real-time Dashboard** — Live feed with WebSocket streaming, filters, and search
- **Analytics Suite** — Historical trends, category breakdowns, top contracts
- **Wallet Hub** — Freighter integration, XLM balance, one-click transactions
- **Contract Explorer** — Deployed Soroban contracts with direct invocation UI
- **REST API (v1)** — 9 endpoints for programmatic access
- **Webhook Engine** — Configurable event delivery to external services
- **Developer Portal** — API key management, SDK examples, integration docs

---

## 🎥 Live Demo

<p align="center">
  <a href="https://mizpah-pulse.vercel.app">
    <img src="https://img.shields.io/badge/🔗_Open_Live_Demo-mizpah--pulse.vercel.app-0ea5e9?style=for-the-badge" alt="Live Demo" />
  </a>
</p>

**[▶️ Watch the 2-minute demo video](./screenshots/demo-video.mp4)** — A guided walkthrough of the entire platform.

---

## 🏗 Architecture

```
mizpah-pulse/
│
├── apps/
│   ├── web/            # Next.js 15 dashboard + REST API      (port 3000)
│   ├── ws/             # Socket.io real-time event server     (port 3001)
│   └── ingester/       # Stellar event ingestion worker
│
├── packages/
│   ├── database/       # Prisma ORM + PostgreSQL schema
│   ├── stellar/        # Stellar SDK integration layer
│   ├── types/          # Shared TypeScript types + Zod schemas
│   └── ui/             # Reusable React component library
│
├── contracts/
│   └── pulse/          # Soroban smart contract (Rust)
│
├── scripts/            # Deployment and automation scripts
└── screenshots/        # Demo screenshots and video
```

### Data Flow

```
Stellar Network (Horizon SSE + Soroban RPC)
        │
        ▼
   [Ingester] ──► Redis Queue ──► [Worker] ──► PostgreSQL
        │                                          │
        ▼                                          ▼
   [WebSocket Server] ◄──────────────────── [REST API]
        │                                          │
        ▼                                          ▼
   [Next.js Dashboard] ◄──── Real-time UI ──── [External Clients]
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, Recharts, Lucide Icons |
| **Backend** | Next.js API Routes, Socket.io, BullMQ |
| **Database** | PostgreSQL 16 + Prisma ORM |
| **Cache / Queue** | Redis (BullMQ + Pub/Sub) |
| **Blockchain** | Stellar SDK v13, Horizon, Soroban RPC, `@stellar/freighter-api` v3 |
| **Smart Contracts** | Rust + Soroban SDK v21 |
| **Infrastructure** | Turborepo, Docker Compose, GitHub Actions, Vercel |
| **Testing** | Vitest, React Testing Library, Rust cargo test |
| **Language** | TypeScript (strict), Rust |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **Docker** & Docker Compose (for PostgreSQL + Redis)
- **npm** ≥ 11
- **Rust** ≥ 1.88 (for contract development only)
- [Freighter Browser Extension](https://freighter.app) (for wallet features)

### One-Command Setup

```bash
git clone https://github.com/MizPahPulse/MizPahPulse.git
cd MizPahPulse
npm install
npm run docker:up
cp .env.example .env
npx prisma generate --schema=packages/database/prisma/schema.prisma
npx prisma migrate dev --schema=packages/database/prisma/schema.prisma
npm run dev
```

### Access Points

| Service | URL |
|---|---|
| Dashboard | [http://localhost:3000](http://localhost:3000) |
| WebSocket | `ws://localhost:3001` |
| REST API | [http://localhost:3000/api/v1](http://localhost:3000/api/v1) |

### Full Docker Stack

```bash
docker compose up -d
```

---

## 📜 Smart Contract

MizpahPulse ships with a **Soroban smart contract** (`PulseContract`) demonstrating production-grade patterns:

### Features

| Endpoint | Signature | Description |
|---|---|---|
| `pulse` | `(caller: Symbol) → u32` | Increments counter, emits event |
| `broadcast_pulse` | `(target: Address, caller: Symbol) → (u32, Val)` | Cross-contract pulse broadcast |
| `on_pulse_received` | `(count: u32, caller: Symbol) → Symbol` | Receiver for inter-contract calls |
| `get_pulse_count` | `() → u32` | Read current count |
| `get_pulse_data` | `() → PulseData` | Read full state |
| `get_last_received` | `() → Option<(u32, Symbol)>` | Last cross-contract receipt |

### Deployment

| Detail | Value |
|---|---|
| **Network** | Stellar Testnet |
| **Contract ID** | `CC4HXCVIOPUOS2UJFLTM6WP2ESNSWM4BGJ26XR4SRRVB74TOZMC7EE2C` |
| **Create Tx** | [`ee73ae2e...`](https://stellar.expert/explorer/testnet/tx/ee73ae2e3126d52878ff010346f8d4645383e606217a7bf3a1c16d2df40ecf06) |
| **Verified** | [View on Stellar Expert →](https://stellar.expert/explorer/testnet/tx/ee73ae2e3126d52878ff010346f8d4645383e606217a7bf3a1c16d2df40ecf06) |

```bash
# Deploy your own instance
cd contracts && cargo build --target wasm32-unknown-unknown --release
DEPLOYER_SECRET=S... npx tsx scripts/deploy-contract.ts
```

### Interacting from the Frontend

```tsx
import { useContractInvoke } from '@/hooks/useContractInvoke';

// Read-only (simulated, no transaction)
const { readOnly } = useContractInvoke(contractId);
const count = await readOnly('get_pulse_count');  // → number

// State-changing (Freighter sign → submit)
const { invoke } = useContractInvoke(contractId);
const result = await invoke('pulse', ['alice']);
// → { hash: '...', explorerUrl: 'https://...', returnValue: 6 }

// Cross-contract communication
const { invoke } = useContractInvoke(contractId);
await invoke('broadcast_pulse', [targetContractId, 'alice']);
```

---

## 👛 Wallet Integration

Full **Freighter wallet** integration on Stellar Testnet with comprehensive error handling:

| Feature | Implementation |
|---|---|
| **Connect** | `useFreighter` hook via `@stellar/freighter-api` v3 |
| **Disconnect** | Clean state reset with UI feedback |
| **Session Persistence** | Auto-reconnect across page refreshes |
| **Missing Wallet** | Graceful detection + install prompt |
| **Balance** | Live XLM pull from Horizon, 30s auto-refresh |
| **Send XLM** | Build → Freighter sign → submit with balance validation |
| **Feedback** | Success: tx hash + explorer link. Error: categorized message + retry |

### Freighter Setup

1. Install [Freighter](https://freighter.app)
2. Switch to **Testnet** network
3. Visit `/dashboard/wallets` → **Connect Freighter**

---

## 📡 API Reference

### REST API (v1)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/events` | Paginated event query with filters |
| `GET` | `/api/v1/events/live` | Server-Sent Events stream |
| `GET` | `/api/v1/accounts/:id` | Account details + on-chain data |
| `GET` | `/api/v1/accounts/:id/activity` | Paginated account activity |
| `GET` | `/api/v1/assets?q=` | Search assets by code or issuer |
| `GET` | `/api/v1/contracts/:id` | Contract details + stats |
| `GET` | `/api/v1/contracts/:id/events` | Paginated contract events |
| `GET` | `/api/v1/stats` | Network-wide statistics (incl. top accounts) |
| `GET` | `/api/v1/status` | Service dependency status (DB, WS, last event) |
| `GET` | `/api/v1/search` | Multi-entity search |
| `POST` | `/api/v1/webhooks` | Register webhook endpoint |
| `POST` | `/api/v1/webhooks/batch` | Register up to 50 webhooks atomically |

### WebSocket Events

Connect to `ws://localhost:3001`

| Direction | Event | Description |
|---|---|---|
| Client → Server | `subscribe:eventTypes` | Filter by event type |
| Client → Server | `subscribe:categories` | Filter by category |
| Client → Server | `subscribe:accounts` | Filter by account |
| Server → Client | `event` | Real-time event payload |
| Bidirectional | `stats` | Connection statistics |

### Event Categories

MizpahPulse tracks **35+ event types** across 6 categories:

| Category | Examples |
|---|---|
| 💸 Payment | XLM transfers, path payments |
| 🤖 Contract | Soroban invoke, deploy, extend TTL |
| 📊 DEX | Trades, order create/cancel |
| 🎨 NFT | Mint, transfer, burn |
| 🪙 Token | Transfer, trustline, clawback |
| 👤 Account | Create, merge, sponsorship |

---

## 🧪 Testing

```bash
# Frontend tests (28 passing)
cd apps/web && npx vitest run

# Smart contract tests (27 passing)
cd contracts && cargo test
```

### Test Suite

```
✓ PulseContract tests        27 passed  (ownership, pausability, rate limit, batch ops, upgrade, time-lock…)
✓ useFreighter tests          6 passed  (connect, disconnect, error states)
✓ useSendTransaction tests    3 passed  (validation, wallet not connected)
✓ contract invoke tests       3 passed  (validation, contract ID, initial state)
✓ utility unit tests         16 passed  (date, number, validators, display, error handling)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total: 55/55 passing
```

---

## ⚙️ CI/CD

| Job | Trigger | Description |
|---|---|---|
| **Lint & Typecheck** | Push, PR | Prettier, ESLint, TypeScript |
| **Test** | Push, PR | Vitest frontend + Rust contract tests |
| **Build** | Push, PR | Turborepo full build |
| **Contract** | Push, PR | Cargo test + WASM build + artifact upload |
| **Deploy Contract** | Manual (`workflow_dispatch`) | Deploy WASM to Stellar Testnet |
| **Docker** | Push to `main` | Multi-service Docker build |

---

## 📸 Screenshots

<p align="center">
  <img src="./screenshots/01-landing.png" alt="Landing" width="400" />
  <img src="./screenshots/02-dashboard.png" alt="Dashboard" width="400" />
</p>

<p align="center">
  <img src="./screenshots/03-wallet-options.png" alt="Wallets" width="400" />
  <img src="./screenshots/04-contracts.png" alt="Contracts" width="400" />
</p>

<p align="center">
  <img src="./screenshots/05-live-feed.png" alt="Live Feed" width="400" />
  <img src="./screenshots/06-analytics.png" alt="Analytics" width="400" />
</p>

<p align="center">
  <em>📱 Mobile Responsive</em><br/>
  <img src="./screenshots/07-mobile-dashboard.png" alt="Mobile Dashboard" width="200" />
  <img src="./screenshots/08-mobile-wallets.png" alt="Mobile Wallets" width="200" />
</p>

---

## 🔧 Environment Variables

Copy `.env.example` → `.env` and configure:

| Variable | Req | Description | Default |
|---|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | ✓ | Redis connection URL | `redis://localhost:6379` |
| `STELLAR_NETWORK` | ✓ | `TESTNET` / `PUBLIC` / `FUTURENET` / `SANDBOX` | `TESTNET` |
| `NEXT_PUBLIC_PULSE_CONTRACT_ID` | ✓ | Deployed contract ID | `CC4HXCVI...` |
| `NEXT_PUBLIC_WS_URL` | ✓ | WebSocket server URL | `http://localhost:3001` |
| `CORS_ORIGIN` | ✓ | CORS origin | `http://localhost:3000` |
| `WEBHOOK_SECRET` | ✓ | Webhook signing secret | — |
| `JWT_SECRET` | ✓ | JWT signing secret | — |
| `API_KEY_SECRET` | ✓ | API key generation secret | — |
| `DEPLOYER_SECRET` | ✱ | Funded Testnet secret (deploy only) | — |
| `NODE_ENV` | — | Environment | `development` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | — | Public network | `TESTNET` |
| `STELLAR_HORIZON_URL` | — | Custom Horizon URL | Auto-derived |
| `STELLAR_SOROBAN_RPC_URL` | — | Custom RPC URL | Auto-derived |
| `WS_PORT` | — | WebSocket port | `3001` |

> ✱ `DEPLOYER_SECRET` is only needed for running `scripts/deploy-contract.ts`.

---

## 🙏 Credits

Built with ❤️ using:

| Tool | Role |
|---|---|
| [Next.js](https://nextjs.org) | React framework |
| [Stellar SDK](https://developers.stellar.org) | Horizon & Soroban RPC |
| [Freighter](https://freighter.app) | Stellar browser wallet |
| [Prisma](https://prisma.io) | TypeScript ORM |
| [Socket.io](https://socket.io) | Real-time WebSockets |
| [BullMQ](https://bullmq.io) | Job queue |
| [Tailwind CSS](https://tailwindcss.com) | Utility CSS |
| [Lucide](https://lucide.dev) | Icons |
| [Turborepo](https://turbo.build) | Monorepo build |
| [Docker](https://docker.com) | Containerization |
| [GitHub Actions](https://github.com/features/actions) | CI/CD |
| [Playwright](https://playwright.dev) | Browser automation |
| [Vercel](https://vercel.com) | Hosting |

---

## 📄 License

MIT © [MizpahPulse](https://github.com/MizPahPulse)

---

<p align="center">
  <sub>Built for hackathons. Ready for production.</sub>
</p>
