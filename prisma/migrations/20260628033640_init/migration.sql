-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "billingStatus" TEXT NOT NULL DEFAULT 'none',
    "stripeCustomerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "businessHours" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payRate" REAL,
    "payPeriod" TEXT NOT NULL DEFAULT 'hour',
    "hours" TEXT,
    "readinessState" TEXT NOT NULL DEFAULT 'pending',
    "gatePlatform" BOOLEAN NOT NULL DEFAULT false,
    "gateCalendar" BOOLEAN NOT NULL DEFAULT false,
    "gateTemplate" BOOLEAN NOT NULL DEFAULT false,
    "gateBilling" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Role_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScreeningTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "sourceTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "photoRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScreeningTemplate_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'instagram',
    "pageId" TEXT,
    "accessToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'stubbed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelConnection_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "calendarId" TEXT,
    "accessToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'stubbed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarConnection_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "roleId" TEXT,
    "name" TEXT,
    "contact" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Candidate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Candidate_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "channelConnectionId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'open',
    "transcript" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "roleId" TEXT,
    "calendarConnectionId" TEXT,
    "scheduledAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "isBillable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_calendarConnectionId_fkey" FOREIGN KEY ("calendarConnectionId") REFERENCES "CalendarConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_stripeCustomerId_key" ON "Operator"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Location_operatorId_idx" ON "Location"("operatorId");

-- CreateIndex
CREATE INDEX "Role_locationId_idx" ON "Role"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningTemplate_roleId_key" ON "ScreeningTemplate"("roleId");

-- CreateIndex
CREATE INDEX "ChannelConnection_operatorId_idx" ON "ChannelConnection"("operatorId");

-- CreateIndex
CREATE INDEX "CalendarConnection_locationId_idx" ON "CalendarConnection"("locationId");

-- CreateIndex
CREATE INDEX "Candidate_locationId_idx" ON "Candidate"("locationId");

-- CreateIndex
CREATE INDEX "Candidate_roleId_idx" ON "Candidate"("roleId");

-- CreateIndex
CREATE INDEX "Conversation_candidateId_idx" ON "Conversation"("candidateId");

-- CreateIndex
CREATE INDEX "Conversation_operatorId_idx" ON "Conversation"("operatorId");

-- CreateIndex
CREATE INDEX "Booking_candidateId_idx" ON "Booking"("candidateId");

-- CreateIndex
CREATE INDEX "Booking_locationId_idx" ON "Booking"("locationId");
