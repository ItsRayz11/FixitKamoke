-- Customer-supplied pictures: a payment receipt on an order (bank or wallet transfer, or a COD advance) and photos of the
-- phone on a repair request. Stored as a short list of https links to images already uploaded to the shop's image host.
-- Additive only: existing rows get an empty list, nothing else about them changes.
alter table orders add column payment_receipts jsonb not null default '[]'::jsonb
  check (jsonb_typeof(payment_receipts) = 'array' and jsonb_array_length(payment_receipts) <= 3);
alter table repair_inquiries add column photo_urls jsonb not null default '[]'::jsonb
  check (jsonb_typeof(photo_urls) = 'array' and jsonb_array_length(photo_urls) <= 3);
