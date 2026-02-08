import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function testAuth() {
  console.log('🔍 Testing Salesforce Authentication (OAuth JWT Bearer)\n');

  const config = {
    loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
    username: process.env.SALESFORCE_USERNAME!,
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    privateKey: process.env.SALESFORCE_PRIVATE_KEY!,
    privateKeyPath: process.env.SALESFORCE_PRIVATE_KEY_PATH!,
  };

  console.log('Configuration (masked):');
  console.log('─────────────────────────────────────');
  console.log(`Login URL:      ${config.loginUrl}`);
  console.log(`Username:       ${config.username}`);
  console.log('Password:       (not used for JWT)');
  console.log('Security Token: (not used for JWT)');
  console.log('─────────────────────────────────────\n');
  console.log('ℹ️  Using OAuth JWT Bearer flow (requires Connected App + RSA key)\n');

  try {
    if (!config.clientId) {
      throw new Error(
        'Missing SALESFORCE_CLIENT_ID in .env'
      );
    }

    if (!config.privateKey && !config.privateKeyPath) {
      throw new Error(
        'Missing SALESFORCE_PRIVATE_KEY or SALESFORCE_PRIVATE_KEY_PATH in .env'
      );
    }

    console.log('Attempting OAuth JWT authentication...\n');

    const jwt = await import('jsonwebtoken');
    const fs = await import('fs');
    const privateKey =
      config.privateKey ||
      (config.privateKeyPath ? fs.readFileSync(config.privateKeyPath, 'utf8') : undefined);

    if (!privateKey) {
      throw new Error('Unable to load private key');
    }

    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      {
        iss: config.clientId,
        sub: config.username,
        aud: config.loginUrl,
        exp: now + 3 * 60,
      },
      privateKey,
      { algorithm: 'RS256' }
    );

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });

    const response = await axios.post(
      `${config.loginUrl}/services/oauth2/token`,
      body.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = response.data?.access_token;
    const instanceUrl = response.data?.instance_url;
    const idUrl = response.data?.id;

    if (!accessToken || !instanceUrl) {
      throw new Error('Invalid OAuth response - missing access_token or instance_url');
    }

    console.log('✅ Authentication successful!\n');
    console.log('Response:');
    console.log('─────────────────────────────────────');
    console.log(`Access Token:  ${accessToken.substring(0, 30)}...`);
    console.log(`Instance URL:  ${instanceUrl}`);
    if (idUrl) console.log(`Identity URL:  ${idUrl}`);
    console.log('─────────────────────────────────────\n');
    console.log('🎉 You can now use the sandbox scripts!\n');
  } catch (error: any) {
    console.error('❌ Authentication failed!\n');

    if (error.response?.data && typeof error.response.data === 'object') {
      const oauthError = error.response.data;
      console.log('OAuth Error:');
      console.log('─────────────────────────────────────');
      if (oauthError.error) console.log(oauthError.error);
      if (oauthError.error_description) console.log(oauthError.error_description);
      console.log('─────────────────────────────────────\n');
    } else {
      console.error('Error:', error.message);
    }

    process.exit(1);
  }
}

testAuth();
