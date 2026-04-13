import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/users/me
router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, inboxEmail: true, totalBudget: true },
  });
  res.json(user);
});

// PATCH /api/users/me
router.patch('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const { totalBudget } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { totalBudget: totalBudget != null ? parseFloat(totalBudget) : null },
    select: { id: true, email: true, inboxEmail: true, totalBudget: true },
  });
  res.json(user);
});

// POST /api/users/push-token
router.post('/push-token', async (req: AuthRequest, res: Response): Promise<void> => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: 'token es requerido' });
    return;
  }

  await prisma.user.update({
    where: { id: req.userId },
    data: { pushToken: token },
  });

  res.json({ ok: true });
});

export default router;
