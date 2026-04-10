import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/logs?type=AUTH&level=ERROR&limit=50&page=1
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, level, page = '1', limit = '50' } = req.query;

  const where: Record<string, unknown> = { userId: req.userId };
  if (type) where.type = type;
  if (level) where.level = level;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [logs, total] = await Promise.all([
    prisma.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.log.count({ where }),
  ]);

  res.json({ logs, total, page: parseInt(page as string) });
});

export default router;
