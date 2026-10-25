-- Repair workflow: a message staff can show the customer (staff_notes stays internal).
alter table repair_inquiries add column customer_message text;
