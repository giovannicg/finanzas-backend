import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type LogType = 'AUTH' | 'TRANSACTION' | 'REQUEST' | 'ERROR';
type LogLevel = 'INFO' | 'WARN' | 'ERROR';

interface LogParams {
  type: LogType;
  level?: LogLevel;
  userId?: string;
  method?: string;
  path?: string;
  status?: number;
  duration?: number;
  message: string;
  meta?: Record<string, unknown>;
}

export async function writeLog(params: LogParams): Promise<void> {
  await prisma.log.create({
    data: {
      type: params.type,
      level: params.level ?? 'INFO',
      userId: params.userId ?? null,
      method: params.method ?? null,
      path: params.path ?? null,
      status: params.status ?? null,
      duration: params.duration ?? null,
      message: params.message,
      meta: params.meta ? JSON.parse(JSON.stringify(params.meta)) : undefined,
    },
  }).catch((e) => console.error('[logger] Error escribiendo log:', e));
}
