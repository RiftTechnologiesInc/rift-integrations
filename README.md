# Rift Integrations

**Backend integration playground for Rift wealth management CRM adapters.**

## Purpose

This repository exists to explore, validate, and integrate real CRM and fintech APIs (starting with Salesforce) for the Rift wealth management platform.

**Why separate from the Rift MVP?**

- **Isolation**: Integration experiments should not pollute the main product codebase
- **Portability**: Core models and adapters can be extracted into libraries or services later
- **Focus**: No UI, no React, no database—just clean adapter patterns and API validation
- **Speed**: Rapid prototyping without touching the product build pipeline

This repo defines:
1. **CRM-agnostic core models** that represent how Rift thinks about clients, accounts, and workflows
2. **Port interfaces** that all CRM adapters must implement
3. **Salesforce adapter** as the reference implementation
4. **Sandbox scripts** to manually test and validate API behavior

---

## Architecture

```
src/
├─ core/               # CRM-agnostic domain models
│  ├─ models/          # Client, Account, ServiceRequest, WorkflowStep
│  ├─ ports/           # CRMClient interface (contract for all adapters)
│  └─ errors/          # Custom error classes
├─ adapters/           # CRM-specific implementations
│  └─ salesforce/      # Salesforce REST API adapter
├─ sandbox/            # Executable test scripts
│  └─ scripts/         # Manual testing scenarios
└─ index.ts            # Public API exports
```

### Hexagonal Architecture (Ports & Adapters)

- **Core models** are entirely CRM-agnostic (no Salesforce naming leaks in)
- **Ports** define the contract (e.g., `CRMClient` interface)
- **Adapters** implement the contract for specific CRMs (Salesforce, HubSpot, Redtail, etc.)
- **Sandbox scripts** use the adapters to validate real-world behavior

---

## Setup

### Prerequisites

- Node.js >= 18
- npm >= 9
- Salesforce Developer Edition account (free)

### Installation

```bash
npm install
```

### Configuration

1. Fill in your Salesforce credentials in `.env`:
   - **Login URL**: `https://login.salesforce.com` (or `https://test.salesforce.com` for sandbox)
   - **Username**: Your Salesforce username
   - **Client ID**: Connected App Consumer Key
   - **Private Key Path**: `./salesforce.key` (JWT bearer flow)

2. JWT Bearer setup (recommended):
   - Create a Connected App (OAuth enabled).
   - Add OAuth scope: **Perform requests on your behalf at any time (refresh_token, offline_access)**.
   - Set **Permitted Users** = **Admin approved users are pre-authorized**.
   - Create a permission set and assign it to your user, then associate it with the Connected App.
   - Generate an RSA key pair and upload the **certificate** to the Connected App.

Example `.env`:
```bash
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_USERNAME=you@example.com
SALESFORCE_CLIENT_ID=your_consumer_key
SALESFORCE_PRIVATE_KEY_PATH=./salesforce.key
```

---

## Running Sandbox Scripts

Sandbox scripts are executable TypeScript files that demonstrate real API calls.

### Create a Client

```bash
npm run sandbox:create-client
```

Creates a new wealth management client in Salesforce and logs the result.

### Create a Service Request

```bash
npm run sandbox:create-service-request
```

Creates a service request (e.g., account rebalancing) linked to a client.

### Advance a Service Request

```bash
npm run sandbox:advance-service-request
```

Updates the status of a service request through its workflow stages.

---

## Fastify API (Production-Style)

This repo includes a small Fastify API so your UI can call Salesforce through the adapter.

### Setup

1. Add an API key to `.env` (you choose the value):
   ```bash
   API_KEY=super-secret-change-me
   ```
2. Optional: enable UI JWT auth (Bearer tokens):
   ```bash
   UI_JWT_SECRET=your-jwt-secret
   ```
3. Optional: webhook secret for Salesforce callbacks:
   ```bash
   SALESFORCE_WEBHOOK_SECRET=your-webhook-secret
   ```
4. OAuth (multi-tenant) configuration:
   ```bash
   SALESFORCE_CLIENT_ID=your_connected_app_consumer_key
   SALESFORCE_CLIENT_SECRET=your_connected_app_consumer_secret
   SALESFORCE_OAUTH_REDIRECT_URI=http://127.0.0.1:3000/oauth/salesforce/callback
   ```
