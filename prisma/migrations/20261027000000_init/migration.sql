-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW_DISCOVERED', 'AUDITED', 'QUALIFIED', 'CONTACT_READY', 'OUTREACH_SENT', 'IN_DISCUSSION', 'CONVERTED', 'UNQUALIFIED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('FULL_SCAN', 'PSI_ONLY', 'HTTP_HEAD_ONLY');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('PERFORMANCE', 'MOBILE_UX', 'SEO_FOUNDATION', 'SECURITY_SSL', 'TECHNICAL_ERROR');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('EMAIL', 'PHONE', 'ZALO', 'FACEBOOK_PAGE', 'WEBSITE_FORM', 'ADDRESS');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('EMAIL', 'ZALO_MANUAL', 'PHONE_SCRIPT');

-- CreateEnum
CREATE TYPE "OutreachDraftStatus" AS ENUM ('DRAFT', 'READY_TO_SEND', 'SENT_MANUAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutreachEventType" AS ENUM ('DRAFT_CREATED', 'DRAFT_REVIEWED', 'MANUALLY_SENT', 'CLIENT_REPLIED', 'MEETING_SCHEDULED', 'DECLINED', 'BOUNCED_NO_REPLY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Đà Nẵng',
    "district" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "normalizedDomain" VARCHAR(255) NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "dataSource" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NEW_DISCOVERED',
    "opportunityScore" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_audits" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "auditType" "AuditType" NOT NULL DEFAULT 'FULL_SCAN',
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "performanceScore" INTEGER,
    "seoScore" INTEGER,
    "accessibilityScore" INTEGER,
    "bestPracticesScore" INTEGER,
    "loadTimeMs" INTEGER,
    "httpStatusCode" INTEGER,
    "isHttps" BOOLEAN,
    "isMobileFriendly" BOOLEAN,
    "lcpMs" DOUBLE PRECISION,
    "clsScore" DOUBLE PRECISION,
    "inpMs" DOUBLE PRECISION,
    "fcpMs" DOUBLE PRECISION,
    "ttfbMs" DOUBLE PRECISION,
    "rawDataJson" JSONB,
    "errorMessage" TEXT,
    "auditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_findings" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "impactExplanation" TEXT NOT NULL,
    "recommendedSolution" TEXT NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_points" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "personName" TEXT,
    "roleTitle" TEXT,
    "source" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_drafts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "personalizedPointers" JSONB,
    "status" "OutreachDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_events" (
    "id" TEXT NOT NULL,
    "draftId" TEXT,
    "businessId" TEXT NOT NULL,
    "eventType" "OutreachEventType" NOT NULL,
    "notes" TEXT,
    "loggedByUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_normalizedDomain_key" ON "businesses"("normalizedDomain");

-- CreateIndex
CREATE INDEX "businesses_normalizedDomain_idx" ON "businesses"("normalizedDomain");

-- CreateIndex
CREATE INDEX "businesses_industry_city_idx" ON "businesses"("industry", "city");

-- CreateIndex
CREATE INDEX "businesses_opportunityScore_idx" ON "businesses"("opportunityScore" DESC);

-- CreateIndex
CREATE INDEX "businesses_leadStatus_idx" ON "businesses"("leadStatus");

-- CreateIndex
CREATE INDEX "website_audits_businessId_createdAt_idx" ON "website_audits"("businessId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "website_audits_auditedAt_idx" ON "website_audits"("auditedAt");

-- CreateIndex
CREATE INDEX "audit_findings_businessId_idx" ON "audit_findings"("businessId");

-- CreateIndex
CREATE INDEX "audit_findings_severity_idx" ON "audit_findings"("severity");

-- CreateIndex
CREATE INDEX "audit_findings_status_idx" ON "audit_findings"("status");

-- CreateIndex
CREATE INDEX "contact_points_businessId_idx" ON "contact_points"("businessId");

-- CreateIndex
CREATE INDEX "contact_points_doNotContact_idx" ON "contact_points"("doNotContact");

-- CreateIndex
CREATE INDEX "outreach_drafts_businessId_idx" ON "outreach_drafts"("businessId");

-- CreateIndex
CREATE INDEX "outreach_drafts_status_idx" ON "outreach_drafts"("status");

-- CreateIndex
CREATE INDEX "outreach_events_businessId_idx" ON "outreach_events"("businessId");

-- CreateIndex
CREATE INDEX "outreach_events_draftId_idx" ON "outreach_events"("draftId");

-- AddForeignKey
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "website_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "outreach_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_loggedByUserId_fkey" FOREIGN KEY ("loggedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
