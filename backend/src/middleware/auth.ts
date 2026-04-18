import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  userId?: string;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }

  const token = header.slice(7);

  // API token (formato fin_<64hex>)
  if (token.startsWith('fin_')) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const apiToken = await prisma.apiToken.findUnique({ where: { tokenHash: hash } });
    if (!apiToken) {
      res.status(401).json({ error: 'API token inválido' });
      return;
    }
    // Actualizar lastUsedAt sin bloquear
    prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    req.userId = apiToken.userId;
    next();
    return;
  }

  // JWT de sesión
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