5. Supabase (tenant storage):
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   SUPABASE_TENANTS_TABLE=salesforce_tenants
   SUPABASE_CLIENTS_TABLE=salesforce_clients
   SUPABASE_SERVICE_REQUESTS_TABLE=salesforce_service_requests
   ```
6. Token encryption (required):
   ```bash
   # 32-byte base64 string (store securely)
   TENANT_TOKEN_ENCRYPTION_KEY=base64-32-byte-key
   ```

6. Start the server:
   ```bash
   npm run api:dev
   ```

### Auth

All endpoints (except `/health`) require a key. Send either:

- `x-api-key: <API_KEY>`
- or `Authorization: Bearer <API_KEY>`

If `UI_JWT_SECRET` is set, you can also send a JWT in:
- `Authorization: Bearer <JWT>`

### Multi-tenant usage

To route requests to a specific firm’s Salesforce org, include:
- `x-tenant-id: <tenantId>`

If omitted, the server uses the default JWT configuration.

Tenant access tokens are automatically refreshed using the stored refresh token.
Tokens are encrypted at rest using AES-256-GCM with `TENANT_TOKEN_ENCRYPTION_KEY`.

### Endpoints

**GET `/health`**
Returns `{ ok: true }`.

**GET `/clients`**
Optional query params:
- `clientType` (e.g. `INDIVIDUAL`, `JOINT`, `TRUST`, `CORPORATE`)
- `minAUM`
- `maxAUM`
- `limit`
- `offset`
- `orderBy` (`CreatedDate`, `LastModifiedDate`, `Name`)
- `orderDir` (`ASC`, `DESC`)

Example:
```bash
curl -H "x-api-key: your-key" "http://127.0.0.1:3000/clients?clientType=INDIVIDUAL"
```

**POST `/clients`**
Creates a client (Account/Contact).
```bash
curl -X POST http://127.0.0.1:3000/clients \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{"name":"Jane Doe","email":"jane@example.com","phone":"+1-555-0000"}'
```

**POST `/service-requests`**
Creates a service request (Case).
```bash
curl -X POST http://127.0.0.1:3000/service-requests \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{"title":"Onboarding","clientId":"001...","description":"New client"}'
```

---

## Core Models

### Client

Represents a wealth management client (individual or entity).

**Fields**: name, email, phone, assets under management (AUM), risk profile, client type

### Account

Financial account owned by a client.

**Fields**: account number, account type (retirement, taxable, trust), balance, client ID

### ServiceRequest

A service request from a client (onboarding, rebalancing, withdrawal, etc.).

**Fields**: title, description, status, priority, client ID, assigned to, workflow steps

### WorkflowStep

Individual step in a multi-stage workflow.

**Fields**: step name, status, assignee, due date, completed date

---

## CRMClient Interface

All CRM adapters must implement the `CRMClient` interface:

```typescript
interface CRMClient {
  listClients(filters?: ClientFilters): Promise<Client[]>;
  getClient(id: string): Promise<Client>;
  createClient(data: CreateClientData): Promise<Client>;
  updateClient(id: string, data: UpdateClientData): Promise<Client>;

  createServiceRequest(data: CreateServiceRequestData): Promise<ServiceRequest>;
  getServiceRequest(id: string): Promise<ServiceRequest>;
  updateServiceRequestStatus(id: string, status: ServiceRequestStatus): Promise<ServiceRequest>;
}
```

---

## Salesforce Adapter

The Salesforce adapter maps Salesforce objects to Rift core models:

| Rift Model       | Salesforce Object | Notes                                      |
|------------------|-------------------|--------------------------------------------|
| Client           | Account (or Contact) | Uses custom fields for AUM, risk profile |
| Account          | Custom Object (Financial_Account__c) | Custom object to track financial accounts |
| ServiceRequest   | Case              | Uses custom fields for workflow tracking   |
| WorkflowStep     | Custom Object (Workflow_Step__c) | Custom object for multi-step workflows |

**Authentication**: Uses OAuth 2.0 Username-Password flow.

**API**: Salesforce REST API (v59.0+).

---

## Adding Future Adapters

To add a new CRM adapter (e.g., HubSpot, Redtail, Wealthbox):

1. **Create adapter directory**:
   ```
   src/adapters/hubspot/
   ├─ HubSpotClient.ts
   └─ hubspotTypes.ts
   ```

2. **Implement CRMClient interface**:
   ```typescript
   export class HubSpotClient implements CRMClient {
     async listClients() { /* ... */ }
     async createClient() { /* ... */ }
     // ... implement all methods
   }
   ```

3. **Map CRM objects to core models**:
   - Keep Rift models unchanged
   - Handle all transformations in the adapter layer

4. **Add sandbox scripts**:
   ```
   src/sandbox/scripts/hubspot/
   ├─ createClient.ts
   └─ ...
   ```

5. **Export from index.ts**:
   ```typescript
   export { HubSpotClient } from './adapters/hubspot/HubSpotClient';
   ```

---

## Development Workflow

### Type-check

```bash
npm run type-check
```

### Build

```bash
npm run build
```

Output: `dist/` directory with compiled JavaScript and type definitions.

---

## Non-Goals (Intentional Limitations)

- **No UI**: This is a backend-only repository
- **No database**: Adapters talk directly to external CRMs
- **No production auth hardening**: Use environment variables; secrets management comes later
- **No premature abstraction**: Build only what's needed for Salesforce validation

---

## Future Work

- Add adapters for HubSpot, Redtail, Wealthbox, etc.
- Extract to standalone npm package for use in Rift MVP
- Add integration tests (mocked CRM responses)
- Add rate limiting and retry logic
- Add webhook handlers for real-time CRM updates

---

## License

MIT
**GET `/service-requests`**
Optional query params:
- `clientId`
- `status` (`NEW`, `IN_PROGRESS`, `PENDING_CLIENT`, `PENDING_APPROVAL`, `COMPLETED`, `CANCELLED`)
- `limit`
- `offset`
- `orderBy` (`CreatedDate`, `LastModifiedDate`)
- `orderDir` (`ASC`, `DESC`)

**PATCH `/service-requests/:id`**
Updates a service request status.
```bash
curl -X PATCH http://127.0.0.1:3000/service-requests/500... \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{"status":"IN_PROGRESS"}'
```

**POST `/webhooks/salesforce`**
Webhook endpoint for Salesforce callbacks (CDC/Platform Events).
```bash
curl -X POST http://127.0.0.1:3000/webhooks/salesforce \
  -H "x-webhook-secret: your-webhook-secret" \
  -H "Content-Type: application/json" \
  -d '{"example":"payload"}'
