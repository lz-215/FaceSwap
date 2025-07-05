// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts' // This import must be available in the Supabase Edge Functions runtime

console.log("Hello from Functions!")

serve(async (req: Request) => {
  try {
    // 解析 Supabase Auth Webhook 事件
    const body = await req.json() as any
    const type = body.type
    const record = body.record

    // 只处理 user.created 事件（INSERT）
    if (type === 'INSERT' && record) {
      const userId = record.id
      const email = record.email

      // 调用 Supabase REST API 写入自建 user 表
      const res = await fetch(`${(typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_URL') : process.env.SUPABASE_URL)}/rest/v1/user`, {
        method: 'POST',
        headers: {
          'apikey': (typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_ANON_KEY') : process.env.SUPABASE_ANON_KEY)!,
          'Authorization': `Bearer ${(typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') : process.env.SUPABASE_SERVICE_ROLE_KEY)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ id: userId, email }]),
      })

      if (!res.ok) {
        const errorText = await res.text()
        return new Response(`Failed to sync user: ${errorText}`, { status: 500 })
      }
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    return new Response(`Error: ${err}`, { status: 500 })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/sync-user' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
