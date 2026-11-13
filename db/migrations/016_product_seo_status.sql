-- Product publishing and search-engine text. Additive: every existing product keeps its current behaviour.
-- A product is Draft (not published), Active (published) or Archived (kept for records, not published, hidden from the default list).
alter table products add column seo_title text check (seo_title is null or length(seo_title) <= 70);
alter table products add column seo_description text check (seo_description is null or length(seo_description) <= 160);
alter table products add column archived boolean not null default false;
alter table products add constraint products_archived_unpublished check (not (archived and published));
