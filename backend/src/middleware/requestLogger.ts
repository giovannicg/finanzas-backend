import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { writeLog } from '../services/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = (req as AuthRequest).userId;
    const status = res.statusCode;

    // Skip noisy health checks
    if (req.path === '/health') return;

    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
    const type = status >= 400 ? 'ERROR' : 'REQUEST';

    writeLog({
      type,
      level,
      userId,
      method: req.method,
      path: req.path,
      status,
      duration,
      message: `${req.method} ${req.path} → ${status} (${duration}ms)`,
    }).catch(() => {});
  });

  next();
}
