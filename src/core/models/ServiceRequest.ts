import { WorkflowStep } from './WorkflowStep';

export enum ServiceRequestType {
  Onboarding = 'ONBOARDING',
  AccountRebalancing = 'ACCOUNT_REBALANCING',
  Withdrawal = 'WITHDRAWAL',
  Contribution = 'CONTRIBUTION',
  TaxPlanning = 'TAX_PLANNING',
  EstatePlanning = 'ESTATE_PLANNING',
  GeneralInquiry = 'GENERAL_INQUIRY',
}

export enum ServiceRequestStatus {
  New = 'NEW',
  InProgress = 'IN_PROGRESS',
  PendingClient = 'PENDING_CLIENT',
  PendingApproval = 'PENDING_APPROVAL',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export enum ServiceRequestPriority {
  Low = 'LOW',
  Medium = 'MEDIUM',
  High = 'HIGH',
  Urgent = 'URGENT',
}

export interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  clientId: string;
  assignedTo?: string;
  workflowSteps?: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceRequestData {
  title: string;
  description: string;
  type: ServiceRequestType;
  priority: ServiceRequestPriority;
  clientId: string;
  assignedTo?: string;
}

export interface UpdateServiceRequestData {
  title?: string;
  description?: string;
  status?: ServiceRequestStatus;
  priority?: ServiceRequestPriority;
  assignedTo?: string;
}
