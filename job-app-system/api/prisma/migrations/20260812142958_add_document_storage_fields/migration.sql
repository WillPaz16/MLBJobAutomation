-- AlterTable
ALTER TABLE "Document" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Document" ADD COLUMN "originalFilename" TEXT;
ALTER TABLE "Document" ADD COLUMN "sha256" TEXT;
ALTER TABLE "Document" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "Document" ADD COLUMN "sourcePath" TEXT;
ALTER TABLE "Document" ADD COLUMN "storageKey" TEXT;
