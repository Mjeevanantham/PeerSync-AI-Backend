# PeerSync Dev Connect - Backend

Production-ready NestJS backend for real-time cross-IDE developer collaboration.

## Overview

This backend serves as the **single source of truth** for:
- Authentication verification
- Peer presence and discovery
- Session lifecycle management
- Message routing between peers
- LAN mode detection (same-network peers)

## Tech Stack

- Node.js 20 LTS
- NestJS ^10.x
- TypeScript ^5.9
- Native WebSocket (ws library)
- JWT (RS256)
- In-memory stores (Map-based)

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your Supabase credentials

# Run database migration (creates users table in Supabase)
npm run db:migrate:remote  # See instructions for Supabase SQL Editor
# Or: npx supabase link --project-ref YOUR_PROJECT_REF && npm run db:migrate

# Start development server
npm run start:dev
```

## Database Migration (Supabase)

The `public.users` table syncs user data from Supabase Auth. Run the migration:

**Option A: Supabase SQL Editor**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/_/sql)
2. Copy contents of `supabase/migrations/20260131120000_create_users_table.sql`
3. Paste and run in SQL Editor

**Option B: Supabase CLI**
```bash
npx supabase link --project-ref ckgbxjystbrhjehayttg
npm run db:migrate
```

Run the second migration for `last_login_at`:
```bash
# In Supabase SQL Editor, run supabase/migrations/20260201120000_add_last_login_at.sql
```

## Supabase Auth Configuration (Multi-Provider)

Enable these providers in Supabase Dashboard → **Authentication** → **Providers**:
- **GitHub** OAuth (already enabled)
- **Google** OAuth
- **LinkedIn** OAuth
- **Email** (password)
- **Email OTP** (magic link / one-time code)

Add Redirect URLs in **Authentication** → **URL Configuration**:
```
vscode://peersync.peersync-dev-connect/auth/callback
cursor://peersync.peersync-dev-connect/auth/callback
windsurf://peersync.peersync-dev-connect/auth/callback
antigravity://peersync.peersync-dev-connect/auth/callback
code://peersync.peersync-dev-connect/auth/callback
http://localhost:54321
```

Backend accepts any Supabase-issued JWT. No backend changes needed when adding providers.

## Railway Deployment

### Step 1: Connect Repository

1. Go to [Railway](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select `PeerSync-AI-Backend` repository
4. Railway will auto-detect NestJS

### Step 2: Configure Environment Variables

In Railway dashboard → Settings → Variables, add:

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Auto | Railway sets this automatically |
| `JWT_PUBLIC_KEY` | Yes | RSA public key (PEM format, see below) |
| `JWT_PRIVATE_KEY` | Yes | RSA private key (PEM format, see below) |
| `JWT_ISSUER` | No | Default: `peersync-dev-connect` |
| `JWT_AUDIENCE` | No | Default: `peersync-clients` |
| `JWT_EXPIRATION` | No | Default: `1h` |
| `CORS_ORIGIN` | No | Comma-separated origins (empty = disabled in prod) |

### Step 3: Generate and Set RSA Keys

Generate keys locally:
```bash
npm run generate:keys
```

Then copy the contents of `keys/public.pem` and `keys/private.pem` to Railway:

**Option A: Direct PEM (with escaped newlines)**
```
-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----
```

**Option B: Base64 encoded**
```bash
# Encode public key
cat keys/public.pem | base64 -w 0

# Encode private key
cat keys/private.pem | base64 -w 0
```

### Step 4: Deploy

Railway will automatically:
1. Run `npm install`
2. Run `npm run build`
3. Run `npm start` (which runs `node dist/main`)

### Step 5: Verify Deployment

Check logs for:
```
🚀 PeerSync backend running on port XXXX
🔌 WebSocket endpoint: /ws
🌍 Environment: production
```

Test health endpoint:
```bash
curl https://your-app.railway.app/api/v1/health
# Response: {"status":"ok","timestamp":"..."}
```

### Production URLs

After deployment, your URLs will be:
- **HTTP**: `https://your-app.railway.app`
- **WebSocket**: `wss://your-app.railway.app/ws`
- **Health**: `https://your-app.railway.app/api/v1/health`

## WebSocket Protocol

### Connection Flow

1. **Connect** to `wss://your-app.railway.app/ws` (production) or `ws://localhost:3000/ws` (dev)
2. **Send AUTH** event with JWT token (within 10 seconds)
3. **Receive AUTH_SUCCESS** or **AUTH_FAILED**
4. **Send PEER_REGISTER** to join the peer network
5. **Discover peers** and **request connections**

### Events Reference

#### Authentication

