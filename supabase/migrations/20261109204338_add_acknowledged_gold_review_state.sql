alter table app.shipment_gold_review_entries
  drop constraint shipment_gold_review_entries_disposition_check,
  drop constraint shipment_gold_review_entries_reason_check;

alter table app.shipment_gold_review_entries
  add constraint shipment_gold_review_entries_disposition_check
    check (disposition in ('PENDING', 'ACKNOWLEDGED', 'OMITTED')),
  add constraint shipment_gold_review_entries_reason_check check (
    (disposition = 'OMITTED' and reason is not null and btrim(reason) <> '')
    or disposition in ('PENDING', 'ACKNOWLEDGED')
  );

comment on column app.shipment_gold_review_entries.disposition is
  'PENDING requires attention, ACKNOWLEDGED hides the reminder without inventing data, and OMITTED confirms no gold result will be recorded.';
