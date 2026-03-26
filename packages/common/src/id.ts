import { nanoid } from 'nanoid';

export function generateId(prefix: string): string {
  return `${prefix}_${nanoid(16)}`;
}

export const quoteId = () => generateId('qt');
export const paymentIntentId = () => generateId('pi');
export const attemptId = () => generateId('att');
export const ledgerEntryId = () => generateId('le');
export const webhookEventId = () => generateId('wh');
export const merchantId = () => generateId('mer');
