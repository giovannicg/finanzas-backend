import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

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
