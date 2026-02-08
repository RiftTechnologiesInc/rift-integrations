/**
 * Rift Integrations - Public API
 *
 * This module exports CRM-agnostic core models and adapters for
 * integrating with various CRM and fintech platforms.
 */

// Core Models
export { Client, CreateClientData, UpdateClientData, ClientFilters, ClientType, RiskProfile } from './core/models/Client';
export { Account, CreateAccountData, UpdateAccountData, AccountType } from './core/models/Account';
export { ServiceRequest, CreateServiceRequestData, UpdateServiceRequestData, ServiceRequestType, ServiceRequestStatus, ServiceRequestPriority } from './core/models/ServiceRequest';
export { WorkflowStep, CreateWorkflowStepData, UpdateWorkflowStepData, WorkflowStepStatus } from './core/models/WorkflowStep';

// Core Ports
export { CRMClient } from './core/ports/CRMClient';

// Errors
export { CRMError, AuthenticationError, NotFoundError, ValidationError, RateLimitError } from './core/errors';

// Adapters
export { SalesforceClient } from './adapters/salesforce/SalesforceClient';
export { SalesforceConfig, SalesforceAuthResponse } from './adapters/salesforce/salesforceTypes';
