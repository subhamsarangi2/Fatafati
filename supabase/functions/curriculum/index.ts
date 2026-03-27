import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL')!;
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!;
const CACHE_KEY = 'curriculum_v1';
const CACHE_TTL = 3600; // 1 hour

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function redisGet(key: string): Promise<string | null> {
  const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = await res.json();
  return json.result ?? null;
}

async function redisSet(key: string, value: string, ttl: number): Promise<void> {
  await fetch(`${UPSTASH_URL}/set/${key}/ex/${ttl}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Try cache first
    const cached = await redisGet(CACHE_KEY);
    if (cached) {
      return new Response(cached, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }

    // Cache miss — fetch from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase
      .from('milestones')
      .select('*, topics(id, title, slug, description, order_index)')
      .order('order_index');

    if (error) throw error;

    const payload = JSON.stringify(data);
    await redisSet(CACHE_KEY, payload, CACHE_TTL);

    return new Response(payload, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
