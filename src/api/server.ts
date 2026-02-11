import * as dotenv from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SalesforceClient } from '../adapters/salesforce/SalesforceClient';
import { ClientType, RiskProfile } from '../core/models/Client';
import {
  CreateServiceRequestData,
  ServiceRequestPriority,
  ServiceRequestStatus,
  ServiceRequestType,
} from '../core/models/ServiceRequest';
import {
  AuthenticationError,
  CRMError,
  NotFoundError,
  ValidationError,
} from '../core/errors';

dotenv.config();

const server = Fastify({ logger: true });

// Enable CORS for frontend
server.register(cors, {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
});
const apiKey = process.env.API_KEY;
const uiJwtSecret = process.env.UI_JWT_SECRET;
const webhookSecret = process.env.SALESFORCE_WEBHOOK_SECRET;
const oauthClientId = process.env.SALESFORCE_CLIENT_ID;
const oauthClientSecret = process.env.SALESFORCE_CLIENT_SECRET;
const oauthRedirectUri = process.env.SALESFORCE_OAUTH_REDIRECT_URI;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseTenantsTable =
  process.env.SUPABASE_TENANTS_TABLE || 'salesforce_tenants';
const supabaseClientsTable =
  process.env.SUPABASE_CLIENTS_TABLE || 'salesforce_clients';
const supabaseServiceRequestsTable =
  process.env.SUPABASE_SERVICE_REQUESTS_TABLE || 'salesforce_service_requests';
const encryptionKeyB64 = process.env.TENANT_TOKEN_ENCRYPTION_KEY;

const dataDir = path.resolve(process.cwd(), 'data');
const eventsPath = path.join(dataDir, 'webhook-events.json');
const syncPath = path.join(dataDir, 'sync-state.json');
const pkcePath = path.join(dataDir, 'pkce.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

type TenantConnection = {
  tenantId: string;
  userId?: string;
  loginUrl: string;
  instanceUrl: string;
  accessToken: string;
  refreshToken?: string;
  issuedAt?: string;
  idUrl?: string;
};

type TenantRow = {
  tenant_id: string;
  login_url: string;
  instance_url: string;
  access_token: string;
  refresh_token?: string | null;
  issued_at?: string | null;
  id_url?: string | null;
  updated_at?: string | null;
};

type ClientRow = {
  tenant_id: string;
  sf_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  last_changed?: string | null;
};

type ServiceRequestRow = {
  tenant_id: string;
  sf_id: string;
  subject?: string | null;
  status?: string | null;
  priority?: string | null;
  account_id?: string | null;
  last_changed?: string | null;
};

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    throw new CRMError('Supabase not configured', 'SUPABASE_CONFIG');
  }
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

function mapTenantRow(row: TenantRow): TenantConnection {
  return {
    tenantId: row.tenant_id,
    loginUrl: row.login_url,
    instanceUrl: row.instance_url,
    accessToken: decryptSecret(row.access_token),
    refreshToken: row.refresh_token ? decryptSecret(row.refresh_token) : undefined,
    issuedAt: row.issued_at || undefined,
    idUrl: row.id_url || undefined,
  };
}

async function upsertClientRow(row: ClientRow): Promise<void> {
  const client = getSupabase();
  const { error } = await client
    .from(supabaseClientsTable)
    .upsert(row, { onConflict: 'tenant_id,sf_id' });
  if (error) {
    throw new CRMError(`Supabase upsert failed: ${error.message}`, 'SUPABASE_UPSERT');
  }
}

async function upsertServiceRequestRow(row: ServiceRequestRow): Promise<void> {
  const client = getSupabase();
  const { error } = await client
    .from(supabaseServiceRequestsTable)
    .upsert(row, { onConflict: 'tenant_id,sf_id' });
  if (error) {
    throw new CRMError(`Supabase upsert failed: ${error.message}`, 'SUPABASE_UPSERT');
  }
}