```

Webhook events are stored locally in `data/webhook-events.json`. A minimal
CDC mapping for Accounts/Cases is stored in `data/sync-state.json`.
Webhook events are also upserted into Supabase cache tables.

**GET `/db/clients`**
Reads cached clients from Supabase for the tenant.

**GET `/db/service-requests`**
Reads cached service requests from Supabase for the tenant.

---

## Multi-tenant OAuth (Firms Connect Their Own Salesforce)

1. Ensure your Connected App has:
   - OAuth enabled
   - Scopes: `api` (or `full`), and `refresh_token, offline_access`
   - Permitted Users: `All users may self-authorize`

2. Start OAuth for a firm:
```bash
http://127.0.0.1:3000/oauth/salesforce/start?tenantId=firm_123&loginUrl=https://login.salesforce.com
```

3. Complete the Salesforce login/consent. The callback stores tokens in Supabase.

4. List connected tenants:
```bash
http://127.0.0.1:3000/oauth/salesforce/tenants
```

### Supabase table schema

Create this table in Supabase:
```sql
create table if not exists salesforce_tenants (
  tenant_id text primary key,
  login_url text not null,
  instance_url text not null,
  access_token text not null,
  refresh_token text,
  issued_at text,
  id_url text,
  updated_at timestamptz default now()
);
```

Create cache tables for synced data:
```sql
create table if not exists salesforce_clients (
  tenant_id text not null,
  sf_id text not null,
  name text,
  email text,
  phone text,
  last_changed timestamptz,
  primary key (tenant_id, sf_id)
);

create table if not exists salesforce_service_requests (
  tenant_id text not null,
  sf_id text not null,
  subject text,
  status text,
  priority text,
  account_id text,
  last_changed timestamptz,
  primary key (tenant_id, sf_id)
);
```

### Migrate local tenants.json (optional)

If you already connected tenants before Supabase:
```bash
npm run migrate:tenants
```

### Re-encrypt existing Supabase tokens

If tokens are already stored in plaintext in Supabase:
```bash
npm run reencrypt:tenants
```

---

## AWS CDK (Lean Webhook Deployment)

This deploys a small Lambda + API Gateway that only handles:
`POST /webhooks/salesforce`

### Prereqs

- AWS credentials configured (`aws configure`)
- Node.js >= 18
- CDK installed: `npm i -g aws-cdk`

### Env (required)

Set these before deploy (same values you use locally):
```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_CLIENTS_TABLE=salesforce_clients
SUPABASE_SERVICE_REQUESTS_TABLE=salesforce_service_requests
SUPABASE_TENANTS_TABLE=salesforce_tenants
TENANT_TOKEN_ENCRYPTION_KEY=...
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
SALESFORCE_WEBHOOK_SECRET=...
```

### Deploy

```bash
npm install
npm run cdk:bootstrap
npm run cdk:deploy
```

The deploy output includes `WebhookUrl`. Use that as your Salesforce CDC/webhook endpoint.

### Git ignore

These files are generated and should not be committed:
- `cdk.out/`
- `lambda-dist/`
- `cdk-outputs.json`

---

## Local CDC Listener (Free Dev Test)

Runs a local process that subscribes to Salesforce CDC and forwards events
to your AWS webhook.

### Env
```bash
CDC_TENANT_ID=firm_123
CDC_WEBHOOK_URL=https://ee25hkoqrc.execute-api.us-east-1.amazonaws.com/prod/webhooks/salesforce
SALESFORCE_WEBHOOK_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_TENANTS_TABLE=salesforce_tenants
TENANT_TOKEN_ENCRYPTION_KEY=...
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
```

### Run
```bash
npm run cdc:listen
```

### Test
Update an Account/Case in Salesforce and watch Supabase tables update.
