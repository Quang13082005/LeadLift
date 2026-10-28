import { normalizeDomain } from '../src/lib/domain-normalizer';

function runFoundationTests() {
  console.log('🧪 Starting LeadLift Foundation Tests...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // Domain Normalization Tests
  console.log('--- Test Suite: Domain Normalizer ---');
  assert(
    normalizeDomain('https://www.thuexemaydanang.vn/bang-gia') === 'thuexemaydanang.vn',
    'Strip https://, www., and path'
  );
  assert(
    normalizeDomain('http://KHACHSAN-BIEN.COM/') === 'khachsan-bien.com',
    'Lowercase and strip trailing slash'
  );
  assert(
    normalizeDomain('thuexegiare.vn?utm_source=google') === 'thuexegiare.vn',
    'Handle raw domain without protocol and strip query string'
  );
  assert(
    normalizeDomain('https://sub.domain.danang.vn:8080/path#hash') === 'sub.domain.danang.vn',
    'Handle subdomain, port, and hash'
  );
  assert(normalizeDomain('') === '', 'Handle empty string safely');

  console.log(`\n========================================`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFoundationTests();
