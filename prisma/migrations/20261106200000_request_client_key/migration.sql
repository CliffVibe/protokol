-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Request_studentId_clientKey_key" ON "Request"("studentId", "clientKey");

