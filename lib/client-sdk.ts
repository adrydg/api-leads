/**
 * SDK Cliente para envío de leads
 * Usar en el formulario del frontend
 */

export interface LeadClientConfig {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
}

export interface LeadData {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  street?: string;
  message?: string;
  notes?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface LeadResponse {
  success: boolean;
  leadId?: string;
  message?: string;
  error?: string;
}

/**
 * Generar firma HMAC SHA-256
 */
async function generateHMAC(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Cliente para envío de leads
 */
export class LeadClient {
  private config: LeadClientConfig;

  constructor(config: LeadClientConfig) {
    this.config = config;
  }

  /**
   * Enviar lead al webhook
   */
  async sendLead(leadData: LeadData): Promise<LeadResponse> {
    try {
      const timestamp = Date.now();
      const payload = JSON.stringify({ ...leadData, timestamp });

      // Generar signature HMAC
      const signature = await generateHMAC(payload, this.config.webhookSecret);

      // Enviar request
      const response = await fetch(`${this.config.apiUrl}/api/leads/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
          'X-Signature': signature,
          'X-Timestamp': timestamp.toString(),
        },
        body: payload,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
          message: data.details || data.message,
        };
      }

      return {
        success: true,
        leadId: data.leadId,
        message: data.message || 'Lead enviado correctamente',
      };
    } catch (error: any) {
      console.error('Error sending lead:', error);
      return {
        success: false,
        error: error.message || 'Error de conexión',
      };
    }
  }
}

/**
 * Helper para extraer UTM params de la URL
 */
export function getUTMParams(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
} {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);

  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmTerm: params.get('utm_term') || undefined,
    utmContent: params.get('utm_content') || undefined,
  };
}
