import { supabase, DEFAULT_USER_ID, supabaseUrl, supabaseKey } from './supabaseClient';

export const authService = {
  login: async (password: string): Promise<boolean> => {
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
        throw new Error('DATABASE_NOT_CONFIGURED');
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select('password_hash')
            .eq('id', DEFAULT_USER_ID)
            .single();

        if (error) {
            console.error("Supabase Login Error:", error);
            throw new Error('DATABASE_CONNECTION_FAILED');
        }
        if (!data) {
            // This implies the seed user doesn't exist, which is a setup issue.
            throw new Error('USER_NOT_FOUND');
        }

        // In a real app, use bcrypt compare. Here we compare simple hash/string as per prompt requirements
        if (password === data.password_hash) {
            localStorage.setItem('mali_auth_token', 'valid_session');
            return true;
        }
        return false;
    } catch (e) {
        // Re-throw our custom errors or a generic one
        if (e instanceof Error && ['DATABASE_NOT_CONFIGURED', 'DATABASE_CONNECTION_FAILED', 'USER_NOT_FOUND'].includes(e.message)) {
            throw e;
        }
        console.error("Unknown Login Error:", e);
        throw new Error('UNKNOWN_LOGIN_ERROR');
    }
  },

  logout: () => {
    localStorage.removeItem('mali_auth_token');
    // We let the App component handle the redirect/state change
  },

  isAuthenticated: (): boolean => {
    return localStorage.getItem('mali_auth_token') === 'valid_session';
  }
};