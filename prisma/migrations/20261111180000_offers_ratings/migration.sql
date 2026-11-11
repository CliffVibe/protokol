-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "youSaid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "offered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingComment" TEXT;

-- CreateTable
CREATE TABLE "OfferDismissal" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfferDismissal_studentId_code_semester_key" ON "OfferDismissal"("studentId", "code", "semester");

-- AddForeignKey
ALTER TABLE "OfferDismissal" ADD CONSTRAINT "OfferDismissal_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
