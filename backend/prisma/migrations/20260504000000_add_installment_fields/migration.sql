-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "installments" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "installmentNumber" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "installmentGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_installmentGroupId_idx" ON "Transaction"("installmentGroupId");
