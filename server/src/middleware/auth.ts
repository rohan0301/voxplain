import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * Express middleware that verifies the Supabase JWT from the Authorization header.
 * 
 * If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set, the middleware
 * is permissive (passes through) so local dev still works without Supabase.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Skip auth in dev if Supabase is not configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        next();
        return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }

    const token = authHeader.slice(7);

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        // Attach user to request for downstream handlers
        (req as any).user = user;
        next();
    } catch (err) {
        console.error('[Auth] Token verification failed:', err);
        res.status(401).json({ error: 'Authentication failed' });
    }
}
