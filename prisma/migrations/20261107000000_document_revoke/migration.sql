-- AlterTable
ALTER TABLE "IssuedDocument" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedByUserId" TEXT,
ADD COLUMN     "revokedReason" TEXT;

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

