/**
 * Salesforce-specific types and API response structures
 */

export interface SalesforceAuthResponse {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

export interface SalesforceConfig {
  loginUrl: string;
  username: string;
  password?: string;
  securityToken?: string;
  clientId?: string; // Optional - only needed for OAuth flows
  clientSecret?: string; // Optional - only needed for OAuth flows
  privateKey?: string; // Optional - for JWT bearer flow
  privateKeyPath?: string; // Optional - path to PEM for JWT bearer flow
}

export interface SalesforceQueryResponse<T> {
  totalSize: number;
  done: boolean;
  records: T[];
}

export interface SalesforceErrorResponse {
  message: string;
  errorCode: string;
  fields?: string[];
}

/**
 * Salesforce Account object (maps to Rift Client)
 * TODO: Add custom fields for AUM, RiskProfile, etc.
 */
export interface SalesforceAccount {
  Id: string;
  Name: string;
  Type?: string; // Individual, Joint, Trust, Corporate
  Phone?: string;
  PersonEmail?: string; // For Person Accounts
  Email?: string; // For Business Accounts
  AUM__c?: number; // Custom field: Assets Under Management
  Risk_Profile__c?: string; // Custom field: Risk Profile
  Contacts?: {
    records: SalesforceContact[];
  };
  CreatedDate: string;
  LastModifiedDate: string;
}

export interface SalesforceContact {
  Id?: string;
  Email?: string;
  Phone?: string;
}

/**
 * Salesforce Case object (maps to Rift ServiceRequest)
 * TODO: Add custom fields for ServiceRequestType, Priority, etc.
 */
export interface SalesforceCase {
  Id: string;
  CaseNumber: string;
  Subject: string;
  Description: string;
  Status: string;
  Priority: string;
  AccountId?: string;
  ContactId?: string;
  OwnerId?: string;
  Type?: string; // Custom field for ServiceRequestType
  Service_Request_Type__c?: string; // Custom picklist
  CreatedDate: string;
  LastModifiedDate: string;
}

/**
 * Salesforce custom object for Workflow Steps
 * TODO: Create this custom object in Salesforce
 */
export interface SalesforceWorkflowStep {
  Id: string;
  Name: string;
  Case__c: string; // Lookup to Case
  Step_Name__c: string;
  Step_Order__c: number;
  Status__c: string;
  Assigned_To__c?: string;
  Due_Date__c?: string;
  Completed_At__c?: string;
  Notes__c?: string;
  CreatedDate: string;
  LastModifiedDate: string;
}

/**
 * Generic Salesforce record creation response
 */
export interface SalesforceCreateResponse {
  id: string;
  success: boolean;
  errors: SalesforceErrorResponse[];
}

/**
 * Generic Salesforce record update response
 */
export interface SalesforceUpdateResponse {
  success: boolean;
  errors: SalesforceErrorResponse[];
}