```typescript
// Client sends
{ "event": "AUTH", "data": { "token": "eyJhbGciOiJSUzI1Ni..." } }

// Server responds
{ "event": "AUTH_SUCCESS", "data": { "userId": "user_123", "displayName": "John", "email": "john@example.com" } }
// OR
{ "event": "AUTH_FAILED", "data": { "code": "ERR_1002", "message": "..." } }
```

#### Peer Registration

```typescript
// Client sends (after AUTH_SUCCESS)
{ "event": "PEER_REGISTER", "data": { "displayName": "John", "ide": "vscode", "role": "guest" } }

// Server responds
{ "event": "PEER_REGISTERED", "data": { "id": "user_123", "profile": { "displayName": "John", "role": "guest", "ide": "vscode" }, "status": "online" } }
```

#### Peer Discovery

```typescript
// Client sends
{ "event": "DISCOVER_PEERS", "data": { "role": "host", "ide": "vscode", "lanOnly": true } } // filters optional

// Server responds
{ "event": "PEERS_LIST", "data": { "peers": [{ "id": "user_456", "profile": {...}, "status": "online", "connectionMode": "LAN" }] } }
```

#### Connection Request Flow

```typescript
// Requester sends
{ "event": "CONNECTION_REQUEST", "data": { "targetId": "user_456" } }

// Target receives
{ "event": "CONNECTION_REQUEST_RECEIVED", "data": { "requestId": "req_xxx", "from": { "id": "user_123", "profile": {...} } } }

// Target responds
{ "event": "CONNECTION_RESPONSE", "data": { "requestId": "req_xxx", "accepted": true } }

// If accepted, both peers receive:
// Requester gets:
{ "event": "CONNECTION_ACCEPTED", "data": { "requestId": "req_xxx", "sessionId": "ses_xxx", "peer": {...} } }
// Target gets:
{ "event": "SESSION_CREATED", "data": { "sessionId": "ses_xxx", "peer": {...} } }

// If rejected, requester gets:
{ "event": "CONNECTION_REJECTED", "data": { "requestId": "req_xxx", "targetId": "user_456" } }
```

#### Messaging

```typescript
// Client sends (must be in session)
{ "event": "SEND_MESSAGE", "data": { "sessionId": "ses_xxx", "content": {...}, "type": "ai-request", "correlationId": "cor_xxx" } }

// Other session participant receives
{ "event": "MESSAGE_RECEIVED", "data": { "sessionId": "ses_xxx", "from": "user_123", "content": {...}, "type": "ai-request", "correlationId": "cor_xxx", "timestamp": "..." } }
```

#### Heartbeat

```typescript
// Client sends
{ "event": "PING", "data": {} }

// Server responds
{ "event": "PONG", "data": { "timestamp": 1706700000000 } }
```

#### Errors

```typescript
{ "event": "ERROR", "data": { "code": "ERR_XXXX", "message": "..." } }
```

### IDE Types

- `vscode`
- `cursor`
- `jetbrains`
- `vim`
- `neovim`
- `emacs`
- `sublime`
- `other`

### Peer Roles

- `host`
- `guest`
- `observer`

### Peer Status

- `online`
- `away`
- `busy`
- `offline`

### Connection Mode (LAN Detection)

- `LAN` - Peer is on the same network
- `REMOTE` - Peer is on a different network

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/health/ready` | Readiness check |
| GET | `/api/v1/auth/verify` | Verify Supabase token (requires Bearer JWT) |
| GET | `/api/v1/auth/health` | Auth service health |

**Note:** Tokens are issued by Supabase Auth only. Backend verifies; it does not issue tokens.

## Error Codes

| Code | Description |
|------|-------------|
| ERR_1001 | Token missing |
| ERR_1002 | Token invalid |
| ERR_1003 | Token expired |
| ERR_2001 | Peer not found |
| ERR_2005 | Peer already connected |
| ERR_2006 | Peer must register first |
| ERR_3001 | Session not found |
| ERR_3008 | Not a session participant |
| ERR_5005 | Socket not authenticated |
| ERR_6001 | Connection request not found |

## Project Structure

```
src/
├── auth/           # JWT authentication
├── common/         # Types, constants, utilities
├── config/         # Environment configuration
├── gateway/        # WebSocket gateway
├── health/         # Health check endpoints
├── messaging/      # Socket registry
├── peer/           # Peer registry
├── session/        # Session management
├── app.module.ts
└── main.ts
```

## Security

- All sockets must authenticate within 10 seconds
- JWT validated via Supabase (JWKS / HS256)
- Duplicate connections supersede old ones
- Session participation validated on every message
- IP addresses are hashed (never stored raw)
- No auth reconnection on token failure (4001/4002)

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start` | Production mode |
| `npm run start:dev` | Development with hot reload |
| `npm run build` | Build for production |
| `npm run db:migrate` | Push migrations (Supabase CLI linked) |

## License

MIT
