import * as dotenv from 'dotenv';
import crypto from 'crypto';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import jsforce from 'jsforce';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantsTable = process.env.SUPABASE_TENANTS_TABLE || 'salesforce_tenants';
const encryptionKeyB64 = process.env.TENANT_TOKEN_ENCRYPTION_KEY;

const tenantId = process.env.CDC_TENANT_ID;
const webhookUrl = process.env.CDC_WEBHOOK_URL;
const webhookSecret = process.env.SALESFORCE_WEBHOOK_SECRET;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required');
}
if (!encryptionKeyB64) {
  throw new Error('TENANT_TOKEN_ENCRYPTION_KEY is required');
}
if (!tenantId) {
  throw new Error('CDC_TENANT_ID is required');
}
if (!webhookUrl) {
  throw new Error('CDC_WEBHOOK_URL is required');
}
if (!webhookSecret) {
  throw new Error('SALESFORCE_WEBHOOK_SECRET is required');
}

const key = Buffer.from(encryptionKeyB64, 'base64');
if (key.length !== 32) {
  throw new Error('TENANT_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Encrypted token format invalid');
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

async function getTenant() {
  const { data, error } = await supabase
    .from(tenantsTable)
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  if (!data) throw new Error(`Tenant not found: ${tenantId}`);
  return data as {
    login_url: string;
    instance_url: string;
    access_token: string;
    refresh_token?: string | null;
  };
}

async function refreshAccessToken(loginUrl: string, refreshToken: string) {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SALESFORCE_CLIENT_ID/SALESFORCE_CLIENT_SECRET are required');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const tokenResp = await axios.post(`${loginUrl}/services/oauth2/token`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return {
    accessToken: tokenResp.data.access_token as string,
    instanceUrl: (tokenResp.data.instance_url as string) || undefined,
  };
}

async function postToWebhook(payload: any) {
  await axios.post(webhookUrl!, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': webhookSecret!,
      'x-tenant-id': tenantId!,
    },
  });
}

async function main() {
  const tenant = await getTenant();
  const refreshToken = tenant.refresh_token
    ? decryptSecret(tenant.refresh_token)
    : null;
  if (!refreshToken) {
    throw new Error('Tenant refresh_token missing');
  }

  const token = await refreshAccessToken(tenant.login_url, refreshToken);
  const accessToken = token.accessToken;
  const instanceUrl = token.instanceUrl || tenant.instance_url;

  const conn = new jsforce.Connection({ accessToken, instanceUrl });

  conn.streaming.topic('/data/AccountChangeEvent').subscribe(async (message: any) => {
    await postToWebhook(message);
  });

  conn.streaming.topic('/data/CaseChangeEvent').subscribe(async (message: any) => {
    await postToWebhook(message);
  });

  // Keep process alive
  // eslint-disable-next-line no-console
  console.log(`CDC listener running for tenant ${tenantId}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
