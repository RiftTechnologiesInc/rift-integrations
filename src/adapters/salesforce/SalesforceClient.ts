import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import {
  SalesforceConfig,
  SalesforceAccount,
  SalesforceCase,
  SalesforceQueryResponse,
  SalesforceCreateResponse,
  SalesforceErrorResponse,
} from './salesforceTypes';
import { CRMClient } from '../../core/ports/CRMClient';
import {
  Client,
  CreateClientData,
  UpdateClientData,
  ClientFilters,
  ClientType,
  RiskProfile,
} from '../../core/models/Client';
import {
  ServiceRequest,
  CreateServiceRequestData,
  ServiceRequestStatus,
  ServiceRequestType,
  ServiceRequestPriority,
} from '../../core/models/ServiceRequest';
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
  CRMError,
} from '../../core/errors';

export class SalesforceClient implements CRMClient {
  private accessToken?: string;
  private instanceUrl?: string;
  private apiVersion = 'v59.0';
  private accountFieldSet?: Set<string>;
  private caseFieldSet?: Set<string>;

  constructor(private config: SalesforceConfig) {}

  /**
   * Authenticate with Salesforce using OAuth JWT Bearer flow.
   * Requires a Connected App + RSA key pair (private key in env or file).
   */
  private async authenticate(): Promise<void> {
    try {
      if (!this.config.clientId) {
        throw new Error('Missing SALESFORCE_CLIENT_ID for JWT auth');
      }

      const privateKey =
        this.config.privateKey ||
        (this.config.privateKeyPath
          ? fs.readFileSync(this.config.privateKeyPath, 'utf8')
          : undefined);

      if (!privateKey) {
        throw new Error(
          'Missing private key for JWT auth (set SALESFORCE_PRIVATE_KEY or SALESFORCE_PRIVATE_KEY_PATH)'
        );
      }

      const now = Math.floor(Date.now() / 1000);
      const assertion = jwt.sign(
        {
          iss: this.config.clientId,
          sub: this.config.username,
          aud: this.config.loginUrl,
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
        `${this.config.loginUrl}/services/oauth2/token`,
        body.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, instance_url } = response.data || {};
      if (!access_token || !instance_url) {
        throw new Error('Invalid OAuth response - missing access_token or instance_url');
      }

      this.accessToken = access_token;
      this.instanceUrl = instance_url;
    } catch (error: any) {
      if (error.response?.data?.error_description) {
        throw new AuthenticationError(
          `Salesforce login failed: ${error.response.data.error_description}`
        );
      }
      throw new AuthenticationError(
        `Failed to authenticate with Salesforce: ${error.message}`
      );
    }
  }

  /**
   * Get authenticated API client
   */
  private async getApiClient(): Promise<AxiosInstance> {
    if (!this.accessToken || !this.instanceUrl) {
      await this.authenticate();
    }

    return axios.create({
      baseURL: `${this.instanceUrl}/services/data/${this.apiVersion}`,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch and cache Account object fields so we can adapt to org schema.
   */
  private async getAccountFieldSet(client: AxiosInstance): Promise<Set<string>> {
    if (this.accountFieldSet) return this.accountFieldSet;
    const response = await client.get('/sobjects/Account/describe');
    const fields: string[] = (response.data?.fields || []).map((f: any) => f.name);
    this.accountFieldSet = new Set(fields);
    return this.accountFieldSet;
  }

  /**
   * Fetch and cache Case object fields so we can adapt to org schema.
   */
  private async getCaseFieldSet(client: AxiosInstance): Promise<Set<string>> {
    if (this.caseFieldSet) return this.caseFieldSet;
    const response = await client.get('/sobjects/Case/describe');
    const fields: string[] = (response.data?.fields || []).map((f: any) => f.name);
    this.caseFieldSet = new Set(fields);
    return this.caseFieldSet;
  }

  /**
   * Build SOQL for Account based on available fields in this org.
   */
  private buildAccountQuery(fields: Set<string>, includeContacts: boolean): string {
    const selectFields: string[] = ['Id', 'Name', 'CreatedDate', 'LastModifiedDate'];
    if (fields.has('Type')) selectFields.push('Type');
    if (fields.has('Phone')) selectFields.push('Phone');
    if (fields.has('PersonEmail')) selectFields.push('PersonEmail');
    if (fields.has('Email')) selectFields.push('Email');
    if (fields.has('AUM__c')) selectFields.push('AUM__c');
    if (fields.has('Risk_Profile__c')) selectFields.push('Risk_Profile__c');

    let query = `SELECT ${selectFields.join(', ')}`;
    if (includeContacts) {
      query += ', (SELECT Email, Phone FROM Contacts ORDER BY CreatedDate DESC LIMIT 1)';
    }
    query += ' FROM Account';
    return query;
  }

  /**
   * Handle Salesforce API errors
   */
  private handleError(error: any): never {
    if (error.response?.status === 401) {
      this.accessToken = undefined;
      this.instanceUrl = undefined;
      throw new AuthenticationError('Salesforce session expired');
    }

    if (error.response?.data) {
      const sfError = error.response.data[0] as SalesforceErrorResponse;
      if (sfError.errorCode === 'INVALID_FIELD') {
        throw new ValidationError(sfError.message, {
          fields: sfError.fields?.join(', ') || '',
        });
      }
      throw new CRMError(sfError.message, sfError.errorCode);
    }

    throw new CRMError(error.message);
  }

  /**
   * Map Salesforce Account to Rift Client
   */
  private mapToClient(sfAccount: SalesforceAccount): Client {
    const contactEmail = sfAccount.Contacts?.records?.[0]?.Email;
    return {
      id: sfAccount.Id,
      name: sfAccount.Name,
      email: sfAccount.PersonEmail || sfAccount.Email || contactEmail || '',
      phone: sfAccount.Phone,
      clientType: this.mapToClientType(sfAccount.Type),
      riskProfile: this.mapToRiskProfile(sfAccount.Risk_Profile__c),
      assetsUnderManagement: sfAccount.AUM__c,
      createdAt: new Date(sfAccount.CreatedDate),
      updatedAt: new Date(sfAccount.LastModifiedDate),
    };
  }

  /**
   * Map Salesforce Case to Rift ServiceRequest
   */
  private mapToServiceRequest(sfCase: SalesforceCase): ServiceRequest {
    return {
      id: sfCase.Id,
      title: sfCase.Subject,
      description: sfCase.Description || '',
      type: this.mapToServiceRequestType(sfCase.Service_Request_Type__c),
      status: this.mapToServiceRequestStatus(sfCase.Status),
      priority: this.mapToServiceRequestPriority(sfCase.Priority),
      clientId: sfCase.AccountId || '',
      assignedTo: sfCase.OwnerId,
      createdAt: new Date(sfCase.CreatedDate),
      updatedAt: new Date(sfCase.LastModifiedDate),
    };
  }

  /**
   * Map Rift ClientType to Salesforce Account Type
   */
  private mapToSalesforceAccountType(clientType: ClientType): string {
    // TODO: Customize these mappings based on your Salesforce org configuration
    const mapping: Record<ClientType, string> = {
      [ClientType.Individual]: 'Individual',
      [ClientType.Joint]: 'Joint',
      [ClientType.Trust]: 'Trust',
      [ClientType.Corporate]: 'Corporate',
    };
    return mapping[clientType];
  }

  /**
   * Map Salesforce Account Type to Rift ClientType
   */
  private mapToClientType(sfType?: string): ClientType {
    const mapping: Record<string, ClientType> = {
      Individual: ClientType.Individual,
      Joint: ClientType.Joint,
      Trust: ClientType.Trust,
      Corporate: ClientType.Corporate,
    };
    return mapping[sfType || 'Individual'] || ClientType.Individual;
  }

  /**
   * Map Salesforce Risk Profile to Rift RiskProfile
   */
  private mapToRiskProfile(sfRiskProfile?: string): RiskProfile | undefined {
    if (!sfRiskProfile) return undefined;
    const mapping: Record<string, RiskProfile> = {
      Conservative: RiskProfile.Conservative,
      'Moderately Conservative': RiskProfile.ModeratelyConservative,
      Moderate: RiskProfile.Moderate,
      'Moderately Aggressive': RiskProfile.ModeratelyAggressive,
      Aggressive: RiskProfile.Aggressive,
    };
    return mapping[sfRiskProfile];
  }

  /**
   * Map Rift RiskProfile to Salesforce picklist value
   */
  private mapToSalesforceRiskProfile(riskProfile?: RiskProfile): string | undefined {
    if (!riskProfile) return undefined;
    const mapping: Record<RiskProfile, string> = {
      [RiskProfile.Conservative]: 'Conservative',
      [RiskProfile.ModeratelyConservative]: 'Moderately Conservative',
      [RiskProfile.Moderate]: 'Moderate',
      [RiskProfile.ModeratelyAggressive]: 'Moderately Aggressive',
      [RiskProfile.Aggressive]: 'Aggressive',
    };
    return mapping[riskProfile];
  }

  /**
   * Map Salesforce Case Status to Rift ServiceRequestStatus
   */
  private mapToServiceRequestStatus(sfStatus: string): ServiceRequestStatus {
    // TODO: Customize based on your Salesforce Case status values
    const mapping: Record<string, ServiceRequestStatus> = {
      New: ServiceRequestStatus.New,
      'In Progress': ServiceRequestStatus.InProgress,
      'Waiting on Client': ServiceRequestStatus.PendingClient,
      'Pending Approval': ServiceRequestStatus.PendingApproval,
      Closed: ServiceRequestStatus.Completed,
      Cancelled: ServiceRequestStatus.Cancelled,
    };
    return mapping[sfStatus] || ServiceRequestStatus.New;
  }

  /**
   * Map Rift ServiceRequestStatus to Salesforce Case Status
   */
  private mapToSalesforceStatus(status: ServiceRequestStatus): string {
    const mapping: Record<ServiceRequestStatus, string> = {
      [ServiceRequestStatus.New]: 'New',
      [ServiceRequestStatus.InProgress]: 'In Progress',
      [ServiceRequestStatus.PendingClient]: 'Waiting on Client',
      [ServiceRequestStatus.PendingApproval]: 'Pending Approval',
      [ServiceRequestStatus.Completed]: 'Closed',
      [ServiceRequestStatus.Cancelled]: 'Cancelled',
    };
    return mapping[status];
  }

  /**
   * Map Salesforce Service Request Type to Rift ServiceRequestType
   */
  private mapToServiceRequestType(sfType?: string): ServiceRequestType {
    // TODO: Create custom picklist in Salesforce for Service_Request_Type__c
    const mapping: Record<string, ServiceRequestType> = {
      Onboarding: ServiceRequestType.Onboarding,
      'Account Rebalancing': ServiceRequestType.AccountRebalancing,
      Withdrawal: ServiceRequestType.Withdrawal,
      Contribution: ServiceRequestType.Contribution,
      'Tax Planning': ServiceRequestType.TaxPlanning,
      'Estate Planning': ServiceRequestType.EstatePlanning,
      'General Inquiry': ServiceRequestType.GeneralInquiry,
    };
    return mapping[sfType || 'General Inquiry'] || ServiceRequestType.GeneralInquiry;
  }

  /**
   * Map Rift ServiceRequestType to Salesforce picklist value
   */
  private mapToSalesforceServiceRequestType(type: ServiceRequestType): string {
    const mapping: Record<ServiceRequestType, string> = {
      [ServiceRequestType.Onboarding]: 'Onboarding',
      [ServiceRequestType.AccountRebalancing]: 'Account Rebalancing',
      [ServiceRequestType.Withdrawal]: 'Withdrawal',
      [ServiceRequestType.Contribution]: 'Contribution',
      [ServiceRequestType.TaxPlanning]: 'Tax Planning',
      [ServiceRequestType.EstatePlanning]: 'Estate Planning',
      [ServiceRequestType.GeneralInquiry]: 'General Inquiry',
    };
    return mapping[type];
  }

  /**
   * Map Salesforce Case Priority to Rift ServiceRequestPriority
   */
  private mapToServiceRequestPriority(sfPriority: string): ServiceRequestPriority {
    const mapping: Record<string, ServiceRequestPriority> = {
      Low: ServiceRequestPriority.Low,
      Medium: ServiceRequestPriority.Medium,
      High: ServiceRequestPriority.High,
      Urgent: ServiceRequestPriority.Urgent,
    };
    return mapping[sfPriority] || ServiceRequestPriority.Medium;
  }

  /**
   * Map Rift ServiceRequestPriority to Salesforce Case Priority
   */
  private mapToSalesforcePriority(priority: ServiceRequestPriority): string {
    const mapping: Record<ServiceRequestPriority, string> = {
      [ServiceRequestPriority.Low]: 'Low',
      [ServiceRequestPriority.Medium]: 'Medium',
      [ServiceRequestPriority.High]: 'High',
      [ServiceRequestPriority.Urgent]: 'Urgent',
    };
    return mapping[priority];
  }

  /**
   * List all clients matching optional filters
   */
  async listClients(filters?: ClientFilters): Promise<Client[]> {
    try {
      const client = await this.getApiClient();
      const fields = await this.getAccountFieldSet(client);
      const includeContacts =
        !fields.has('PersonEmail') && !fields.has('Email');

      // Build SOQL query with filters
      // TODO: Adjust field names based on your Salesforce org (Person Accounts vs Business Accounts)
      let query = this.buildAccountQuery(fields, includeContacts);

      const conditions: string[] = [];
      if (filters?.clientType && fields.has('Type')) {
        conditions.push(`Type = '${this.mapToSalesforceAccountType(filters.clientType)}'`);
      }
      if (filters?.minAUM && fields.has('AUM__c')) {
        conditions.push(`AUM__c >= ${filters.minAUM}`);
      }
      if (filters?.maxAUM && fields.has('AUM__c')) {
        conditions.push(`AUM__c <= ${filters.maxAUM}`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const response = await client.get<SalesforceQueryResponse<SalesforceAccount>>(
        `/query?q=${encodeURIComponent(query)}`
      );

      return response.data.records.map((record) => this.mapToClient(record));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a single client by ID
   */
  async getClient(id: string): Promise<Client> {
    try {
      const client = await this.getApiClient();
      const fields = await this.getAccountFieldSet(client);
      const includeContacts =
        !fields.has('PersonEmail') && !fields.has('Email');

      let query = this.buildAccountQuery(fields, includeContacts);
      query += ` WHERE Id = '${id}' LIMIT 1`;

      const response = await client.get<SalesforceQueryResponse<SalesforceAccount>>(
        `/query?q=${encodeURIComponent(query)}`
      );

      if (response.data.records.length === 0) {
        throw new NotFoundError('Client', id);
      }

      return this.mapToClient(response.data.records[0]);
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundError('Client', id);
      }
      return this.handleError(error);
    }
  }

  /**
   * Create a new client
   */
  async createClient(data: CreateClientData): Promise<Client> {
    try {
      const client = await this.getApiClient();
      const fields = await this.getAccountFieldSet(client);

      // TODO: Adjust field mapping based on your Salesforce org configuration
      // Note: PersonEmail is for Person Accounts, Email is for Business Accounts
      const sfData: any = {
        Name: data.name,
      };
      if (fields.has('PersonEmail') && data.email) sfData.PersonEmail = data.email;
      if (fields.has('Phone') && data.phone) sfData.Phone = data.phone;
      if (fields.has('Type')) sfData.Type = this.mapToSalesforceAccountType(data.clientType);
      if (fields.has('AUM__c') && data.assetsUnderManagement !== undefined) {
        sfData.AUM__c = data.assetsUnderManagement;
      }
      if (fields.has('Risk_Profile__c') && data.riskProfile) {
        sfData.Risk_Profile__c = this.mapToSalesforceRiskProfile(data.riskProfile);
      }

      const response = await client.post<SalesforceCreateResponse>(
        '/sobjects/Account',
        sfData
      );

      if (!response.data.success) {
        throw new ValidationError(
          response.data.errors[0]?.message || 'Failed to create client'
        );
      }

      // If Person Accounts are not enabled, store email on a Contact linked to the Account.
      if (!fields.has('PersonEmail') && data.email) {
        await client.post('/sobjects/Contact', {
          AccountId: response.data.id,
          Email: data.email,
          Phone: data.phone,
          LastName: data.name || 'Client',
        });
      }

      return this.getClient(response.data.id);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update an existing client
   */
  async updateClient(id: string, data: UpdateClientData): Promise<Client> {
    try {
      const client = await this.getApiClient();
      const fields = await this.getAccountFieldSet(client);

      // TODO: Adjust field mapping based on your Salesforce org
      const sfData: any = {};
      if (data.name !== undefined) sfData.Name = data.name;
      if (data.email !== undefined && fields.has('PersonEmail')) {
        sfData.PersonEmail = data.email;
      }
      if (data.phone !== undefined && fields.has('Phone')) sfData.Phone = data.phone;
      if (data.clientType !== undefined && fields.has('Type')) {
        sfData.Type = this.mapToSalesforceAccountType(data.clientType);
      }
      if (data.assetsUnderManagement !== undefined && fields.has('AUM__c')) {
        sfData.AUM__c = data.assetsUnderManagement;
      }
      if (data.riskProfile !== undefined && fields.has('Risk_Profile__c')) {
        sfData.Risk_Profile__c = this.mapToSalesforceRiskProfile(data.riskProfile);
      }

      if (Object.keys(sfData).length > 0) {
        await client.patch(`/sobjects/Account/${id}`, sfData);
      }

      if (data.email !== undefined && !fields.has('PersonEmail')) {
        // Best-effort: update or create a Contact to store email when Person Accounts are disabled.
        await client.post('/sobjects/Contact', {
          AccountId: id,
          Email: data.email,
          Phone: data.phone,
          LastName: data.name || 'Client',
        });
      }

      return this.getClient(id);
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundError('Client', id);
      }
      return this.handleError(error);
    }
  }

  /**
   * Create a new service request
   */
  async createServiceRequest(
    data: CreateServiceRequestData
  ): Promise<ServiceRequest> {
    try {
      const client = await this.getApiClient();
      const fields = await this.getCaseFieldSet(client);

      // TODO: Adjust field mapping based on your Salesforce Case configuration
      const sfData: any = {
        Subject: data.title,
        Status: 'New',
      };
      if (data.description) sfData.Description = data.description;
      if (data.clientId) sfData.AccountId = data.clientId;
      if (data.priority) sfData.Priority = this.mapToSalesforcePriority(data.priority);
      if (data.assignedTo) sfData.OwnerId = data.assignedTo;
      if (fields.has('Service_Request_Type__c')) {
        sfData.Service_Request_Type__c = this.mapToSalesforceServiceRequestType(
          data.type
        );
      }

      const response = await client.post<SalesforceCreateResponse>(
        '/sobjects/Case',
        sfData
      );

      if (!response.data.success) {
        throw new ValidationError(
          response.data.errors[0]?.message || 'Failed to create service request'
        );
      }

      return this.getServiceRequest(response.data.id);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a single service request by ID
   */
  async getServiceRequest(id: string): Promise<ServiceRequest> {
    try {
      const client = await this.getApiClient();

      // TODO: Adjust field names based on your Salesforce Case configuration
      const response = await client.get<SalesforceCase>(`/sobjects/Case/${id}`);

      return this.mapToServiceRequest(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundError('ServiceRequest', id);
      }
      return this.handleError(error);
    }
  }

  /**
   * Update the status of a service request
   */
  async updateServiceRequestStatus(
    id: string,
    status: ServiceRequestStatus
  ): Promise<ServiceRequest> {
    try {
      const client = await this.getApiClient();

      const sfData = {
        Status: this.mapToSalesforceStatus(status),
      };

      await client.patch(`/sobjects/Case/${id}`, sfData);

      return this.getServiceRequest(id);
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundError('ServiceRequest', id);
      }
      return this.handleError(error);
    }
  }
}
