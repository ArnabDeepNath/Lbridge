-- Sales Channel account connections, contextual feeds, and directory catalog.
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('CONNECTING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "directoryUrl" TEXT NOT NULL,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'CONNECTING',
    "channelId" TEXT,
    "channelHandle" TEXT,
    "storefrontTokenId" TEXT,
    "storefrontAccessToken" TEXT,
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductFeed" (
    "feedId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "country" TEXT,
    "language" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastFullSyncAt" TIMESTAMP(3),
    "lastFullSyncCount" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFeed_pkey" PRIMARY KEY ("feedId")
);

CREATE TABLE "DirectoryProduct" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "country" TEXT,
    "language" TEXT,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "description" TEXT,
    "onlineStoreUrl" TEXT,
    "imageUrl" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "validationMessages" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB NOT NULL,
    "productUpdatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectoryProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectoryVariant" (
    "id" TEXT NOT NULL,
    "directoryProductId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "priceAmount" TEXT NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "compareAtPriceAmount" TEXT,
    "quantityAvailable" INTEGER NOT NULL DEFAULT 0,
    "availableForSale" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,

    CONSTRAINT "DirectoryVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelConnection_shopDomain_key" ON "ChannelConnection"("shopDomain");
CREATE UNIQUE INDEX "ChannelConnection_channelId_key" ON "ChannelConnection"("channelId");
CREATE INDEX "ChannelConnection_status_idx" ON "ChannelConnection"("status");
CREATE INDEX "ProductFeed_shopDomain_idx" ON "ProductFeed"("shopDomain");
CREATE UNIQUE INDEX "DirectoryProduct_shopDomain_feedId_productId_key" ON "DirectoryProduct"("shopDomain", "feedId", "productId");
CREATE INDEX "DirectoryProduct_shopDomain_isPublished_idx" ON "DirectoryProduct"("shopDomain", "isPublished");
CREATE INDEX "DirectoryProduct_productId_idx" ON "DirectoryProduct"("productId");
CREATE UNIQUE INDEX "DirectoryVariant_directoryProductId_variantId_key" ON "DirectoryVariant"("directoryProductId", "variantId");
CREATE INDEX "DirectoryVariant_variantId_idx" ON "DirectoryVariant"("variantId");

ALTER TABLE "DirectoryVariant" ADD CONSTRAINT "DirectoryVariant_directoryProductId_fkey" FOREIGN KEY ("directoryProductId") REFERENCES "DirectoryProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
