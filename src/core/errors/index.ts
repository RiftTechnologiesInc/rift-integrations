export class CRMError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'CRMError';
    Object.setPrototypeOf(this, CRMError.prototype);
  }
}

export class AuthenticationError extends CRMError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class NotFoundError extends CRMError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ValidationError extends CRMError {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class RateLimitError extends CRMError {
  constructor(public readonly retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT');
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
