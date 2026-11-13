-- Repairs: the customer approves a price before work starts. The approval is for ONE amount; if the price changes afterwards
-- the approval no longer applies and must be given again. Additive: existing repairs are unaffected.
alter table repair_inquiries add column approved_at timestamptz;
alter table repair_inquiries add column approved_amount int check (approved_amount is null or approved_amount >= 0);
alter table repair_inquiries add column approved_by text; -- 'customer' (on their status page) or the staff member who recorded a phone/WhatsApp approval
