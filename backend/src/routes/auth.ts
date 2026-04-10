import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { writeLog } from '../services/logger';

const router = Router();
const prisma = new PrismaClient();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email y contraseña requeridos' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' });
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  const userId = uuidv4();
  const domain = process.env.INBOX_DOMAIN || 'inbox.finanzas.app';
  const inboxEmail = `user_${userId.slice(0, 8)}@${domain}`;

  const user = await prisma.user.create({
    data: { id: userId, email, password: hashed, inboxEmail },
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, inboxEmail: user.inboxEmail },
  });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email y contraseña requeridos' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    writeLog({ type: 'AUTH', level: 'WARN', message: `Login fallido: email no encontrado (${email})`, meta: { email } }).catch(() => {});
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    writeLog({ type: 'AUTH', level: 'WARN', userId: user.id, message: `Login fallido: contraseña incorrecta (${email})`, meta: { email } }).catch(() => {});
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });

  writeLog({ type: 'AUTH', level: 'INFO', userId: user.id, message: `Login exitoso (${email})`, meta: { email } }).catch(() => {});

  res.json({
    token,
    user: { id: user.id, email: user.email, inboxEmail: user.inboxEmail },
  });
});

export default router;
