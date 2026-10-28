# LeadLift — Website Lead Discovery & Outreach System

LeadLift is a Website Lead Discovery & Outreach System designed to help freelancers and digital agencies discover local businesses with improvable websites (performance, mobile UX, SEO, SSL), calculate objective opportunity scores, and generate personalized, fact-based outreach drafts.

---

## 1. Project Technology Stack (Foundation)

- **Framework:** Next.js 16.4.3 (App Router, Turbopack)
- **Runtime:** Node.js v24.15.0
- **Language:** TypeScript 5.9.3 (Strict Mode)
- **Styling:** Tailwind CSS v4
- **ORM:** Prisma ORM 7.10.1 (via `prisma7.config.ts`)
- **Database:** Neon PostgreSQL Cloud (Serverless) via `@prisma/adapter-neon`

---

## 2. Getting Started (Local Development)

### Step 1: Clone & Install Dependencies
```bash
git clone <repository-url>
cd LeadLift
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Open `.env` and configure your **Neon PostgreSQL** credentials:
```env
# Connection pooled URL (used by the application runtime)
DATABASE_URL="postgresql://[user]:[password]@[endpoint]-pooler.[region].aws.neon.tech/[dbname]?sslmode=require"

# Direct unpooled URL (used by Prisma CLI for migrations)
DATABASE_URL_UNPOOLED="postgresql://[user]:[password]@[endpoint].[region].aws.neon.tech/[dbname]?sslmode=require"
```

### Step 3: Run Database Migrations
Once your Neon credentials are in `.env`, apply the initial schema migration:
```bash
npx prisma migrate dev
```

To inspect database records in your browser:
```bash
npx prisma studio
```

### Step 4: Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

To verify system & database health:
[http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 3. Quality Assurance Commands

- **Run Unit Tests:** `npm run test:foundation`
- **Type Checking:** `npm run type-check`
- **Linting:** `npm run lint`
- **Production Build:** `npm run build`
- **Prisma Schema Validation:** `npx prisma validate`

---

## 4. Current Milestone Status

- **CP01A — FOUNDATION & DATABASE ONLY:** Completed.
- **Frontend Design:** NOT STARTED (Pending Project Owner & PM approval).
