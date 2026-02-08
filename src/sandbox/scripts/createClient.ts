import * as dotenv from 'dotenv';
import { SalesforceClient } from '../../adapters/salesforce/SalesforceClient';
import { ClientType, RiskProfile } from '../../core/models/Client';

dotenv.config();

async function main() {
  console.log('🚀 Rift Integrations - Create Client Sandbox\n');

  // Initialize Salesforce client (OAuth Username-Password flow)
  const sfClient = new SalesforceClient({
    loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
    username: process.env.SALESFORCE_USERNAME!,
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    privateKey: process.env.SALESFORCE_PRIVATE_KEY!,
    privateKeyPath: process.env.SALESFORCE_PRIVATE_KEY_PATH!,
  });

  try {
    console.log('Creating new client...\n');

    const newClient = await sfClient.createClient({
      name: 'John and Jane Doe',
      email: 'john.doe@example.com',
      phone: '+1-555-0123',
      clientType: ClientType.Joint,
      riskProfile: RiskProfile.Moderate,
      assetsUnderManagement: 1250000,
    });

    console.log('✅ Client created successfully!\n');
    console.log('Client Details:');
    console.log('─────────────────────────────────────');
    console.log(`ID:            ${newClient.id}`);
    console.log(`Name:          ${newClient.name}`);
    console.log(`Email:         ${newClient.email}`);
    console.log(`Phone:         ${newClient.phone || 'N/A'}`);
    console.log(`Type:          ${newClient.clientType}`);
    console.log(`Risk Profile:  ${newClient.riskProfile || 'N/A'}`);
    console.log(`AUM:           $${newClient.assetsUnderManagement?.toLocaleString() || 'N/A'}`);
    console.log(`Created:       ${newClient.createdAt.toISOString()}`);
    console.log('─────────────────────────────────────\n');

    // Demonstrate listing clients
    console.log('Fetching all clients...\n');
    const allClients = await sfClient.listClients();
    console.log(`Total clients found: ${allClients.length}\n`);

    allClients.forEach((client, index) => {
      console.log(`${index + 1}. ${client.name} (${client.clientType})`);
      console.log(`   Email: ${client.email}`);
      console.log(`   AUM: $${client.assetsUnderManagement?.toLocaleString() || 'N/A'}\n`);
    });
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

main();
