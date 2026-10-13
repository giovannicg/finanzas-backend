import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { background } from '../lib/background';
import { extractSMSText, extractInboxEmail } from '../services/emailParser';
import { parseSMS } from '../services/smsParser';
import { categorize } from '../services/categorizer';
import { syncToNotion } from '../services/notionSync';
import { checkAlerts } from '../services/alertChecker';

const router = Router();

// Atajos de iPhone en español puede mandar "-0,1807" (coma decimal) o números como texto.
function parseCoord(value: unknown, max: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

/**
 * POST /api/webhook/sms
 * Called directly from iPhone Shortcuts when an SMS arrives.
 * Body: { token: string (JWT o fin_...), text: string (SMS content),
 *         lat?, lng?: number | string, location?: string (dirección) }
 */
router.post('/sms', async (req: Request, res: Response): Promise<void> => {
  const { token, text, lat, lng, location } = req.body;

  if (!token || !text) {
    res.status(400).json({ error: 'token y text son requeridos' });
    return;
  }

  let userId: string;
  if (token.startsWith('fin_')) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const apiToken = await prisma.apiToken.findUnique({ where: { tokenHash: hash } });
    if (!apiToken) {
      res.status(401).json({ error: 'API token inválido' });
      return;
    }
    background(prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }));
    userId = apiToken.userId;
  } else {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      userId = payload.userId;
    } catch {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }
  }

  const parsed = parseSMS(text.trim());
  if (!parsed) {
    res.status(200).json({ message: 'No se pudo parsear el SMS' });
    return;
  }

  const category = categorize(parsed.merchant, parsed.rawText);

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      amount: parsed.amount,
      merchant: parsed.merchant,
      cardLast4: parsed.cardLast4,
      category,
      rawText: parsed.rawText,
      date: parsed.date,
      latitude: parseCoord(lat, 90),
      longitude: parseCoord(lng, 180),
      locationName: typeof location === 'string' && location.trim() ? location.trim().slice(0, 300) : null,
    },
  });

  await checkAlerts(userId, category);
  background(syncToNotion({ amount: parsed.amount, merchant: parsed.merchant, category, cardLast4: parsed.cardLast4, date: parsed.date, rawText: parsed.rawText }));

  res.status(200).json({ transactionId: transaction.id, category, amount: parsed.amount, merchant: parsed.merchant });
});

/**
 * POST /api/webhook/email
 * Receives SendGrid Inbound Parse payload (multipart/form-data or JSON).
 * SendGrid sends: from, to, subject, text, html, envelope, etc.
 */
router.post('/email', async (req: Request, res: Response): Promise<void> => {
  // SendGrid sends form-data; express parses it via multer or urlencoded middleware
  const { from, to, subject, text } = req.body;

  if (!to || !text) {
    res.status(400).json({ error: 'Payload incompleto' });
    return;
  }

  const inboxEmail = extractInboxEmail(to);

  // Find the user who owns this inbox email
  const user = await prisma.user.findUnique({ where: { inboxEmail } });
  if (!user) {
    // Acknowledge to SendGrid even if we don't recognize the address
    res.status(200).json({ message: 'Usuario no encontrado, ignorado' });
    return;
  }

  const smsText = extractSMSText({ from, to, subject: subject || '', text });

  if (!smsText) {
    res.status(200).json({ message: 'No se encontró texto de SMS' });
    return;
  }

  const parsed = parseSMS(smsText);
  if (!parsed) {
    console.log(`[webhook] No se pudo parsear SMS para ${inboxEmail}: "${smsText}"`);
    res.status(200).json({ message: 'No se pudo parsear el SMS' });
    return;
  }

  const category = categorize(parsed.merchant, parsed.rawText);

  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      amount: parsed.amount,
      merchant: parsed.merchant,
      cardLast4: parsed.cardLast4,
      category,
      rawText: parsed.rawText,
      date: parsed.date,
    },
  });

  // Check alerts
  await checkAlerts(user.id, category);

  // Sync to Notion (optional, only if configured)
  background(syncToNotion({ amount: parsed.amount, merchant: parsed.merchant, category, cardLast4: parsed.cardLast4, date: parsed.date, rawText: parsed.rawText }));

  res.status(200).json({ transactionId: transaction.id });
});

export default router;
