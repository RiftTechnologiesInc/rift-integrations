import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

const tenantsPath = path.resolve(process.cwd(), 'data', 'tenants.json');
if (!fs.existsSync(tenantsPath)) {
  console.error('data/tenants.json not found');
  process.exit(1);
}

const raw = fs.readFileSync(tenantsPath, 'utf8');
const tenants = JSON.parse(raw) as Record<
  string,
  {
    tenantId: string;
    loginUrl: string;
    instanceUrl: string;
    accessToken: string;
    refreshToken?: string;
    issuedAt?: string;
    idUrl?: string;
  }
>;

const rows = Object.values(tenants).map((t) => ({
  tenant_id: t.tenantId,
  login_url: t.loginUrl,
  instance_url: t.instanceUrl,
  access_token: encryptSecret(t.accessToken),
  refresh_token: t.refreshToken ? encryptSecret(t.refreshToken) : null,
  issued_at: t.issuedAt || null,
  id_url: t.idUrl || null,
}));

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

(async () => {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'tenant_id' });
  if (error) {
    console.error('Supabase upsert failed:', error.message);
    process.exit(1);
  }
  console.log(`Migrated ${rows.length} tenants to ${table}`);
})();

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