async function listClientsFromDb(tenantId: string) {
  const client = getSupabase();
  const { data, error } = await client
    .from(supabaseClientsTable)
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) {
    throw new CRMError(`Supabase fetch failed: ${error.message}`, 'SUPABASE_FETCH');
  }
  return data || [];
}

async function listServiceRequestsFromDb(tenantId: string) {
  const client = getSupabase();
  const { data, error } = await client
    .from(supabaseServiceRequestsTable)
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) {
    throw new CRMError(`Supabase fetch failed: ${error.message}`, 'SUPABASE_FETCH');
  }
  return data || [];
}

function getEncryptionKey(): Buffer {
  if (!encryptionKeyB64) {
    throw new CRMError('TENANT_TOKEN_ENCRYPTION_KEY is not set', 'ENCRYPTION_CONFIG');
  }
  const key = Buffer.from(encryptionKeyB64, 'base64');
  if (key.length !== 32) {
    throw new CRMError(
      'TENANT_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)',
      'ENCRYPTION_CONFIG'
    );
  }
  return key;
}

function encryptSecret(plain: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join('.');
}

function decryptSecret(payload: string): string {
  const key = getEncryptionKey();
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new CRMError('Encrypted token format invalid', 'ENCRYPTION_FORMAT');
  }
  const [ivB64, dataB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
}

async function upsertTenant(conn: TenantConnection): Promise<void> {
  const client = getSupabase();
  const { error } = await client
    .from(supabaseTenantsTable)
    .upsert(
      {
        tenant_id: conn.tenantId,
        user_id: conn.userId || null,
        login_url: conn.loginUrl,
        instance_url: conn.instanceUrl,
        access_token: encryptSecret(conn.accessToken),
        refresh_token: conn.refreshToken ? encryptSecret(conn.refreshToken) : null,
        issued_at: conn.issuedAt || null,
        id_url: conn.idUrl || null,
      },
      { onConflict: 'tenant_id' }
    );
  if (error) {
    throw new CRMError(`Supabase upsert failed: ${error.message}`, 'SUPABASE_UPSERT');
  }
}

async function loadTenant(tenantId: string): Promise<TenantConnection | null> {
  const client = getSupabase();
  const { data, error } = await client
    .from(supabaseTenantsTable)
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    throw new CRMError(`Supabase fetch failed: ${error.message}`, 'SUPABASE_FETCH');
  }
  if (!data) return null;
  return mapTenantRow(data as TenantRow);
}

async function listTenants(): Promise<TenantConnection[]> {
  const client = getSupabase();
  const { data, error } = await client.from(supabaseTenantsTable).select('*');
  if (error) {
    throw new CRMError(`Supabase fetch failed: ${error.message}`, 'SUPABASE_FETCH');
  }
  return (data as TenantRow[]).map(mapTenantRow);
}

type PkceStore = Record<string, { verifier: string; createdAt: string }>;

function readPkce(): PkceStore {
  ensureDataDir();
  return readJsonFile<PkceStore>(pkcePath, {});
}

function writePkce(data: PkceStore) {
  ensureDataDir();
  writeJsonFile(pkcePath, data);
}

function base64UrlEncode(input: Buffer) {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function handleError(reply: any, error: any) {
  if (error instanceof ValidationError) {
    return reply.status(400).send({ error: error.message, fields: error.fields });
  }
  if (error instanceof AuthenticationError) {
    return reply.status(401).send({ error: error.message });
  }
  if (error instanceof NotFoundError) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof CRMError) {
    return reply.status(502).send({ error: error.message, code: error.code });
  }
  return reply.status(500).send({ error: 'Internal Server Error' });
}

function isEnumValue<T extends Record<string, string>>(val: any, e: T): val is T[keyof T] {
  return Object.values(e).includes(val);
}

