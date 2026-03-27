import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL')!;
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!;
const CACHE_KEY = 'first_topic_v1';
const CACHE_TTL = 3600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Cache',
};

async function redisGet(key: string): Promise<string | null> {
  const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = await res.json();
  return json.result ?? null;
}

async function redisSet(key: string, value: string, ttl: number): Promise<void> {
  await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([['SET', key, value, 'EX', ttl]]),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const cached = await redisGet(CACHE_KEY);
    if (cached) {
      const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: topic, error } = await supabase
      .from('topics')
      .select('*, milestones(title, id), questions(*)')
      .order('order_index', { ascending: true })
      .limit(1)
      .single();

    if (error) throw error;

    const payload = JSON.stringify(topic);
    await redisSet(CACHE_KEY, payload, CACHE_TTL);

    return new Response(payload, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
