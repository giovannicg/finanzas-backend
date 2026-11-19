-- AlterTable: preferencias de moneda y progreso del onboarding
ALTER TABLE "User" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "User" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: clasificación del gasto y enlaces
ALTER TABLE "Transaction" ADD COLUMN "expenseType" TEXT NOT NULL DEFAULT 'VARIABLE';
ALTER TABLE "Transaction" ADD COLUMN "plannedEventId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "fixedExpenseId" TEXT;

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SALARY',
    "amount" DOUBLE PRECISION NOT NULL,
    "isVariable" BOOLEAN NOT NULL DEFAULT false,
    "conservativeAmount" DOUBLE PRECISION,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER,
    "receivedOn" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isVariableAmount" BOOLEAN NOT NULL DEFAULT false,
    "dayOfMonth" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GOAL',
    "targetAmount" DOUBLE PRECISION,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "monthlyContribution" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundMovement" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "plannedEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "yearlyRecurring" BOOLEAN NOT NULL DEFAULT true,
    "budgetAmount" DOUBLE PRECISION NOT NULL,
    "savedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fundId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Income_userId_idx" ON "Income"("userId");
CREATE INDEX "FixedExpense_userId_idx" ON "FixedExpense"("userId");
CREATE INDEX "Fund_userId_idx" ON "Fund"("userId");
CREATE INDEX "FundMovement_fundId_idx" ON "FundMovement"("fundId");
CREATE INDEX "FundMovement_plannedEventId_idx" ON "FundMovement"("plannedEventId");
CREATE INDEX "PlannedEvent_userId_idx" ON "PlannedEvent"("userId");
CREATE INDEX "PlannedEvent_userId_eventDate_idx" ON "PlannedEvent"("userId", "eventDate");
CREATE INDEX "Transaction_userId_expenseType_idx" ON "Transaction"("userId", "expenseType");
CREATE INDEX "Transaction_plannedEventId_idx" ON "Transaction"("plannedEventId");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundMovement" ADD CONSTRAINT "FundMovement_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundMovement" ADD CONSTRAINT "FundMovement_plannedEventId_fkey" FOREIGN KEY ("plannedEventId") REFERENCES "PlannedEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlannedEvent" ADD CONSTRAINT "PlannedEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlannedEvent" ADD CONSTRAINT "PlannedEvent_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_plannedEventId_fkey" FOREIGN KEY ("plannedEventId") REFERENCES "PlannedEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
