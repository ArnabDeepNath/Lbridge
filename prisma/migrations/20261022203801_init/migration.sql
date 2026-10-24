-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'PAUSED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "BrandOrderStatus" AS ENUM ('PENDING', 'TRANSFERRED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'FAILED', 'LB_CANCELLED', 'BRAND_CANCELLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundSource" AS ENUM ('LBEAUTY', 'BRAND');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'DEAD');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "currency" TEXT,
    "status" "BrandStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "vendorName" TEXT,
    "commissionBps" INTEGER NOT NULL DEFAULT 1000,
    "mappedVariantCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedAt" TIMESTAMP(3),
    "matchReport" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "uninstalledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantMapping" (
    "id" TEXT NOT NULL,
    "lbVariantId" TEXT NOT NULL,
    "lbProductId" TEXT,
    "brandId" TEXT NOT NULL,
    "brandVariantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "matchedBy" TEXT NOT NULL DEFAULT 'SKU',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LbOrder" (
    "lbOrderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "payload" JSONB,
    "routedAt" TIMESTAMP(3),
    "unroutedLineCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LbOrder_pkey" PRIMARY KEY ("lbOrderId")
);

-- CreateTable
CREATE TABLE "BrandOrder" (
    "id" TEXT NOT NULL,
    "lbOrderId" TEXT NOT NULL,
    "lbOrderName" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "status" "BrandOrderStatus" NOT NULL DEFAULT 'PENDING',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "brandOrderId" TEXT,
    "brandOrderName" TEXT,
    "currency" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "transferInput" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "transferredAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandOrderLine" (
    "id" TEXT NOT NULL,
    "brandOrderId" TEXT NOT NULL,
    "lbLineItemId" TEXT NOT NULL,
    "lbVariantId" TEXT NOT NULL,
    "brandVariantId" TEXT NOT NULL,
    "brandLineItemId" TEXT,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "lineTotalMinor" INTEGER NOT NULL,
    "fulfilledQty" INTEGER NOT NULL DEFAULT 0,
    "refundedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BrandOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentLink" (
    "id" TEXT NOT NULL,
    "brandOrderId" TEXT NOT NULL,
    "brandFulfillmentId" TEXT NOT NULL,
    "lbFulfillmentId" TEXT,
    "status" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "trackingCompany" TEXT,
    "trackingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRecord" (
    "id" TEXT NOT NULL,
    "brandOrderId" TEXT NOT NULL,
    "source" "RefundSource" NOT NULL,
    "externalRefundId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "brandOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_shopDomain_key" ON "Brand"("shopDomain");

-- CreateIndex
CREATE INDEX "Brand_status_idx" ON "Brand"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VariantMapping_lbVariantId_key" ON "VariantMapping"("lbVariantId");

-- CreateIndex
CREATE INDEX "VariantMapping_brandId_idx" ON "VariantMapping"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandOrder_brandOrderId_key" ON "BrandOrder"("brandOrderId");

-- CreateIndex
CREATE INDEX "BrandOrder_brandId_createdAt_idx" ON "BrandOrder"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "BrandOrder_status_createdAt_idx" ON "BrandOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BrandOrder_createdAt_idx" ON "BrandOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrandOrder_lbOrderId_brandId_key" ON "BrandOrder"("lbOrderId", "brandId");

-- CreateIndex
CREATE INDEX "BrandOrderLine_brandOrderId_idx" ON "BrandOrderLine"("brandOrderId");

-- CreateIndex
CREATE INDEX "BrandOrderLine_lbLineItemId_idx" ON "BrandOrderLine"("lbLineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentLink_brandFulfillmentId_key" ON "FulfillmentLink"("brandFulfillmentId");

-- CreateIndex
CREATE INDEX "FulfillmentLink_brandOrderId_idx" ON "FulfillmentLink"("brandOrderId");

-- CreateIndex
CREATE INDEX "RefundRecord_brandOrderId_idx" ON "RefundRecord"("brandOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRecord_source_externalRefundId_brandOrderId_key" ON "RefundRecord"("source", "externalRefundId", "brandOrderId");

-- CreateIndex
CREATE INDEX "OrderEvent_brandOrderId_createdAt_idx" ON "OrderEvent"("brandOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- AddForeignKey
ALTER TABLE "VariantMapping" ADD CONSTRAINT "VariantMapping_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandOrder" ADD CONSTRAINT "BrandOrder_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandOrder" ADD CONSTRAINT "BrandOrder_lbOrderId_fkey" FOREIGN KEY ("lbOrderId") REFERENCES "LbOrder"("lbOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandOrderLine" ADD CONSTRAINT "BrandOrderLine_brandOrderId_fkey" FOREIGN KEY ("brandOrderId") REFERENCES "BrandOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentLink" ADD CONSTRAINT "FulfillmentLink_brandOrderId_fkey" FOREIGN KEY ("brandOrderId") REFERENCES "BrandOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_brandOrderId_fkey" FOREIGN KEY ("brandOrderId") REFERENCES "BrandOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_brandOrderId_fkey" FOREIGN KEY ("brandOrderId") REFERENCES "BrandOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
