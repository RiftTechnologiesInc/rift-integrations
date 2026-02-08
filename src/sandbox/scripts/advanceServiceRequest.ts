import * as dotenv from 'dotenv';
import { SalesforceClient } from '../../adapters/salesforce/SalesforceClient';
import { ServiceRequestStatus } from '../../core/models/ServiceRequest';

dotenv.config();

async function main() {
  console.log('🚀 Rift Integrations - Advance Service Request Sandbox\n');

  // Initialize Salesforce client (OAuth Username-Password flow)
  const sfClient = new SalesforceClient({
    loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
    username: process.env.SALESFORCE_USERNAME!,
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    privateKey: process.env.SALESFORCE_PRIVATE_KEY!,
    privateKeyPath: process.env.SALESFORCE_PRIVATE_KEY_PATH!,
  });

  try {
    // For this demo, we'll need a service request ID
    // In a real scenario, you would pass this as a command-line argument
    console.log('💡 Instructions: Update SERVICE_REQUEST_ID in this script\n');

    const serviceRequestId = process.env.SERVICE_REQUEST_ID;

    if (!serviceRequestId) {
      console.log('Please set SERVICE_REQUEST_ID environment variable or update this script.');
      console.log('\nExample workflow:\n');
      console.log('1. Run createClient.ts to create a client');
      console.log('2. Run createServiceRequest.ts to create a service request');
      console.log('3. Copy the service request ID from the output');
      console.log('4. Set SERVICE_REQUEST_ID=<id> in .env or update this script');
      console.log('5. Run this script to advance the status\n');
      process.exit(0);
    }

    // Fetch current state
    console.log('Fetching service request...\n');
    let serviceRequest = await sfClient.getServiceRequest(serviceRequestId);

    console.log('Current Service Request:');
    console.log('─────────────────────────────────────');
    console.log(`ID:       ${serviceRequest.id}`);
    console.log(`Title:    ${serviceRequest.title}`);
    console.log(`Status:   ${serviceRequest.status}`);
    console.log(`Priority: ${serviceRequest.priority}`);
    console.log('─────────────────────────────────────\n');

    // Advance through workflow stages
    const statusProgression = [
      ServiceRequestStatus.InProgress,
      ServiceRequestStatus.PendingClient,
      ServiceRequestStatus.PendingApproval,
      ServiceRequestStatus.Completed,
    ];

    const currentIndex = statusProgression.indexOf(serviceRequest.status);
    const nextStatus =
      currentIndex < statusProgression.length - 1
        ? statusProgression[currentIndex + 1]
        : ServiceRequestStatus.Completed;

    if (serviceRequest.status === ServiceRequestStatus.Completed) {
      console.log('✅ Service request is already completed!\n');
      return;
    }

    console.log(`Updating status from ${serviceRequest.status} to ${nextStatus}...\n`);

    serviceRequest = await sfClient.updateServiceRequestStatus(
      serviceRequestId,
      nextStatus
    );

    console.log('✅ Status updated successfully!\n');
    console.log('Updated Service Request:');
    console.log('─────────────────────────────────────');
    console.log(`ID:       ${serviceRequest.id}`);
    console.log(`Title:    ${serviceRequest.title}`);
    console.log(`Status:   ${serviceRequest.status}`);
    console.log(`Priority: ${serviceRequest.priority}`);
    console.log(`Updated:  ${serviceRequest.updatedAt.toISOString()}`);
    console.log('─────────────────────────────────────\n');

    if (serviceRequest.status !== ServiceRequestStatus.Completed) {
      console.log('💡 Run this script again to advance to the next stage\n');
    } else {
      console.log('🎉 Service request workflow completed!\n');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

main();
