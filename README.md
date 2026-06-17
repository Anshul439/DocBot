# DocBot

DocBot is a full-stack RAG (Retrieval-Augmented Generation) app for chatting with PDF documents. Upload one or more PDFs, ask questions, get summaries, and see source citations — with streaming responses.

## Features

- PDF upload with async background processing (chunk → embed → index)
- Question answering grounded in your documents
- Summary / compare mode across multiple PDFs
- Streaming chat via Server-Sent Events (SSE)
- Per-user PDF isolation (JWT auth + guest mode)
- Chat history persisted per PDF or "All PDFs"
- Source badges (filename + page number)

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Backend | Express 5, TypeScript |
| AI | Google Gemini (`gemini-2.5-flash` + `gemini-embedding-001`) |
| RAG | LangChain, Qdrant |
| Queue | BullMQ + Redis/Valkey |
| Database | MongoDB |

## Architecture

```
Client (Next.js)
    ↓ REST + SSE
Express API
    ├── Upload → BullMQ job → PDF ingestion worker
    ├── Chat   → Retrieve chunks (Qdrant) → Stream answer (Gemini)
    └── Auth   → JWT or guest session

MongoDB  → users, PDF metadata, chat history
Qdrant   → vector embeddings (one collection per PDF)
Redis    → job queue
```

The API server and PDF worker run in the **same process** (`index.ts` starts both). No separate worker deployment required.

## Project Structure

```
DocBot/
├── client/                 # Next.js frontend
│   ├── app/
│   ├── components/
│   └── lib/auth-context.tsx
└── server/
    ├── src/
    │   ├── config/         # Redis, Qdrant, Gemini, queue, RAG constants
    │   ├── services/       # Ingestion, retrieval, generation, chat
    │   ├── workers/        # BullMQ PDF upload worker
    │   ├── cron/           # Keep-alive + guest cleanup
    │   ├── controllers/    # HTTP handlers
    │   ├── routes/
    │   ├── models/
    │   └── index.ts        # App entry point
    └── docker-compose.yml  # Local Qdrant + Valkey
```

## Prerequisites

- Node.js 20+
- pnpm (or npm)
- Docker (for local Qdrant + Redis)
- Google AI API key
- MongoDB instance (local or Atlas)

## Local Setup

### 1. Start infrastructure

```bash
cd server
docker compose up -d
```

This starts Qdrant (`localhost:6333`) and Valkey/Redis (`localhost:6379`).

### 2. Environment variables

**Server** (`server/.env`):

```env
PORT=8000
MONGO_URI=mongodb://localhost:27017/docbot
GOOGLE_API_KEY=your-gemini-api-key
JWT_SECRET=your-jwt-secret

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                        # optional for local Qdrant

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                        # optional for local Valkey
```

**Client** (`client/.env.local`):

```env
NEXT_PUBLIC_ROOT_URL=http://localhost:8000
```

### 3. Install and run

```bash
# Backend
cd server
pnpm install
pnpm run build
pnpm run dev

# Frontend (separate terminal)
cd client
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users/signup` | Create account |
| POST | `/api/users/signin` | Sign in |
| POST | `/upload/pdf` | Upload PDF (returns `jobId`) |
| GET | `/job/:id` | Check processing status |
| GET | `/pdfs` | List user's PDFs |
| GET | `/chat?message=&collection=` | Stream chat (SSE) |
| GET | `/chat/history?collectionName=` | Fetch chat history |
| DELETE | `/pdf/:collectionName` | Delete a PDF |
| GET | `/health` | Health check |

Auth: `Authorization: Bearer <token>` for signed-in users, or `X-Guest-Id: guest_<uuid>` for guest mode.

## RAG Pipeline

1. **Ingestion** — PDF is loaded, split into 1200-character chunks (200 overlap), embedded with Gemini, stored in Qdrant
2. **Q&A** — Query is embedded, top 4 similar chunks retrieved per PDF, answer streamed from Gemini
3. **Summary** — Keyword detection triggers a scroll-based retrieval for broader coverage, then summary generation

## Guest Mode

Users can try DocBot without signing up. Guest uploads and chats expire after **48 hours** (cleaned up by a daily cron job). Sign in to keep data permanently.

## Deployment

- **Backend**: Deploy `server/` as a single Node service (e.g. Render). Start command: `npm run build && npm start`
- **Frontend**: Deploy `client/` to Vercel with `NEXT_PUBLIC_ROOT_URL` pointing to your API
- Set `RENDER_URL` on the server for keep-alive pings if using Render free tier

## Scripts

| Command | Where | Description |
|---------|-------|-------------|
| `pnpm dev` | server | API + worker (watch mode) |
| `pnpm start` | server | Production start |
| `pnpm dev` | client | Next.js dev server |
