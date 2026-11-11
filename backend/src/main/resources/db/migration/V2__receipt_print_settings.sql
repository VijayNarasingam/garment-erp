-- Receipt template + UPI settings for the 58/80 mm thermal bill.
-- Additive only: existing rows keep the approved defaults.
alter table businesses
    add column receipt_show_customer bit not null default 1,
    add column receipt_show_cashier bit not null default 1,
    add column receipt_show_payment bit not null default 1,
    add column receipt_show_upi_qr bit not null default 1,
    add column receipt_show_terms bit not null default 1,
    add column receipt_show_sku bit not null default 0,
    add column receipt_show_size_color bit not null default 0,
    add column receipt_show_hsn bit not null default 0,
    add column receipt_show_item_rate bit not null default 1,
    add column receipt_show_item_discount bit not null default 1,
    add column receipt_terms varchar(500) null,
    add column upi_id varchar(100) null,
    add column upi_payee_name varchar(150) null;
