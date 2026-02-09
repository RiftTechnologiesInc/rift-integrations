import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import axios from 'axios';

const supabaseUrlRaw = process.env.SUPABASE_URL || '';
const supabaseUrl = supabaseUrlRaw.trim().replace(/^"+|"+$/g, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const clientsTable = process.env.SUPABASE_CLIENTS_TABLE || 'salesforce_clients';
const serviceRequestsTable =
  process.env.SUPABASE_SERVICE_REQUESTS_TABLE || 'salesforce_service_requests';
const tenantsTable = process.env.SUPABASE_TENANTS_TABLE || 'salesforce_tenants';
const webhookSecret = process.env.SALESFORCE_WEBHOOK_SECRET || '';
const encryptionKeyB64 = process.env.TENANT_TOKEN_ENCRYPTION_KEY || '';
const sfClientId = process.env.SALESFORCE_CLIENT_ID || '';
const sfClientSecret = process.env.SALESFORCE_CLIENT_SECRET || '';


const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export async function handler(event: any) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return { statusCode: 500, body: 'Supabase env not configured' };
    }
    if (!webhookSecret) {
      return { statusCode: 500, body: 'Webhook secret not configured' };
    }
    if (!encryptionKeyB64 || !sfClientId || !sfClientSecret) {
      return { statusCode: 500, body: 'Salesforce auth env not configured' };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const provided = event.headers?.['x-webhook-secret'];
    if (!provided || provided !== webhookSecret) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    let body: any = event.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return { statusCode: 400, body: 'Invalid JSON' };
      }
    }

    const payload = body?.data?.payload || body?.payload;
    const header = payload?.ChangeEventHeader;
    if (!header?.entityName || !header?.recordIds?.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const tenantId =
      event.headers?.['x-tenant-id'] ||
      event.headers?.['x-tenant'] ||
      event.headers?.['x-firm-id'] ||
      'default';

    const recordId = header.recordIds[0];

    const tenant = await getTenant(tenantId);
    const accessToken = await getAccessToken(tenant);

    if (header.entityName === 'Account') {
      const account = await fetchAccount(tenant.instance_url, accessToken, recordId);
      const { error } = await supabase.from(clientsTable).upsert(
        {
          tenant_id: tenantId,
          sf_id: recordId,
          name: account.Name || null,
          phone: account.Phone || null,
          email: account.PersonEmail || account.Email || null,
          last_changed: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,sf_id' }
      );
      if (error) throw error;
    }

    if (header.entityName === 'Case') {
      const sfCase = await fetchCase(tenant.instance_url, accessToken, recordId);
      const { error } = await supabase.from(serviceRequestsTable).upsert(
        {
          tenant_id: tenantId,
          sf_id: recordId,
          subject: sfCase.Subject || null,
          status: sfCase.Status || null,
          priority: sfCase.Priority || null,
          account_id: sfCase.AccountId || null,
          last_changed: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,sf_id' }
      );
      if (error) throw error;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err: any) {
    // Surface details in logs for debugging
    console.error('Webhook error:', err?.message || err);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}

async function getTenant(tenantId: string) {
  const { data, error } = await supabase
    .from(tenantsTable)
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) {
    throw new Error('Tenant not found');
  }
  return data as {
    tenant_id: string;
    login_url: string;
    instance_url: string;
    access_token: string;
    refresh_token?: string | null;
  };
}

function decryptSecret(payload: string): string {
  const key = Buffer.from(encryptionKeyB64, 'base64');
  if (key.length !== 32) throw new Error('Invalid encryption key');
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Encrypted token format invalid');
  const [ivB64, dataB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
}

async function refreshAccessToken(loginUrl: string, refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: sfClientId,
    client_secret: sfClientSecret,
    refresh_token: refreshToken,
  });
  const tokenResp = await axios.post(`${loginUrl}/services/oauth2/token`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return tokenResp.data.access_token as string;
}

async function getAccessToken(tenant: {
  login_url: string;
  access_token: string;
  refresh_token?: string | null;
}) {
  try {
    return decryptSecret(tenant.access_token);
  } catch {
    if (!tenant.refresh_token) throw new Error('Refresh token missing');
    const refreshToken = decryptSecret(tenant.refresh_token);
    return refreshAccessToken(tenant.login_url, refreshToken);
  }
}

async function fetchAccount(instanceUrl: string, token: string, id: string) {
  const resp = await axios.get(`${instanceUrl}/services/data/v59.0/sobjects/Account/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.data as {
    Name?: string;
    Phone?: string;
    PersonEmail?: string;
    Email?: string;
  };
}

async function fetchCase(instanceUrl: string, token: string, id: string) {
  const resp = await axios.get(`${instanceUrl}/services/data/v59.0/sobjects/Case/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.data as {
    Subject?: string;
    Status?: string;
    Priority?: string;
    AccountId?: string;
  };
}
