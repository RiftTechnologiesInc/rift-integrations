export enum ClientType {
  Individual = 'INDIVIDUAL',
  Joint = 'JOINT',
  Trust = 'TRUST',
  Corporate = 'CORPORATE',
}

export enum RiskProfile {
  Conservative = 'CONSERVATIVE',
  ModeratelyConservative = 'MODERATELY_CONSERVATIVE',
  Moderate = 'MODERATE',
  ModeratelyAggressive = 'MODERATELY_AGGRESSIVE',
  Aggressive = 'AGGRESSIVE',
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  clientType: ClientType;
  riskProfile?: RiskProfile;
  assetsUnderManagement?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClientData {
  name: string;
  email: string;
  phone?: string;
  clientType: ClientType;
  riskProfile?: RiskProfile;
  assetsUnderManagement?: number;
}

export interface UpdateClientData {
  name?: string;
  email?: string;
  phone?: string;
  clientType?: ClientType;
  riskProfile?: RiskProfile;
  assetsUnderManagement?: number;
}

export interface ClientFilters {
  clientType?: ClientType;
  riskProfile?: RiskProfile;
  minAUM?: number;
  maxAUM?: number;
}
