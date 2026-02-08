import {
  Client,
  CreateClientData,
  UpdateClientData,
  ClientFilters,
} from '../models/Client';
import {
  ServiceRequest,
  CreateServiceRequestData,
  UpdateServiceRequestData,
  ServiceRequestStatus,
} from '../models/ServiceRequest';

export interface CRMClient {
  /**
   * List all clients matching optional filters
   */
  listClients(filters?: ClientFilters): Promise<Client[]>;

  /**
   * Get a single client by ID
   */
  getClient(id: string): Promise<Client>;

  /**
   * Create a new client
   */
  createClient(data: CreateClientData): Promise<Client>;

  /**
   * Update an existing client
   */
  updateClient(id: string, data: UpdateClientData): Promise<Client>;

  /**
   * Create a new service request
   */
  createServiceRequest(data: CreateServiceRequestData): Promise<ServiceRequest>;

  /**
   * Get a single service request by ID
   */
  getServiceRequest(id: string): Promise<ServiceRequest>;

  /**
   * Update the status of a service request
   */
  updateServiceRequestStatus(
    id: string,
    status: ServiceRequestStatus
  ): Promise<ServiceRequest>;
}
