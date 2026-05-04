import type { Request, Response, NextFunction } from 'express';
/**
 * Express middleware that verifies the Supabase JWT from the Authorization header.
 *
 * If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set, the middleware
 * is permissive (passes through) so local dev still works without Supabase.
 */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map