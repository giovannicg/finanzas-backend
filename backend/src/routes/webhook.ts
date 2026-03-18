import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { extractSMSText, extractInboxEmail } from '../services/emailParser';
import { parseSMS } from '../services/smsParser';
import { categorize } from '../services/categorizer';
import { syncToNotion } from '../services/notionSync';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/webhook/sms
 * Called directly from iPhone Shortcuts when an SMS arrives.
 * Body: { token: string (JWT), text: string (SMS content) }
 */
router.post('/sms', async (req: Request, res: Response): Promise<void> => {
  const { token, text } = req.body;

  if (!token || !text) {
    res.status(400).json({ error: 'token y text son requeridos' });
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    userId = payload.userId;
  } catch {
    res.status(401).json({ error: 'Token inválido' });
    return;
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
    },
  });

  await checkAlerts(userId, category, transaction.id);
  syncToNotion({ amount: parsed.amount, merchant: parsed.merchant, category, cardLast4: parsed.cardLast4, date: parsed.date, rawText: parsed.rawText });

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
  await checkAlerts(user.id, category, transaction.id);

  // Sync to Notion (optional, only if configured)
  syncToNotion({ amount: parsed.amount, merchant: parsed.merchant, category, cardLast4: parsed.cardLast4, date: parsed.date, rawText: parsed.rawText });

  res.status(200).json({ transactionId: transaction.id });
});

async function checkAlerts(userId: string, category: string, _transactionId: string): Promise<void> {
  const alerts = await prisma.alert.findMany({
    where: { userId, category, active: true },
  });

  if (alerts.length === 0) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });

  for (const alert of alerts) {
    const now = new Date();
    const periodStart = alert.period === 'weekly'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const { _sum } = await prisma.transaction.aggregate({
      where: { userId, category, date: { gte: periodStart } },
      _sum: { amount: true },
    });

    const total = _sum.amount ?? 0;
    const pct = Math.round((total / alert.limitAmount) * 100);

    // Notify at 80% and 100%
    if (pct >= 80 && user?.pushToken) {
      const exceeded = total >= alert.limitAmount;
      await sendPushNotification(user.pushToken, {
        title: exceeded ? `⚠️ Límite superado: ${category}` : `🔔 Alerta: ${category}`,
        body: exceeded
          ? `Gastaste $${total.toFixed(2)} de $${alert.limitAmount} (${pct}%)`
          : `Llevas $${total.toFixed(2)} de $${alert.limitAmount} (${pct}%)`,
      });
    }
  }
}

async function sendPushNotification(token: string, message: { title: string; body: string }): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: message.title,
        body: message.body,
      }),
    });
  } catch (e) {
    console.error('[push] Error enviando notificación:', e);
  }
}

export default router;
