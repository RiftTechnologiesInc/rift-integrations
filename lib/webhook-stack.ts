import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';

export class WebhookStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const webhookFn = new NodejsFunction(this, 'SalesforceWebhookFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'src', 'lambda', 'webhook.ts'),
      handler: 'handler',
      bundling: {
        externalModules: [],
      },
      environment: {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        SUPABASE_CLIENTS_TABLE:
          process.env.SUPABASE_CLIENTS_TABLE || 'salesforce_clients',
        SUPABASE_SERVICE_REQUESTS_TABLE:
          process.env.SUPABASE_SERVICE_REQUESTS_TABLE ||
          'salesforce_service_requests',
        SUPABASE_TENANTS_TABLE:
          process.env.SUPABASE_TENANTS_TABLE || 'salesforce_tenants',
        TENANT_TOKEN_ENCRYPTION_KEY:
          process.env.TENANT_TOKEN_ENCRYPTION_KEY || '',
        SALESFORCE_CLIENT_ID: process.env.SALESFORCE_CLIENT_ID || '',
        SALESFORCE_CLIENT_SECRET: process.env.SALESFORCE_CLIENT_SECRET || '',
        SALESFORCE_WEBHOOK_SECRET: process.env.SALESFORCE_WEBHOOK_SECRET || '',
      },
    });

    const api = new apigw.RestApi(this, 'SalesforceWebhookApi', {
      restApiName: 'Rift Salesforce Webhook',
    });

    const webhook = api.root.addResource('webhooks').addResource('salesforce');
    webhook.addMethod('POST', new apigw.LambdaIntegration(webhookFn));

    new cdk.CfnOutput(this, 'WebhookUrl', {
      value: `${api.url}webhooks/salesforce`,
    });
  }
}
