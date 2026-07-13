-- Work-receipts v0 (impl-3 stretch, A13; ledger: 0018 = next free per 17:49:02).
-- Receipt = shareable proof of a completed contract. Unsigned at M1 (signing
-- rides Phase 4 attestations). Columns land with the stretch slice per A13.

alter table contracts
  add column receipt_visibility text not null default 'private'
    check (receipt_visibility in ('private','public')),
  add column receipt_show_amount boolean not null default false;

notify pgrst, 'reload schema';
