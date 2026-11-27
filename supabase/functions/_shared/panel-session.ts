const stagingOrigin = 'https://bccfbpwiuyiivrxlmceu.supabase.co';
const panelKeyId = '14345217-5f3b-4a21-b007-b3f7c03c3183';

function decode(segment: string) {
  return Uint8Array.from(atob(segment.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

export async function verifyPanelSession(token: string, { allowLegacy = true } = {}): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const parse = (part: string) => JSON.parse(new TextDecoder().decode(decode(part)));
    const { alg, kid } = parse(header);
    const claims = parse(payload);
    if (!Number.isFinite(claims?.exp) || claims.exp <= Date.now() / 1000) return null;

    if (alg === 'HS256' && allowLegacy) {
      const secret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
      if (!secret) return null;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const valid = await crypto.subtle.verify('HMAC', key, decode(signature), encoder.encode(header + '.' + payload));
      return valid ? claims : null;
    }
    // PostgREST verifies the signature. auth_gym_id checks the active staff record, role and tenant.
    const apiKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (alg !== 'ES256' || kid !== panelKeyId || Deno.env.get('SUPABASE_URL') !== stagingOrigin || !apiKey) return null;
    if (!['superadmin', 'admin', 'staff', 'coach', 'recepcion', 'operaciones', 'marketing'].includes(claims.app_rol)) return null;
    if (!Number.isSafeInteger(claims.gym_id) || claims.gym_id <= 0) return null;
    const response = await fetch(stagingOrigin + '/rest/v1/rpc/auth_gym_id', {
      method: 'POST',
      headers: { apikey: apiKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok && await response.json() === claims.gym_id ? claims : null;
  } catch {
    return null;
  }
}
