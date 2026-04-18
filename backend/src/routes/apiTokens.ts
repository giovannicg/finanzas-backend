import { Router, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/tokens — listar tokens (sin mostrar el valor)
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const tokens = await prisma.apiToken.findMany({
    where: { userId: req.userId },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tokens);
});

// POST /api/tokens — crear token (devuelve el valor en texto plano UNA sola vez)
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name es requerido' });
    return;
  }

  const raw = 'fin_' + crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  const created = await prisma.apiToken.create({
    data: { userId: req.userId!, name: name.trim(), tokenHash: hash },
  });

  // El token en texto plano solo se devuelve aquí, nunca más
  res.status(201).json({ id: created.id, name: created.name, token: raw, createdAt: created.createdAt });
});

// DELETE /api/tokens/:id — revocar
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.apiToken.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Token no encontrado' });
    return;
  }
  await prisma.apiToken.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
