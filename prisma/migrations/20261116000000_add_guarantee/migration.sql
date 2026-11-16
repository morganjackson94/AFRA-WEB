-- 30-day guarantee (replaces the 60-day trial backstop for new signups)
ALTER TABLE "Operator" ADD COLUMN "guaranteeEndsAt" TIMESTAMP(3);
ALTER TABLE "Operator" ADD COLUMN "guaranteeRefundedAt" TIMESTAMP(3);
ALTER TABLE "Operator" ADD COLUMN "guaranteeRefundEmailSentAt" TIMESTAMP(3);
