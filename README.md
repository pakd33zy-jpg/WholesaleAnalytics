# Wholesale Analytics CRM V2

This build extends the Supabase-backed dashboard into an operating wholesaling CRM.

## Added in V2

- CSV lead import
- Follow-up task queue
- Outreach event logging for calls/SMS/email/mail
- Offer records with status and expiration
- Cash-buyer database
- Buyer profile fields for markets, property types, max price and proof of funds
- Row Level Security on all new tables
- Lead import template

## Setup

1. `npm install`
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Enable Email auth in Supabase.
4. `npm run dev`

## What is live vs. not yet connected

Live now:
- Supabase authentication
- Leads
- Pipeline stage changes
- Tasks
- Outreach history
- Offers
- Buyer records
- CSV lead import

Not yet provider-connected:
- SMS sending
- Email sending
- Phone dialing
- Public-record/property-data enrichment
- E-signature / contract delivery

Those provider connections should write their results back into `outreach_events`, `offers`, and future contract tables instead of bypassing the CRM.
