import 'dotenv/config';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Ensure Neon WebSocket constructor is available in Node.js runtime
if (typeof window === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/leadlift_placeholder?sslmode=require';

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

function createPrismaClient(): InstanceType<typeof PrismaClient> {
  const adapter = new PrismaNeon({
    connectionString,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@/generated/prisma/client';
