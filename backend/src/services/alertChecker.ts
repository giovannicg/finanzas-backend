import { PrismaClient } from '@prisma/client';
import { sendBudgetAlert } from './emailService';

const prisma = new PrismaClient();

export async function checkAlerts(userId: string, category: string): Promise<void> {
  const alerts = await prisma.alert.findMany({
    where: { userId, category, active: true },
  });

  if (alerts.length === 0) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, pushToken: true },
  });

  if (!user) return;

  for (const alert of alerts) {
    const now = new Date();
    const periodStart =
      alert.period === 'weekly'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
        : new Date(now.getFullYear(), now.getMonth(), 1);

    const { _sum } = await prisma.transaction.aggregate({
      where: { userId, category, date: { gte: periodStart } },
      _sum: { amount: true },
    });

    const total = _sum.amount ?? 0;
    const pct = Math.round((total / alert.limitAmount) * 100);

    if (pct < 80) continue;

    const exceeded = total >= alert.limitAmount;

    // Push notification (Expo)
    if (user.pushToken) {
      await sendPushNotification(user.pushToken, {
        title: exceeded ? `⚠️ Límite superado: ${category}` : `🔔 Alerta: ${category}`,
        body: exceeded
          ? `Gastaste $${total.toFixed(2)} de $${alert.limitAmount} (${pct}%)`
          : `Llevas $${total.toFixed(2)} de $${alert.limitAmount} (${pct}%)`,
      });
    }

    // Email notification
    try {
      await sendBudgetAlert({
        to: user.email,
        category,
        total,
        limit: alert.limitAmount,
        pct,
        period: alert.period,
      });
    } catch (e) {
      console.error('[email] Error enviando alerta:', e);
    }
  }
}

async function sendPushNotification(
  token: string,
  message: { title: string; body: string }
): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, sound: 'default', ...message }),
    });
  } catch (e) {
    console.error('[push] Error enviando notificación:', e);
  }
}
