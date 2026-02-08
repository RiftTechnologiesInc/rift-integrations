import * as dotenv from 'dotenv';
import { SalesforceClient } from '../../adapters/salesforce/SalesforceClient';
import {
  ServiceRequestType,
  ServiceRequestPriority,
} from '../../core/models/ServiceRequest';

dotenv.config();

async function main() {
  console.log('🚀 Rift Integrations - Create Service Request Sandbox\n');

  // Initialize Salesforce client (OAuth Username-Password flow)
  const sfClient = new SalesforceClient({
    loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
    username: process.env.SALESFORCE_USERNAME!,
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    privateKey: process.env.SALESFORCE_PRIVATE_KEY!,
    privateKeyPath: process.env.SALESFORCE_PRIVATE_KEY_PATH!,
  });

  try {
    // First, get a client to attach the service request to
    console.log('Fetching clients...\n');
    const clients = await sfClient.listClients();

    if (clients.length === 0) {
      console.error('❌ No clients found. Please run createClient.ts first.');
      process.exit(1);
    }

    const client = clients[0];
    console.log(`Using client: ${client.name} (${client.id})\n`);

    // Create a service request
    console.log('Creating service request...\n');

    const serviceRequest = await sfClient.createServiceRequest({
      title: 'Quarterly Portfolio Rebalancing',
      description:
        'Client requested portfolio rebalancing to align with target asset allocation. Current equity exposure is 5% above target due to recent market gains.',
      type: ServiceRequestType.AccountRebalancing,
      priority: ServiceRequestPriority.Medium,
      clientId: client.id,
    });

    console.log('✅ Service Request created successfully!\n');
    console.log('Service Request Details:');
    console.log('─────────────────────────────────────');
    console.log(`ID:           ${serviceRequest.id}`);
    console.log(`Title:        ${serviceRequest.title}`);
    console.log(`Type:         ${serviceRequest.type}`);
    console.log(`Status:       ${serviceRequest.status}`);
    console.log(`Priority:     ${serviceRequest.priority}`);
    console.log(`Client ID:    ${serviceRequest.clientId}`);
    console.log(`Assigned To:  ${serviceRequest.assignedTo || 'Unassigned'}`);
    console.log(`Created:      ${serviceRequest.createdAt.toISOString()}`);
    console.log('─────────────────────────────────────');
    console.log(`\nDescription:\n${serviceRequest.description}\n`);

    console.log('💡 Next step: Run advanceServiceRequest.ts to update the status\n');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

main();
