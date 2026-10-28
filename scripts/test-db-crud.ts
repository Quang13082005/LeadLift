import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/lib/prisma';
import { normalizeDomain } from '../src/lib/domain-normalizer';

async function testPrismaClientCrud() {
  console.log('🧪 Testing Prisma Client with Neon Pooled Connection...\n');

  try {
    // 1. Connection Ping
    const pingStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const pingLatency = Date.now() - pingStart;
    console.log(`✅ Database ping successful (Latency: ${pingLatency}ms)`);

    // 2. Safe isolated test record creation
    const testDomain = 'test-verification-temp.vn';
    const normalized = normalizeDomain(testDomain);

    const createdBiz = await prisma.business.create({
      data: {
        name: 'LeadLift Test Verification Cơ Sở',
        industry: 'Cho thuê xe máy',
        city: 'Đà Nẵng',
        district: 'Sơn Trà',
        websiteUrl: 'https://test-verification-temp.vn',
        normalizedDomain: normalized,
        dataSource: 'VERIFICATION_SCRIPT',
        leadStatus: 'NEW_DISCOVERED',
      },
    });
    console.log(`✅ Created test business record: id=${createdBiz.id}, normalizedDomain=${createdBiz.normalizedDomain}`);

    // 3. Read back
    const found = await prisma.business.findUnique({
      where: { id: createdBiz.id },
    });
    console.log(`✅ Read test record successfully: name="${found?.name}"`);

    // 4. Delete cleanup - Ensure ZERO dirty test data left
    await prisma.business.delete({
      where: { id: createdBiz.id },
    });
    console.log(`🧹 Cleaned up test record: Database remains 100% clean.\n`);

    console.log('🎉 Prisma Client CRUD & Pooled Connection: ALL PASS!');
  } catch (err: unknown) {
    console.error('❌ Prisma Client test failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaClientCrud();
