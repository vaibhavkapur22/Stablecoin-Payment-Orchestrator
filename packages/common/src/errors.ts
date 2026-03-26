export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class QuoteExpiredError extends AppError {
  constructor(quoteId: string) {
    super(400, `Quote ${quoteId} has expired`, 'QUOTE_EXPIRED');
  }
}

export class QuoteNotFoundError extends AppError {
  constructor(quoteId: string) {
    super(404, `Quote ${quoteId} not found`, 'QUOTE_NOT_FOUND');
  }
}

export class PaymentIntentNotFoundError extends AppError {
  constructor(id: string) {
    super(404, `Payment intent ${id} not found`, 'PAYMENT_INTENT_NOT_FOUND');
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(key: string) {
    super(409, `Idempotency key ${key} already used`, 'IDEMPOTENCY_CONFLICT');
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(chain: string) {
    super(422, `Insufficient treasury balance on ${chain}`, 'INSUFFICIENT_BALANCE');
  }
}

export class ChainUnavailableError extends AppError {
  constructor(chain: string) {
    super(503, `Chain ${chain} is currently unavailable`, 'CHAIN_UNAVAILABLE');
  }
}

export class NoViableRouteError extends AppError {
  constructor() {
    super(422, 'No viable route available for this payment', 'NO_VIABLE_ROUTE');
  }
}
