import { createHmac, timingSafeEqual } from 'crypto';

function getWebhookSecret(): string {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('WEBHOOK_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Generate HMAC signature for payload
 */
export function generateSignature(payload: string, secret?: string): string {
  const secretKey = secret || getWebhookSecret();
  return createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');
}

/**
 * Verify HMAC signature (timing-safe comparison)
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret?: string
): boolean {
  const secretKey = secret || getWebhookSecret();
  const expectedSignature = generateSignature(payload, secretKey);

  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Verify timestamp is within acceptable window (5 minutes)
 */
export function verifyTimestamp(timestamp: number): boolean {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  const fiveMinutes = 5 * 60 * 1000;

  return diff < fiveMinutes;
}

/**
 * Rate limiting simple implementation (in-memory)
 * For production, use Redis or similar
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(identifier: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = requestCounts.get(identifier);

  if (!record || now > record.resetAt) {
    requestCounts.set(identifier, {
      count: 1,
      resetAt: now + windowMs
    });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}
