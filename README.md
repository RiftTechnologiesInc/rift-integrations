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
