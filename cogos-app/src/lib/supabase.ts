// ============================================
// CognitionOS — Supabase Client
// ============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient;

// Only create the client if we have valid configuration
// This prevents build-time crashes when env vars are placeholders
if (supabaseUrl && supabaseUrl.startsWith('http')) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Create a dummy client that will fail gracefully at runtime
  // This allows the build to succeed without valid credentials
  console.warn(
    'CognitionOS: Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  );
  supabase = new Proxy({} as SupabaseClient, {
    get: (_target, prop) => {
      if (prop === 'from') {
        return () => ({
          select: () => ({
            order: () => ({
              limit: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' },
                  }),
              }),
            }),
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' },
              }),
            limit: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' },
                }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' },
                }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' },
                  }),
              }),
            }),
          }),
        });
      }
      return () => {};
    },
  });
}

export { supabase };
