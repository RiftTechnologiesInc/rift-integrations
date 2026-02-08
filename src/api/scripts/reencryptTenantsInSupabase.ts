import * as dotenv from 'dotenv';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const table = process.env.SUPABASE_TENANTS_TABLE || 'salesforce_tenants';
const encryptionKeyB64 = process.env.TENANT_TOKEN_ENCRYPTION_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!encryptionKeyB64) {
  console.error('Missing TENANT_TOKEN_ENCRYPTION_KEY');
  process.exit(1);
}

const key = Buffer.from(encryptionKeyB64, 'base64');
if (key.length !== 32) {
  console.error('TENANT_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

function looksEncrypted(value?: string | null): boolean {
  if (!value) return false;
  return value.split('.').length === 3;
}

function encryptSecret(plain: string): string {
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

(async () => {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    console.error('Supabase fetch failed:', error.message);
    process.exit(1);
  }

  const rows = data as Array<{
    tenant_id: string;
    access_token: string;
    refresh_token?: string | null;
  }>;

  let updated = 0;
  for (const row of rows) {
    const accessEncrypted = looksEncrypted(row.access_token);
    const refreshEncrypted = looksEncrypted(row.refresh_token || undefined);

    if (accessEncrypted && refreshEncrypted) continue;

    const payload = {
      tenant_id: row.tenant_id,
      access_token: accessEncrypted ? row.access_token : encryptSecret(row.access_token),
      refresh_token:
        row.refresh_token == null
          ? null
          : refreshEncrypted
          ? row.refresh_token
          : encryptSecret(row.refresh_token),
    };

    const { error: upsertErr } = await supabase
      .from(table)
      .upsert(payload, { onConflict: 'tenant_id' });
    if (upsertErr) {
      console.error('Supabase upsert failed:', upsertErr.message);
      process.exit(1);
    }
    updated += 1;
  }

  console.log(`Re-encrypted ${updated} tenant rows`);
})();
