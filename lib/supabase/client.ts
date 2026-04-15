import type { createBrowserClient } from '@supabase/ssr'

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>

let browserClientPromise: Promise<BrowserSupabaseClient> | null = null

export async function getBrowserClient(): Promise<BrowserSupabaseClient> {
  if (!browserClientPromise) {
    browserClientPromise = import('@supabase/ssr').then(({ createBrowserClient }) =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      )
    )
  }

  return browserClientPromise
}
