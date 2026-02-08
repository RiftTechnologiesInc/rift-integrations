export enum AccountType {
  Taxable = 'TAXABLE',
  TraditionalIRA = 'TRADITIONAL_IRA',
  RothIRA = 'ROTH_IRA',
  SEP_IRA = 'SEP_IRA',
  Simple401k = 'SIMPLE_401K',
  Trust = 'TRUST',
  UTMA_UGMA = 'UTMA_UGMA',
}

export interface Account {
  id: string;
  accountNumber: string;
  accountType: AccountType;
  balance: number;
  clientId: string;
  custodian?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountData {
  accountNumber: string;
  accountType: AccountType;
  balance: number;
  clientId: string;
  custodian?: string;
}

export interface UpdateAccountData {
  accountNumber?: string;
  accountType?: AccountType;
  balance?: number;
  custodian?: string;
}
