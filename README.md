# PeerSync Dev Connect - Backend

Production-ready NestJS backend for real-time cross-IDE developer collaboration.

## Overview

This backend serves as the **single source of truth** for:
- Authentication verification
- Peer presence and discovery
- Session lifecycle management
- Message routing between peers

## Tech Stack

- Node.js 20 LTS
- NestJS ^10.x
- TypeScript ^5.9
- Native WebSocket (ws library)
- JWT (RS256)
- In-memory stores (Map-based)

## Quick Start

```bash
# Install dependencies
npm install

# Generate RSA keys for JWT
npm run generate:keys

# Create environment file
cp .env.example .env

# Start development server
npm run start:dev
```

## WebSocket Protocol

### Connection Flow

1. **Connect** to `ws://localhost:3000/ws`
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
{ "event": "DISCOVER_PEERS", "data": { "role": "host", "ide": "vscode" } } // filters optional

// Server responds
{ "event": "PEERS_LIST", "data": { "peers": [{ "id": "user_456", "profile": {...}, "status": "online" }] } }
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

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/auth/public-key` | Get JWT public key |
| GET | `/api/v1/auth/verify` | Verify token (requires auth) |
| POST | `/api/v1/auth/dev-token` | Generate dev token |

### Generate Dev Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/dev-token \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_123", "email": "dev@example.com", "displayName": "Developer"}'
```

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
├── messaging/      # Socket registry
├── peer/           # Peer registry
├── session/        # Session management
├── app.module.ts
└── main.ts
```

## Security

- All sockets must authenticate within 10 seconds
- JWT validated using RS256 algorithm
- Duplicate connections supersede old ones
- Session participation validated on every message

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Development with hot reload |
| `npm run start:prod` | Production mode |
| `npm run build` | Build for production |
| `npm run generate:keys` | Generate RSA key pair |

## License

MIT
