import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function testAuth() {
  console.log('🔍 Testing Salesforce Authentication (SOAP API)\n');

  const config = {
    loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
    username: process.env.SALESFORCE_USERNAME!,
    password: process.env.SALESFORCE_PASSWORD!,
    securityToken: process.env.SALESFORCE_SECURITY_TOKEN!,
  };

  console.log('Configuration (masked):');
  console.log('─────────────────────────────────────');
  console.log(`Login URL:      ${config.loginUrl}`);
  console.log(`Username:       ${config.username}`);
  console.log(`Password:       ${'*'.repeat(config.password.length)} (length: ${config.password.length})`);
  console.log(`Security Token: ${'*'.repeat(config.securityToken.length)} (length: ${config.securityToken.length})`);
  console.log('─────────────────────────────────────\n');
  console.log('ℹ️  Using SOAP API login (proper for Developer Edition)\n');

  try {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <urn:login>
      <urn:username>${config.username}</urn:username>
      <urn:password>${config.password}${config.securityToken}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>`;

    console.log('Attempting SOAP authentication...\n');

    const response = await axios.post(
      // Use Partner API endpoint for login; Enterprise endpoint doesn't expose login.
      `${config.loginUrl}/services/Soap/u/59.0`,
      soapBody,
      {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          'SOAPAction': 'login',
        },
      }
    );

    // Parse SOAP response
    const sessionIdMatch = response.data.match(/<sessionId>(.+?)<\/sessionId>/);
    const serverUrlMatch = response.data.match(/<serverUrl>(.+?)<\/serverUrl>/);

    if (!sessionIdMatch || !serverUrlMatch) {
      throw new Error('Invalid SOAP response - missing session ID or server URL');
    }

    const sessionId = sessionIdMatch[1];
    const serverUrl = serverUrlMatch[1];
    const instanceUrlMatch = serverUrl.match(/(https:\/\/[^\/]+)/);
    const instanceUrl = instanceUrlMatch ? instanceUrlMatch[1] : 'Unknown';

    console.log('✅ Authentication successful!\n');
    console.log('Response:');
    console.log('─────────────────────────────────────');
    console.log(`Session ID:    ${sessionId.substring(0, 30)}...`);
    console.log(`Instance URL:  ${instanceUrl}`);
    console.log(`Server URL:    ${serverUrl}`);
    console.log('─────────────────────────────────────\n');
    console.log('🎉 You can now use the sandbox scripts!\n');
  } catch (error: any) {
    console.error('❌ Authentication failed!\n');

    if (error.response?.data && typeof error.response.data === 'string') {
      const faultMatch = error.response.data.match(/<faultstring>(.+?)<\/faultstring>/);
      if (faultMatch) {
        console.log('SOAP Error:');
        console.log('─────────────────────────────────────');
        console.log(faultMatch[1]);
        console.log('─────────────────────────────────────\n');

        if (faultMatch[1].includes('INVALID_LOGIN')) {
          console.log('💡 Fix: Invalid username, password, or security token');
          console.log('   1. Verify username: ${config.username}');
          console.log('   2. Verify password is correct');
          console.log('   3. Get fresh security token: Setup → Reset My Security Token');
          console.log('   4. Check email and update .env with new token\n');
        }
      } else {
        console.log('Raw Response:');
        console.log('─────────────────────────────────────');
        console.log(error.response.data);
        console.log('─────────────────────────────────────\n');
      }
    } else {
      console.error('Error:', error.message);
    }

    process.exit(1);
  }
}

testAuth();
