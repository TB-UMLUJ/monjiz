
import { supabase, DEFAULT_USER_ID } from './supabaseClient';

export const authService = {
  login: async (password: string): Promise<boolean> => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('password_hash')
            .eq('id', DEFAULT_USER_ID)
            .single();

        if (error || !data) return false;

        // In a real app, use bcrypt compare. Here we compare simple hash/string as per prompt requirements
        if (password === data.password_hash) {
            localStorage.setItem('mali_auth_token', 'valid_session');
            return true;
        }
        return false;
    } catch (e) {
        console.error("Login error", e);
        return false;
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
