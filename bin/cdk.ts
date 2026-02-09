import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { WebhookStack } from '../lib/webhook-stack';

dotenv.config({ override: true });

const app = new cdk.App();

new WebhookStack(app, 'RiftWebhookStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