function getSalesforceClient() {
  return new SalesforceClient({
    loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
    username: process.env.SALESFORCE_USERNAME!,
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    privateKey: process.env.SALESFORCE_PRIVATE_KEY!,
    privateKeyPath: process.env.SALESFORCE_PRIVATE_KEY_PATH!,
  });
}

async function getTenantConnection(request: any): Promise<TenantConnection | null> {
  const tenantId =
    request.headers['x-tenant-id'] ||
    request.headers['x-tenant'] ||
    request.headers['x-firm-id'];

  if (!tenantId) return null;

  return loadTenant(String(tenantId));
}

function getSalesforceClientForTenant(conn: TenantConnection) {
  return SalesforceClient.fromOAuthAccessToken(conn.instanceUrl, conn.accessToken);
}

async function refreshTenantToken(tenantId: string): Promise<TenantConnection> {
  if (!oauthClientId || !oauthClientSecret) {
    throw new Error('OAuth client not configured for refresh');
  }

  const existing = await loadTenant(tenantId);
  if (!existing?.refreshToken) {
    throw new Error('No refresh token available for tenant');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: oauthClientId,
    client_secret: oauthClientSecret,
    refresh_token: existing.refreshToken,
  });

  const tokenUrl = `${existing.loginUrl}/services/oauth2/token`;
  const tokenResp = await axios.post(tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const updated: TenantConnection = {
    ...existing,
    accessToken: tokenResp.data.access_token,
    instanceUrl: tokenResp.data.instance_url || existing.instanceUrl,
    issuedAt: tokenResp.data.issued_at,
    idUrl: tokenResp.data.id || existing.idUrl,
  };

  await upsertTenant(updated);
  return updated;
}

async function withTenantClient<T>(
  request: any,
  action: (client: SalesforceClient) => Promise<T>
): Promise<T> {
  const tenantId =
    request.headers['x-tenant-id'] ||
    request.headers['x-tenant'] ||
    request.headers['x-firm-id'];

  console.log('[withTenantClient] Headers:', {
    'x-tenant-id': request.headers['x-tenant-id'],
    'x-tenant': request.headers['x-tenant'],
    'x-firm-id': request.headers['x-firm-id'],
    tenantId
  });

  if (!tenantId) {
    console.log('[withTenantClient] No tenant ID found, using default client');
    return action(getSalesforceClient());
  }

  console.log('[withTenantClient] Looking up tenant:', tenantId);
  let conn = await getTenantConnection(request);
  console.log('[withTenantClient] Tenant connection:', conn ? 'FOUND' : 'NOT FOUND');

  if (!conn) {
    throw new NotFoundError('Tenant', String(tenantId));
  }

  try {
    return await action(getSalesforceClientForTenant(conn));
  } catch (error: any) {
    if (error instanceof AuthenticationError && conn.refreshToken) {
      conn = await refreshTenantToken(String(tenantId));
      return action(getSalesforceClientForTenant(conn));
    }
    throw error;
  }
}

