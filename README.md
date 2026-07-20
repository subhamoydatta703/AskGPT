# AskGPT

AskGPT is an authenticated chat application built with Next.js App Router. Users sign in with Clerk, manage multi-thread conversations, and stream AI replies through the Vercel AI SDK. Chat history is stored in PostgreSQL via Prisma, and the model can call tools for live weather and web search.

## Features

- Streaming chat UI powered by `@ai-sdk/react` `useChat` and a word-level `smoothStream` typing effect
- Server-side completions via `streamText` on `POST /api/chat`
- Tool calling with function tools that work on any model:
  - `get_weather` — current conditions via the Open-Meteo geocoding and forecast APIs
  - `web_search` — Tavily search API for real-time web results, page content, and news
- Google Gemini models through `getChatModel()` (default `gemini-3.1-flash-lite`), with optional per-conversation model override stored in the database
- Clerk authentication; public sign-in at `/sign-in`, all other routes protected by `proxy.ts`
- Conversation management: create, rename, pin/unpin, delete; sidebar list ordered by pin then recency
- Message persistence with structured `parts` JSON for AI SDK UI messages
- Auto-title for new chats from the first user message
- Light/dark theme via `next-themes`

## Tech stack

| Layer | Packages / tools |
| --- | --- |
| Framework | Next.js 16, React 19 |
| Language | TypeScript |
| Auth | `@clerk/nextjs` |
| AI | `ai`, `@ai-sdk/react`, `@ai-sdk/google` |
| Database | Prisma 7, `@prisma/client`, `@prisma/adapter-pg`, PostgreSQL |
| Data fetching (client) | `@tanstack/react-query` |
| UI | Tailwind CSS 4, shadcn / Base UI, `lucide-react`, `sonner`, `streamdown` |
| Package manager | Bun (`bun.lock`) |

## Architecture

```mermaid
sequenceDiagram
    participant Client as Client (ConversationView)
    participant Proxy as proxy.ts (Clerk)
    participant API as POST /api/chat
    participant Auth as requireUser + Prisma
    participant Store as chat-store
    participant Model as getChatModel (Gemini)
    participant Tools as chatTools
    participant DB as PostgreSQL

    Client->>Proxy: POST /api/chat { id, message }
    Proxy->>API: auth.protect (non-public routes)
    API->>Auth: verify session and load User
    Auth->>DB: find Conversation by id + userId
    API->>Store: loadChatMessages(id)
    Store->>DB: Message.findMany
    alt user message not yet saved
        API->>Store: saveChatMessages(id, [message])
        Store->>DB: Message.upsert + update lastMessageAt
    end
    API->>Model: streamText (system, history, tools, smoothStream)
    opt tool calls (up to 5 steps)
        Model->>Tools: get_weather / web_search
        Tools-->>Model: tool results
    end
    Model-->>API: UI message stream
    API-->>Client: createUIMessageStreamResponse
    API->>Store: onEnd saveChatMessages(finalMessages)
    Store->>DB: upsert assistant messages
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later (project targets `@types/node` ^20)
- [Bun](https://bun.sh/) (lockfile is `bun.lock`)
- A PostgreSQL database (any host; connection string via `DATABASE_URL`)
- [Clerk](https://clerk.com/) application credentials
- [Google AI](https://ai.google.dev/) API key for Gemini
- Optional: [Tavily](https://tavily.com) API key for `web_search`

## Setup

### 1. Clone and install

```bash
git clone <repository-url>
cd ask-gpt-build
bun install
```

### 2. Environment variables

Create a `.env` or `.env.local` file in the project root. Variables below are taken from application code, Prisma config, and required provider SDKs:

```env
# PostgreSQL (lib/db.ts, prisma.config.ts)
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"

# Clerk (@clerk/nextjs)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Google Gemini (@ai-sdk/google)
GOOGLE_GENERATIVE_AI_API_KEY="..."

# Tavily (features/ai/tools.ts) — required for web_search tool
TAVILY_API_KEY="tvly-..."
```

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | App + Prisma | PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth (client) | Safe to expose in the browser |
| `CLERK_SECRET_KEY` | Auth (server) | Server-only |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Chat completions | Used by `@ai-sdk/google` |
| `TAVILY_API_KEY` | `web_search` tool | Server-only; tool throws if missing |

`get_weather` uses public Open-Meteo endpoints and does not require an API key.

### 3. Database setup

There are no Prisma scripts in `package.json`; run the Prisma CLI via Bun:

```bash
# Generate the client into lib/generated/prisma
bunx prisma generate

# Apply migrations to DATABASE_URL
bunx prisma migrate dev
```

Schema models: `User`, `Conversation`, `Message` (see `prisma/schema.prisma`).

## Running locally

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated users are sent to `/sign-in`. The home route creates a conversation and redirects to `/c/{id}`.

## Production

```bash
bun run build
bun run start
```

Other scripts:

```bash
bun run lint
```

## Project structure

```
app/
  (auth)/sign-in/          # Clerk sign-in UI
  (root)/                  # Authenticated shell (onboard + ChatShell)
    page.tsx               # Creates a chat and redirects to /c/[id]
    c/[id]/page.tsx       # Conversation page
  api/chat/route.ts        # Streaming chat API
  layout.tsx               # Root providers (Clerk, React Query, theme)
components/
  ai-elements/             # Conversation/message UI primitives
  providers/               # Theme and query providers
  ui/                      # shadcn/Base UI components
features/
  ai/
    actions/chat-store.ts  # load/save UI messages
    tools.ts               # get_weather, web_search
    utils/model.ts         # getChatModel (Gemini)
  auth/                    # onBoard, requireUser
  conversation/            # Sidebar, chat UI, conversation server actions
  home/                    # startNewChat
  messages/                # Message list/actions
lib/
  db.ts                    # Prisma client (pg adapter)
  generated/prisma/        # Generated client (gitignored)
prisma/
  schema.prisma
  migrations/
proxy.ts                   # Clerk route protection (Next.js Proxy)
```

## Contributors

- [Subhamoy Datta](https://github.com/subhamoydatta703)
- [Arpan Sarkar](https://github.com/arpan7sarkar)

## License

MIT
