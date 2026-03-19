import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendBudgetAlert({
  to,
  category,
  total,
  limit,
  pct,
  period,
}: {
  to: string;
  category: string;
  total: number;
  limit: number;
  pct: number;
  period: string;
}): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return;

  const exceeded = total >= limit;
  const periodLabel = period === 'weekly' ? 'semanal' : 'mensual';
  const subject = exceeded
    ? `⚠️ Límite superado: ${category}`
    : `🔔 Alerta de presupuesto: ${category}`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
      <h2 style="color:${exceeded ? '#ef4444' : '#f59e0b'};margin-top:0">${subject}</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        ${exceeded
          ? `Superaste tu presupuesto <strong>${periodLabel}</strong> de <strong>${category}</strong>.`
          : `Estás cerca de tu límite <strong>${periodLabel}</strong> de <strong>${category}</strong>.`
        }
      </p>
      <div style="background:#fff;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #e5e7eb">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:#6b7280;font-size:14px">Gastado</span>
          <span style="font-weight:700;color:#111827">$${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <span style="color:#6b7280;font-size:14px">Límite</span>
          <span style="font-weight:700;color:#111827">$${limit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
        </div>
        <div style="background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden">
          <div style="background:${exceeded ? '#ef4444' : '#f59e0b'};height:100%;width:${Math.min(pct, 100)}%"></div>
        </div>
        <p style="text-align:right;font-size:13px;color:${exceeded ? '#ef4444' : '#f59e0b'};font-weight:700;margin:6px 0 0">${pct}%</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-bottom:0">Finanzas · notificación automática</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}
