import { NextRequest, NextResponse } from 'next/server';
import { LeadSchema, LeadDB } from '@/types/lead';
import { verifySignature, verifyTimestamp, checkRateLimit } from '@/lib/security';
import { supabase } from '@/lib/supabase';

// Dominios permitidos (whitelist CORS)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

// API Keys válidas (formato: nombre:key)
const VALID_API_KEYS = (process.env.API_KEYS || '').split(',').filter(Boolean);

/**
 * Verificar CORS
 */
function checkCORS(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => origin.includes(allowed));
}

/**
 * Verificar API Key
 */
function checkAPIKey(apiKey: string | null): boolean {
  if (!apiKey) return false;
  return VALID_API_KEYS.includes(apiKey);
}

/**
 * Headers CORS
 */
function getCORSHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Signature, X-Timestamp',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * OPTIONS handler para preflight
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');

  return NextResponse.json({}, {
    status: 200,
    headers: getCORSHeaders(origin)
  });
}

/**
 * POST handler - Recibe leads
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const corsHeaders = getCORSHeaders(origin);

  try {
    // 1. Verificar CORS
    if (!checkCORS(origin)) {
      console.error('❌ CORS rejected:', origin);
      return NextResponse.json(
        { error: 'Origin not allowed' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Verificar API Key
    const apiKey = req.headers.get('x-api-key');
    if (!checkAPIKey(apiKey)) {
      console.error('❌ Invalid API Key');
      return NextResponse.json(
        { error: 'Invalid API Key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 3. Rate Limiting (por IP)
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip, 20, 60000)) {
      console.error('❌ Rate limit exceeded:', ip);
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: corsHeaders }
      );
    }

    // 4. Leer body
    const bodyText = await req.text();
    if (!bodyText) {
      return NextResponse.json(
        { error: 'Empty body' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 5. Verificar HMAC signature
    const signature = req.headers.get('x-signature');
    const timestamp = req.headers.get('x-timestamp');

    if (!signature || !timestamp) {
      console.error('❌ Missing signature or timestamp');
      return NextResponse.json(
        { error: 'Missing security headers' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verificar timestamp (no más de 5 minutos)
    const timestampNum = parseInt(timestamp, 10);
    if (!verifyTimestamp(timestampNum)) {
      console.error('❌ Timestamp expired');
      return NextResponse.json(
        { error: 'Request expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verificar signature
    if (!verifySignature(bodyText, signature)) {
      console.error('❌ Invalid signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 6. Parsear y validar datos
    let leadData;
    try {
      leadData = JSON.parse(bodyText);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: corsHeaders }
      );
    }

    const validation = LeadSchema.safeParse(leadData);
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.error.errors);
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const validatedLead = validation.data;

    // 7. Preparar datos para Supabase
    const leadDB: LeadDB = {
      name: validatedLead.name,
      email: validatedLead.email,
      phone: validatedLead.phone,
      city: validatedLead.city,
      street: validatedLead.street,
      notes: validatedLead.message || validatedLead.notes,
      status: 'Recibido',
      priority: 'media',
      source: validatedLead.source || origin || 'api-webhook',
      metadata: {
        utm_source: validatedLead.utmSource,
        utm_medium: validatedLead.utmMedium,
        utm_campaign: validatedLead.utmCampaign,
        utm_term: validatedLead.utmTerm,
        utm_content: validatedLead.utmContent,
        ip_address: ip,
        user_agent: req.headers.get('user-agent') || undefined,
        form_timestamp: validatedLead.timestamp || timestampNum,
        received_at: new Date().toISOString(),
      }
    };

    // 8. Guardar en Supabase
    const { data, error } = await supabase
      .from('leads')
      .insert(leadDB)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('✅ Lead created:', data.id, '- Source:', leadDB.source);

    // 9. Respuesta exitosa
    return NextResponse.json(
      {
        success: true,
        leadId: data.id,
        message: 'Lead received successfully'
      },
      { status: 201, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
