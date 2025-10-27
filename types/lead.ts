import { z } from 'zod';

/**
 * Schema de validación para leads entrantes
 */
export const LeadSchema = z.object({
  // Campos básicos requeridos
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido').optional(),
  phone: z.string().min(9, 'Teléfono inválido').optional(),

  // Ubicación
  city: z.string().optional(),
  street: z.string().optional(),

  // Información adicional
  message: z.string().optional(),
  notes: z.string().optional(),

  // Metadata
  source: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),

  // Timestamp del formulario
  timestamp: z.number().optional(),
}).refine(
  (data) => data.email || data.phone,
  {
    message: 'Debe proporcionar al menos email o teléfono',
    path: ['email'],
  }
);

export type LeadInput = z.infer<typeof LeadSchema>;

/**
 * Tipo para el lead que se guarda en Supabase
 */
export interface LeadDB {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  street?: string;
  notes?: string;
  status: string;
  priority: string;
  source: string;
  metadata: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    ip_address?: string;
    user_agent?: string;
    form_timestamp?: number;
    [key: string]: any;
  };
}
