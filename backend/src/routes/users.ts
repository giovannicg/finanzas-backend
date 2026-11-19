import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const PROFILE_FIELDS = {
  id: true,
  email: true,
  inboxEmail: true,
  totalBudget: true,
  currency: true,
  locale: true,
  onboardingStep: true,
} as const;

/** Moneda → locale por defecto, para formatear importes en el frontend. */
const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  EUR: 'es-ES',
  MXN: 'es-MX',
  GBP: 'en-GB',
  COP: 'es-CO',
  ARS: 'es-AR',
};

// GET /api/users/me
router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: PROFILE_FIELDS,
  });
  res.json(user);
});

// PATCH /api/users/me
router.patch('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const { totalBudget, currency, locale, onboardingStep } = req.body;

  if (currency !== undefined && !/^[A-Z]{3}$/.test(String(currency))) {
    res.status(400).json({ error: 'currency debe ser un código ISO de 3 letras, p. ej. USD' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(totalBudget !== undefined
        ? { totalBudget: totalBudget != null ? parseFloat(totalBudget) : null }
        : {}),
      ...(currency !== undefined
        ? {
            currency,
            // Si el usuario no fija un locale, se deduce de la moneda.
            ...(locale === undefined ? { locale: CURRENCY_LOCALES[currency] ?? 'en-US' } : {}),
          }
        : {}),
      ...(locale !== undefined ? { locale } : {}),
      ...(onboardingStep !== undefined ? { onboardingStep: parseInt(onboardingStep) } : {}),
    },
    select: PROFILE_FIELDS,
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
