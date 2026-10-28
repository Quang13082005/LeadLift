import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const startTime = Date.now();
  let dbStatus = 'disconnected';
  let dbLatencyMs: number | null = null;

  try {
    const dbStart = Date.now();
    // Ping database using lightweight SELECT 1
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error_or_not_configured';
  }

  const isHealthy = dbStatus === 'connected';

  return NextResponse.json(
    {
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'leadlift-core',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      durationMs: Date.now() - startTime,
    },
    {
      status: isHealthy ? 200 : 503,
    }
  );
}
