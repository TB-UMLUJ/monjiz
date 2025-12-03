import { createClient } from '@supabase/supabase-js';

// Helper to safely access environment variables
const getEnv = (key: string) => {
  try {
    // 1. Check import.meta.env (Vite)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || '';
    }
  } catch (e) {
    // Ignore error
  }

  try {
    // 2. Check window.process.env (Polyfill)
    // @ts-ignore
    if (typeof window !== 'undefined' && window.process && window.process.env) {
       // @ts-ignore
       return window.process.env[key] || '';
    }
  } catch (e) {
    // Ignore error
  }

  try {
    // 3. Check process.env (Node)
    if (typeof process !== 'undefined' && process.env) {
       return process.env[key] || '';
    }
  } catch (e) {
    // Ignore error
  }
  
  return '';
};

export const supabaseUrl = getEnv('VITE_SUPABASE_URL');
export const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase keys are missing! Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file or Vercel settings.');
}

// Initialize Supabase with fallback to prevent crash during initialization if keys are missing
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co', 
    supabaseKey || 'placeholder-key'
);

// Use the seed User ID from the SQL provided
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';