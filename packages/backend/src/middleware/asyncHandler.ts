/**
 * Async route handler wrapper — eliminates repetitive try/catch blocks.
 * Catches async errors and passes them to Express error handler.
 * 
 * Usage:
 *   router.get('/', authenticate, asyncHandler(async (req, res) => {
 *     const result = await query('SELECT ...');
 *     res.json(result.rows);
 *   }));
 */

import { Request, Response, NextFunction } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const asyncHandler = (fn: AsyncRouteHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
