-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'savings',
    "institution" TEXT,
    "last4Digits" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "balance" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("balance", "createdAt", "currency", "id", "isActive", "name", "type", "updatedAt", "userId") SELECT "balance", "createdAt", "currency", "id", "isActive", "name", "type", "updatedAt", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_userId_institution_last4Digits_key" ON "Account"("userId", "institution", "last4Digits");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'expense',
    "amount" REAL NOT NULL,
    "merchant" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "transactionTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT,
    "accountId" TEXT,
    "toAccountId" TEXT,
    "channel" TEXT,
    "externalOrderId" TEXT,
    "createdById" TEXT NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "llmClassified" BOOLEAN NOT NULL DEFAULT false,
    "duplicateGroupId" TEXT,
    "importRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_importRecordId_fkey" FOREIGN KEY ("importRecordId") REFERENCES "ImportRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "categoryId", "createdAt", "createdById", "description", "duplicateGroupId", "id", "importRecordId", "isConfirmed", "llmClassified", "merchant", "transactionTime", "type", "updatedAt") SELECT "accountId", "amount", "categoryId", "createdAt", "createdById", "description", "duplicateGroupId", "id", "importRecordId", "isConfirmed", "llmClassified", "merchant", "transactionTime", "type", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_externalOrderId_idx" ON "Transaction"("externalOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_name_key" ON "Ledger"("name");

-- DataMigration: 账户类型迁移
UPDATE Account SET type = 'cash' WHERE type = 'general';
UPDATE Account SET type = 'prepaid' WHERE type = 'ewallet';
UPDATE Account SET type = 'savings' WHERE type = 'debit';
