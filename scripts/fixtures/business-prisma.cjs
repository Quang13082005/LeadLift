/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload must run before Next.js initializes. */
/* Test-only in-memory Prisma substitute. Never connects to a database. */
const assert = require('node:assert/strict');
const state = {
  rows: /** @type {import('../../src/generated/prisma/client').Business[]} */ ([]),
  calls: /** @type {{method: string, args: unknown}[]} */ ([]),
  failure: false,
  races: new Set(),
};
const date = new Date('2026-10-28T05:00:00.000Z');
function record(data) {
  return { id: `qa-${state.rows.length + 1}`, category: null, address: null, district: null, phone: null, email: null, notes: null, dataSource: 'QA_FIXTURE_MEMORY_ONLY', collectedAt: date, createdAt: date, updatedAt: date, leadStatus: 'NEW_DISCOVERED', opportunityScore: null, ...data };
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every((condition) => matches(row, condition));
    if (key === 'OR') return value.some((condition) => matches(row, condition));
    if (value && typeof value === 'object') {
      if ('contains' in value) return String(row[key]).toLowerCase().includes(value.contains.toLowerCase());
      if ('in' in value) return value.in.includes(row[key]);
      if ('lt' in value) return row[key] !== null && row[key] < value.lt;
    }
    return row[key] === value;
  });
}
function call(method, args) {
  // Regression guard: a circular Prisma filter must fail, not be hidden.
  state.calls.push({ method, args: structuredClone(args ?? {}) });
  JSON.stringify(args);
  if (state.failure) throw new Error('Mock storage unavailable; sensitive-driver-detail');
}
function uniqueError() { return Object.assign(new Error('Mock unique constraint'), { code: 'P2002' }); }
const business = {
  async findMany(args = {}) {
    call('findMany', args);
    let rows = state.rows.filter((row) => matches(row, args.where));
    if (args.orderBy) rows = rows.toSorted((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    return rows.slice(args.skip ?? 0, args.take ? (args.skip ?? 0) + args.take : undefined);
  },
  async count(args = {}) { call('count', args); return state.rows.filter((row) => matches(row, args.where)).length; },
  async findUnique(args) { call('findUnique', args); return state.rows.find((row) => matches(row, args.where)) ?? null; },
  async create({ data }) {
    call('create', { data });
    if (state.races.has(data.normalizedDomain) || state.rows.some((row) => row.normalizedDomain === data.normalizedDomain)) throw uniqueError();
    const row = record(data); state.rows.push(row); return row;
  },
  async update({ where, data }) {
    call('update', { where, data });
    const index = state.rows.findIndex((row) => matches(row, where));
    if (index < 0) throw Object.assign(new Error('Mock missing row'), { code: 'P2025' });
    if (state.races.has(data.normalizedDomain) || state.rows.some((row, i) => i !== index && row.normalizedDomain === data.normalizedDomain)) throw uniqueError();
    state.rows[index] = { ...state.rows[index], ...data }; return state.rows[index];
  },
  async createManyAndReturn(args) {
    call('createManyAndReturn', args);
    assert.equal(args.skipDuplicates, true);
    const added = [];
    for (const data of args.data) {
      if (state.races.has(data.normalizedDomain) || state.rows.some((row) => row.normalizedDomain === data.normalizedDomain)) continue;
      const row = record(data); state.rows.push(row); added.push({ normalizedDomain: row.normalizedDomain });
    }
    return added;
  },
};
const client = new Proxy({ business, $queryRaw: async () => { throw new Error('QA fixture has no database connection'); } }, {
  get(target, key) { if (key in target) return target[key]; throw new Error(`Unmocked Prisma operation: ${String(key)}`); },
});
function reset(rows = []) { state.rows = rows.map(record); state.calls = []; state.failure = false; state.races.clear(); }
function seed() {
  reset(Array.from({ length: 14 }, (_, index) => record({ id: `qa-${String(index + 1).padStart(2, '0')}`, name: `[QA FIXTURE] Doanh nghiệp ${index + 1}`, websiteUrl: `https://qa-${index + 1}.example/`, normalizedDomain: `qa-${index + 1}.example`, industry: index % 2 ? 'Khách sạn' : 'Quán cà phê', city: index % 2 ? 'Hội An' : 'Đà Nẵng', district: 'Hải Châu', notes: 'Dữ liệu QA trong RAM. Không tồn tại trên Neon.' })));
}
module.exports = { state, client, reset, seed };

// Explicit preloader for isolated browser QA; no application code has this switch.
if (process.env.LEADLIFT_MEMORY_QA === '1') {
  process.env.DATABASE_URL = 'postgresql://qa:qa@127.0.0.1:1/never_connect';
  globalThis.prisma = client;
  seed();
}

