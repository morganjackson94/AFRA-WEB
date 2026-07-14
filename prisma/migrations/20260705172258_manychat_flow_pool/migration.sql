-- CreateTable
CREATE TABLE "ManychatFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectUrl" TEXT NOT NULL,
    "flowNs" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "assignedOperatorId" TEXT,
    "assignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManychatFlow_assignedOperatorId_fkey" FOREIGN KEY ("assignedOperatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ManychatFlow_assignedOperatorId_key" ON "ManychatFlow"("assignedOperatorId");

-- CreateIndex
CREATE INDEX "ManychatFlow_status_idx" ON "ManychatFlow"("status");