server.addHook('preHandler', async (request, reply) => {
  // Allow CORS preflight requests
  if (request.method === 'OPTIONS') return;

  if (request.url.startsWith('/health')) return;
  if (request.url.startsWith('/webhooks')) return;
  if (request.url.startsWith('/oauth')) return;

  const authHeader = request.headers.authorization;
  const bearer =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (bearer && uiJwtSecret) {
    try {
      jwt.verify(bearer, uiJwtSecret);
      return;
    } catch {
      return reply.status(401).send({ error: 'Invalid JWT' });
    }
  }

  if (!apiKey) {
    return reply.status(500).send({ error: 'API_KEY not configured on server' });
  }

  const headerKey = request.headers['x-api-key'] || bearer;

  if (!headerKey || headerKey !== apiKey) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

server.get('/health', async () => ({ ok: true }));

// OAuth: Start Salesforce connection for a tenant
server.get('/oauth/salesforce/start', async (request, reply) => {
  if (!oauthClientId || !oauthRedirectUri) {
    return reply.status(500).send({ error: 'OAuth env not configured' });
  }

  const query = request.query as { tenantId?: string; userId?: string; loginUrl?: string };
  if (!query.tenantId) {
    return reply.status(400).send({ error: 'tenantId is required' });
  }
  if (!query.userId) {
    return reply.status(400).send({ error: 'userId is required' });
  }

  const loginUrl = query.loginUrl || 'https://login.salesforce.com';
  const state = Buffer.from(
    JSON.stringify({ tenantId: query.tenantId, userId: query.userId, loginUrl })
  ).toString('base64url');

  // PKCE (required by some orgs)
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );
  const pkce = readPkce();
  pkce[state] = { verifier, createdAt: new Date().toISOString() };
  writePkce(pkce);

  const authUrl =
    `${loginUrl}/services/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(oauthClientId)}` +
    `&redirect_uri=${encodeURIComponent(oauthRedirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256`;

  return reply.redirect(authUrl);
});

// OAuth: Callback to exchange code for tokens
server.get('/oauth/salesforce/callback', async (request, reply) => {
  try {
    if (!oauthClientId || !oauthClientSecret || !oauthRedirectUri) {
      return reply.status(500).send({ error: 'OAuth env not configured' });
    }

    const query = request.query as { code?: string; state?: string };
    if (!query.code || !query.state) {
      return reply.status(400).send({ error: 'code and state are required' });
    }

    const state = JSON.parse(
      Buffer.from(query.state, 'base64url').toString('utf8')
    ) as { tenantId: string; userId: string; loginUrl: string };

    const pkce = readPkce();
    const verifier = pkce[query.state]?.verifier;
    if (!verifier) {
      return reply.status(400).send({ error: 'PKCE verifier missing for state' });
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: oauthClientId,
      client_secret: oauthClientSecret,
      redirect_uri: oauthRedirectUri,
      code: query.code,
      code_verifier: verifier,
    });

    const tokenUrl = `${state.loginUrl}/services/oauth2/token`;
    const tokenResp = await axios.post(tokenUrl, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await upsertTenant({
      tenantId: state.tenantId,
      userId: state.userId,
      loginUrl: state.loginUrl,
      instanceUrl: tokenResp.data.instance_url,
      accessToken: tokenResp.data.access_token,
      refreshToken: tokenResp.data.refresh_token,
      issuedAt: tokenResp.data.issued_at,
      idUrl: tokenResp.data.id,
    });

    delete pkce[query.state];
    writePkce(pkce);

    return reply.status(200).send({ ok: true, tenantId: state.tenantId });
  } catch (error: any) {
    return reply
      .status(400)
      .send({ error: 'OAuth exchange failed', details: error?.message });
  }
});

// List connected tenants (admin)
server.get('/oauth/salesforce/tenants', async (_request, reply) => {
  try {
    const tenants = await listTenants();
    return tenants.map((t) => ({
      tenantId: t.tenantId,
      loginUrl: t.loginUrl,
      instanceUrl: t.instanceUrl,
    }));
  } catch (error) {
    return handleError(reply, error);
  }
});

// Tenant connection info (admin)
server.get('/tenants/:id/info', async (request, reply) => {
  try {
    const params = request.params as { id: string };
    const tenant = await loadTenant(params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }

    return reply.status(200).send({
      tenantId: tenant.tenantId,
      loginUrl: tenant.loginUrl,
      instanceUrl: tenant.instanceUrl,
      issuedAt: tenant.issuedAt,
      idUrl: tenant.idUrl,
      hasRefreshToken: Boolean(tenant.refreshToken),
    });
  } catch (error) {
    return handleError(reply, error);
  }
});

server.post('/clients', async (request, reply) => {
  try {
    const body = request.body as {
      name: string;
      email: string;
      phone?: string;
      clientType?: ClientType;
      riskProfile?: RiskProfile;
      assetsUnderManagement?: number;
    };

    if (!body?.name || !body?.email) {
      return reply.status(400).send({
        error: 'name and email are required',
      });
    }
    if (!body.email.includes('@')) {
      return reply.status(400).send({ error: 'email must be valid' });
    }
    if (body.clientType && !isEnumValue(body.clientType, ClientType)) {
      return reply.status(400).send({ error: 'clientType is invalid' });
    }
    if (body.riskProfile && !isEnumValue(body.riskProfile, RiskProfile)) {
      return reply.status(400).send({ error: 'riskProfile is invalid' });
    }

    const existing = await withTenantClient(request, (sf) =>
      sf.findClientByEmail(body.email)
    );
    if (existing) {
      return reply.status(200).send({ ...existing, duplicate: true });
    }

    const created = await withTenantClient(request, (sf) =>
      sf.createClient({
        name: body.name,
        email: body.email,
        phone: body.phone,
        clientType: body.clientType || ClientType.Individual,
        riskProfile: body.riskProfile,
        assetsUnderManagement: body.assetsUnderManagement,
      })
    );

    return reply.status(201).send(created);
  } catch (error) {
    return handleError(reply, error);
  }
});

server.get('/clients', async (request, reply) => {
  try {
    const query = request.query as {
      clientType?: ClientType;
      minAUM?: string;
      maxAUM?: string;
      limit?: string;
      offset?: string;
      orderBy?: 'CreatedDate' | 'LastModifiedDate' | 'Name';
      orderDir?: 'ASC' | 'DESC';
    };

    if (query.clientType && !isEnumValue(query.clientType, ClientType)) {
      return reply.status(400).send({ error: 'clientType is invalid' });
    }

    const clients = await withTenantClient(request, (sf) =>
      sf.listClients({
        clientType: query.clientType,
        minAUM: query.minAUM ? Number(query.minAUM) : undefined,
        maxAUM: query.maxAUM ? Number(query.maxAUM) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
        orderBy: query.orderBy,
        orderDir: query.orderDir,
      })
    );

    return clients;
  } catch (error) {
    return handleError(reply, error);
  }
});

// Read clients from local DB cache
server.get('/db/clients', async (request, reply) => {
  try {
    const tenantId =
      (request.headers['x-tenant-id'] as string) ||
      (request.headers['x-tenant'] as string) ||
      (request.headers['x-firm-id'] as string) ||
      'default';
    const rows = await listClientsFromDb(tenantId);
    return rows;
  } catch (error) {
    return handleError(reply, error);
  }
});

server.post('/service-requests', async (request, reply) => {
  try {
    const body = request.body as Partial<CreateServiceRequestData> & {
      title: string;
      clientId: string;
    };

    if (!body?.title || !body?.clientId) {
      return reply.status(400).send({
        error: 'title and clientId are required',
      });
    }
    if (body.type && !isEnumValue(body.type, ServiceRequestType)) {
      return reply.status(400).send({ error: 'type is invalid' });
    }
    if (body.priority && !isEnumValue(body.priority, ServiceRequestPriority)) {
      return reply.status(400).send({ error: 'priority is invalid' });
    }

    const created = await withTenantClient(request, (sf) =>
      sf.createServiceRequest({
        title: body.title,
        description: body.description || '',
        clientId: body.clientId,
        type: body.type || ServiceRequestType.GeneralInquiry,
        priority: body.priority || ServiceRequestPriority.Medium,
        assignedTo: body.assignedTo,
      })
    );

    return reply.status(201).send(created);
  } catch (error) {
    return handleError(reply, error);
  }
});

server.get('/service-requests', async (request, reply) => {
  try {
    const query = request.query as {
      clientId?: string;
      status?: ServiceRequestStatus;
      limit?: string;
      offset?: string;
      orderBy?: 'CreatedDate' | 'LastModifiedDate';
      orderDir?: 'ASC' | 'DESC';
    };

    if (query.status && !isEnumValue(query.status, ServiceRequestStatus)) {
      return reply.status(400).send({ error: 'status is invalid' });
    }

    const requests = await withTenantClient(request, (sf) =>
      sf.listServiceRequests({
        clientId: query.clientId,
        status: query.status,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
        orderBy: query.orderBy,
        orderDir: query.orderDir,
      })
    );
    return requests;
  } catch (error) {
    return handleError(reply, error);
  }
});

// Read service requests from local DB cache
server.get('/db/service-requests', async (request, reply) => {
  try {
    const tenantId =
      (request.headers['x-tenant-id'] as string) ||
      (request.headers['x-tenant'] as string) ||
      (request.headers['x-firm-id'] as string) ||
      'default';
    const rows = await listServiceRequestsFromDb(tenantId);
    return rows;
  } catch (error) {
    return handleError(reply, error);
  }
});

server.post('/webhooks/salesforce', async (request, reply) => {
  const provided = request.headers['x-webhook-secret'];
  if (!webhookSecret || !provided || provided !== webhookSecret) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  ensureDataDir();

  const payload = request.body;
  const event = {
    receivedAt: new Date().toISOString(),
    payload,
  };

  const events = readJsonFile<any[]>(eventsPath, []);
  events.push(event);
  writeJsonFile(eventsPath, events);

  // Best-effort CDC mapping for Account/Case
  const syncState = readJsonFile<Record<string, any>>(syncPath, {
    accounts: {},
    cases: {},
  });

  const changePayload = (payload as any)?.data?.payload;
  const header = changePayload?.ChangeEventHeader;
  if (header?.entityName && header?.recordIds?.length) {
    const recordId = header.recordIds[0];
    const tenantId =
      (request.headers['x-tenant-id'] as string) ||
      (request.headers['x-tenant'] as string) ||
      (request.headers['x-firm-id'] as string) ||
      'default';
    if (header.entityName === 'Account') {
      syncState.accounts[recordId] = {
        id: recordId,
        name: changePayload.Name,
        phone: changePayload.Phone,
        email: changePayload.PersonEmail || changePayload.Email,
        lastChanged: event.receivedAt,
      };
      await upsertClientRow({
        tenant_id: tenantId,
        sf_id: recordId,
        name: changePayload.Name,
        phone: changePayload.Phone,
        email: changePayload.PersonEmail || changePayload.Email,
        last_changed: event.receivedAt,
      });
    }
    if (header.entityName === 'Case') {
      syncState.cases[recordId] = {
        id: recordId,
        subject: changePayload.Subject,
        status: changePayload.Status,
        priority: changePayload.Priority,
        accountId: changePayload.AccountId,
        lastChanged: event.receivedAt,
      };
      await upsertServiceRequestRow({
        tenant_id: tenantId,
        sf_id: recordId,
        subject: changePayload.Subject,
        status: changePayload.Status,
        priority: changePayload.Priority,
        account_id: changePayload.AccountId,
        last_changed: event.receivedAt,
      });
    }
    writeJsonFile(syncPath, syncState);
  }

  return reply.status(200).send({ ok: true });
});

server.patch('/service-requests/:id', async (request, reply) => {
  try {
    const params = request.params as { id: string };
    const body = request.body as {
      status?: ServiceRequestStatus;
    };

    if (!body?.status) {
      return reply.status(400).send({ error: 'status is required' });
    }
    if (!isEnumValue(body.status, ServiceRequestStatus)) {
      return reply.status(400).send({ error: 'status is invalid' });
    }

    const updated = await withTenantClient(request, (sf) =>
      sf.updateServiceRequestStatus(params.id, body.status as ServiceRequestStatus)
    );
    return reply.status(200).send(updated);
  } catch (error) {
    return handleError(reply, error);
  }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

async function start() {
  try {
    await server.ready();
    await server.listen({ port, host });
    server.log.info(`API listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
