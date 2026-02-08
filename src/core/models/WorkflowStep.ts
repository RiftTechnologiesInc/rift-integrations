export enum WorkflowStepStatus {
  Pending = 'PENDING',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Skipped = 'SKIPPED',
}

export interface WorkflowStep {
  id: string;
  serviceRequestId: string;
  stepName: string;
  stepOrder: number;
  status: WorkflowStepStatus;
  assignedTo?: string;
  dueDate?: Date;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkflowStepData {
  serviceRequestId: string;
  stepName: string;
  stepOrder: number;
  assignedTo?: string;
  dueDate?: Date;
}

export interface UpdateWorkflowStepData {
  status?: WorkflowStepStatus;
  assignedTo?: string;
  dueDate?: Date;
  completedAt?: Date;
  notes?: string;
}
