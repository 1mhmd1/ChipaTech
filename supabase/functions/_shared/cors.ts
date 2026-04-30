// Standard CORS headers for browser → Edge Function calls.
// In production lock `Access-Control-Allow-Origin` down to your
// real domain instead of `*`.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};
