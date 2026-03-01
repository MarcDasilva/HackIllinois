-- ============================================================
-- Migration: 20260228170000_add_org_code.sql
-- Adds validation code column to organizations table.
-- ============================================================

alter table public.organizations
  add column if not exists org_code text;
