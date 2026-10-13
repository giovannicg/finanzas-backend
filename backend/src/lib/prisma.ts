import { PrismaClient } from '@prisma/client';

// Un solo cliente para toda la app: en serverless cada instancia abre su propio pool,
// así que varios PrismaClient multiplican las conexiones a la BD.
export const prisma = new PrismaClient();
