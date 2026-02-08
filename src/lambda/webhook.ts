import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const clientsTable = process.env.SUPABASE_CLIENTS_TABLE || 'salesforce_clients';
const serviceRequestsTable =
  process.env.SUPABASE_SERVICE_REQUESTS_TABLE || 'salesforce_service_requests';
const webhookSecret = process.env.SALESFORCE_WEBHOOK_SECRET || '';

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

    const payload = body?.data?.payload;
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

    if (header.entityName === 'Account') {
      const { error } = await supabase.from(clientsTable).upsert(
        {
          tenant_id: tenantId,
          sf_id: recordId,
          name: payload.Name,
          phone: payload.Phone,
          email: payload.PersonEmail || payload.Email,
          last_changed: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,sf_id' }
      );
      if (error) throw error;
    }

    if (header.entityName === 'Case') {
      const { error } = await supabase.from(serviceRequestsTable).upsert(
        {
          tenant_id: tenantId,
          sf_id: recordId,
          subject: payload.Subject,
          status: payload.Status,
          priority: payload.Priority,
          account_id: payload.AccountId,
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
