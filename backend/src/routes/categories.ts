import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/categories
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const categories = await prisma.category.findMany({
    where: { userId: req.userId },
    orderBy: { name: 'asc' },
  });
  res.json(categories);
});

// POST /api/categories
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, color } = req.body;

  if (!name?.trim()) {
    res.status(400).json({ error: 'name es requerido' });
    return;
  }

  const existing = await prisma.category.findUnique({
    where: { userId_name: { userId: req.userId!, name: name.trim() } },
  });

  if (existing) {
    res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    return;
  }

  const category = await prisma.category.create({
    data: {
      userId: req.userId!,
      name: name.trim(),
      color: color || '#64748B',
    },
  });

  res.status(201).json(category);
});

// PATCH /api/categories/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.category.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Categoría no encontrada' });
    return;
  }

  const { name, color } = req.body;
  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(color ? { color } : {}),
    },
  });

  res.json(category);
});

// DELETE /api/categories/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.category.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Categoría no encontrada' });
    return;
  }

  await prisma.category.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
