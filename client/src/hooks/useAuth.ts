import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isLoggedIn: boolean;
}

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setUser(s?.user ?? null);
            setIsLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, s) => {
                setSession(s);
                setUser(s?.user ?? null);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }, []);

    const signUp = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const getAccessToken = useCallback(async (): Promise<string | null> => {
        const { data: { session: s } } = await supabase.auth.getSession();
        return s?.access_token ?? null;
    }, []);

    return {
        user,
        session,
        isLoading,
        isLoggedIn: !!user,
        signIn,
        signUp,
        signOut,
        getAccessToken,
    };
}
