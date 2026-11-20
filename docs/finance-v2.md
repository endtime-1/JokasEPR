# Finance v2 ("fin")

A self-contained set of books inside the ERP. Own tables (`fin_*`), own ledger, own audit log, own settings, own menu (`/fin`, API prefix `fin`). It does not read or write any other module. The older Finance module (`/finance`) is untouched and keeps working.

## What is in it

| Piece | Where |
|---|---|
| Tables + immutability triggers | `packages/db/prisma/migrations/20261120000000_fin_foundation`, `..0100_fin_immutability_triggers`, `..0200_fin_contacts_tax`, `..0300_fin_tax_triggers`, `..0400_fin_sales`, `..0500_fin_sales_triggers` (each has a `down.sql`) |
| API | `apps/api/src/modules/fin/` |
| Web | `apps/web/app/fin/`, `apps/web/components/fin/` |
| Permissions | `packages/shared/src/permissions.ts` (`FIN_PERMISSIONS`), synced to roles in `permission-sync.service.ts` |

## Contacts and tax

- **Contacts** (`/fin/contacts`): customers and suppliers in `fin_contacts`, separate from the ERP customer/supplier tables. Codes `CUS-0001` / `SUP-0001` come from the numbering settings. Phones are normalised to `+233...`. Possible duplicates (same name, phone or TIN) are warned about and only created when confirmed. Contacts are deactivated, never deleted.
- **CSV import**: preview first (nothing saved), then all-or-nothing import in one transaction. Rows match an existing contact by code, external reference, or name + phone; blank cells never erase data. Every import is logged in `fin_import_batches`. Export writes the same columns, so a file round-trips.
- **Tax** (`/fin/settings/tax`): `fin_tax_codes` + append-only `fin_tax_rates` with effective dates. A new company only has a 0% "No tax" code; no rate is assumed or hard-coded. New rates must start after the latest one. `FinTaxService.resolve()` and `fin-tax-math.ts` (BigInt, half-up per line) are what sales and purchases will use.
- `main.ts` now allows JSON request bodies up to 3 MB (was 100 KB) so a 5,000-row CSV can be sent.

## Sales (`/fin/sales`)

Quotes, invoices, receipts, customer deposits, credit notes, recurring invoices and customer statements. Built with the finance module's own contacts and tax codes. **Not yet built: items and stock**, so lines are free text with an income account, and COGS, the insufficient-stock block and its override permission are not there yet (invoice and quote lines carry an unlinked `itemId` column reserved for that step).

- **Posting** (all through `FinLedgerService.post()`, one transaction per document):
  - Invoice issued: Dr Receivables; Cr Sales (per line's income account, else the "Sales revenue" role); Cr Tax payable.
  - Receipt: Dr cash/bank/MoMo; Cr Receivables. Deposit: Dr cash/bank; Cr Customer deposits (a liability). Applying a deposit: Dr Customer deposits; Cr Receivables.
  - Credit note: Dr Sales, Dr Tax payable; Cr Receivables for the part that reduces the invoice, Cr Customer deposits for any excess on an already-paid invoice.
  - Void invoice / receipt / credit note / deposit: an exact reversing entry. An invoice cannot be voided while a payment or credit note is against it (void those first).
- **Statuses**: invoice stored as DRAFT / SENT / VOID with a payment status; the customer-facing status (draft, sent, partially paid, paid, overdue, void) is derived. Numbers are assigned when issued, so drafts never leave gaps.
- **Tax** comes from the tax settings: the rate in force on the document date is copied onto each line, so a later rate change never alters an existing document. The "VAT and Levies Payable" account is inactive in the template and must be switched on before the first taxed invoice.
- **Immutability in the database** (migration `..0500`): an issued invoice and its lines cannot be edited or deleted, the balance always equals total - paid - credited, receipts/deposits/credit notes can only be voided.
- **Sharing**: PDF (pdfkit), a public no-login link `/p/invoice/<id>.<HMAC>` (derived from a server secret, nothing stored; regenerate or switch off per invoice), WhatsApp (`wa.me`) link, email with the PDF attached (uses the existing SMTP settings), customer statement as PDF and its own public link. Set `FIN_LINK_SECRET` (falls back to `JWT_ACCESS_SECRET`).
- **Scheduled jobs** (Ghana time, single API process, all idempotent; `FIN_JOBS_DISABLED=1` switches them off): 05:30 expire quotes, 06:00 create due recurring invoices, 09:00 overdue reminders by email at 1, 7 and 14 days (one per step per invoice, ever; earlier missed steps are recorded as skipped). SMS/WhatsApp can be added later by registering another `ReminderChannel`.
- Existing files touched for the public pages: `apps/web/middleware.ts` (`/p/` is public) and `apps/web/components/auth-context.tsx` (no redirect to login from `/p/` pages).

## Banking and payments (`/fin/banking`)

Payment accounts, money received and paid, transfers, online invoice payments and bank reconciliation. All of it posts through `FinLedgerService.post()`.

- **Payment accounts**: cash, bank, mobile money (MTN / Telecel / AT) and "payment provider" (money Paystack holds for you). Each is linked to one ledger account (existing, or created under "Cash and Bank" from code 1121). The balance shown is read from the ledger, never stored. Switching off needs a zero balance.
- **Receive payment** (Sales > Receipts): one or many invoices, partial payments, or no invoice at all. Money above the invoices becomes customer credit (a Customer Deposit, linked to the receipt; voiding the receipt voids unused credit or refuses if it was used).
- **Make payment**: Dr the account you charge, Cr the payment account. **Transfers**: Dr destination, Dr charge account (default role "Bank and transfer charges"), Cr source. Both can only be voided (exact reversal).
- **Online payments**: Paystack first, behind a provider interface (Hubtel can be added by registering another provider). "Pay now" appears on the public invoice page only when the provider key is set. The webhook (`/api/v1/fin/webhooks/paystack`) checks the signature over the raw body, then asks the provider to verify the payment (the webhook alone is never trusted). Posting is idempotent: a locked row plus a PAID state the database refuses to change, so repeats or simultaneous deliveries create one receipt. Amount or currency mismatch, or a missing clearing/fee account, parks it as "Needs review"; fix and press "Check again". Posting: Dr Online payments clearing (net), Dr Payment provider fees, Cr Receivables. Move the provider's payout to the bank with a transfer.
- **Reconciliation** (Banking > Reconcile): import a CSV or Excel statement (map the columns once; duplicate lines are skipped, so overlapping files are safe), auto-match by amount, date (3-day window) and reference or document number (only when the best candidate is clearly better than the rest), match or unmatch by hand, create a transaction from an unmatched line (bank charge, interest), ignore lines, and a report: statement balance against the books with timing differences, difference must be zero to mark reconciled. Reconciled matches are locked until reopened (reopenings are kept in an append-only history). A matched entry that is voided later shows up as not yet in the books.
- **Receipts**: PDF, public link `/p/receipt/<id>.<HMAC>`, WhatsApp link and email.
- **Server settings**: `ONLINE_PAYMENT_PROVIDER=paystack`, `PAYSTACK_SECRET_KEY`, `FIN_LINK_SECRET` (see `.env.example`). On an existing chart, switch on account 2180 and make sure the roles `payment_clearing`, `provider_fees` and `bank_charges` are assigned (Accounting > Chart of Accounts).
- New migrations: `20261120000600_fin_banking` and `..0700_fin_banking_triggers` (the second needs the TRIGGER privilege, same as before). New dependency: `exceljs`. `main.ts` now keeps the raw request body (needed to verify webhook signatures).

## Links to other modules (`Settings > Integrations`, `Sales > From other modules`)

Optional links that let finance pick up work from other modules. **Every link is OFF by default**, and a link only ever creates **drafts**: a finance user reviews, edits and posts them (the link code never calls the posting service; a test proves it).

- **Finance pulls, nothing else changes.** A 5-minute job (and a "Sync now" button) reads newly approved Sales orders through one read-only adapter (`fin-integration-source.ts`). No Sales, Procurement or storefront code was changed, and a finance problem can never block an order. `FIN_JOBS_DISABLED=1` switches the job off.
- **Link 1, available:** Sales order approved (status APPROVED or FULFILLED, by `stockApprovedAt`) -> DRAFT invoice. Lines copy the order as ordered (qty and price per bag, not per kg). The start line is the moment the link is switched on, every time: orders approved before it, or while it was off, are never imported. Options: default tax code, default income account, "create the finance customer automatically".
- **Link 2, not available yet:** goods received -> draft bill needs the Purchases part of Finance v2.
- **Matching with external_ref.** The draft carries `externalRef = "SO:<order id>"` (unique per company in the database, so one order can only ever make one draft, even with two runs at once) plus the order label and the order's total. Customers match through the contact's `externalRef = "CUST:<customer id>"`. An unmatched customer parks the order as "Needs a customer match" until finance matches it (or auto-create is on). The source reference of an invoice cannot be changed afterwards (trigger).
- **When the order changes:** a still-draft invoice whose order is cancelled is flagged "Order cancelled" (never deleted); a posted invoice is never touched; a draft finance discarded is not made again. If the draft total differs from the order total (order-level discount, tax) the list says "Check this draft".
- New migrations: `20261120000800_fin_integrations` (adds `externalRef`, `sourceLabel`, `sourceTotal` to `fin_invoices`, plus `fin_integration_settings` and `fin_integration_log`) and `..0900_fin_integrations_triggers`. Both have `down.sql`. Tested on MariaDB 10.11 (the production engine).

## Items and stock (`/fin/items`)

The finance module's own product list and stock (tables `fin_items`, `fin_stock_movements`); it does not read the ERP's products or inventory.

- **Items**: SKU, name, barcode, goods or service, unit, category, selling price (tax-inclusive by default, or "plus tax"), tax code, optional income / cost-of-goods / inventory accounts, reorder level. A service never tracks stock. SKUs and barcodes are unique per company.
- **Stock**: every change is one append-only movement (database triggers refuse edits and deletes; the only allowed change is linking a movement once to its journal entry). Cost method is **weighted average**; the last unit out takes whatever value is left, so rounding never strands a pesewa. Quantities are to 3 decimals, money to the pesewa. Stock cannot go below zero unless a supervisor allows it (the shortfall is then costed at zero).
- **Adjustments** (stock counts, damage): by counted quantity or by change; the difference posts Dr/Cr Inventory against the "Stock adjustment gain / loss" account. **Opening stock** posts Dr Inventory, Cr Opening Balance Equity (one entry per CSV import).
- **CSV import / export**: preview first, per-row problems listed, nothing imported unless every row is fine or "skip bad rows" is chosen; existing SKUs are updated without touching their stock.
- **Stock valuation** report as at any date, with a tie-out against the Inventory accounts in the ledger.
- Permissions: `fin.items.view / create / post (adjust stock) / import`.

## Point of sale (`/fin/pos`)

A till for walk-in sales, using finance items and stock.

- **Selling**: search by name or SKU or scan a barcode (the scanner just types into the search box and presses Enter); quantity, line and overall discounts, extra charges (delivery), optional customer (walk-in by default). Keyboard: F2 search, F9 pay, Esc clear. Big touch targets for tablets. The till prices the cart on the server (`/fin/pos/quote`), so the total and change it shows are exactly what will be posted.
- **Prices include tax** (the tax is split out of the shelf price). A line marked "plus tax" has tax added on top. An overall discount is shared across lines to the pesewa so each line's tax is right.
- **Payment**: cash, MoMo or card, in any combination (split payments). Cash can be handed over in excess; the change is the excess. MoMo and card pay the exact amount. Each method posts to its own payment account (the till's cash drawer; the MoMo and card accounts set under POS > Settings).
- **A completed sale** is one transaction: stock out at average cost, and ONE balanced ledger entry (Dr payment accounts; Cr Sales; Cr Tax payable; Dr Cost of goods sold; Cr Inventory). Pressing Pay twice or retrying after a bad connection can never make two sales (client key); two tills racing for the last unit: exactly one wins.
- **Tills**: named tills, each with its own cash-drawer payment account. A cashier opens a session with a float (optionally moved from a "float source" account such as the safe) and closes it with a **cash count**. Expected cash = float + cash taken (net of change) - cash refunded; the variance is posted to **Cash Over / Short** (a shortage is an expense, an overage a credit). A closed session is final (trigger).
- **Refunds** from a past receipt (whole or part): reverses sales, tax and cost in proportion (the last unit takes whatever is left), puts stock back at what it cost (or not, for damaged goods), and pays the customer back from the open till or the MoMo/card account.
- **Receipts**: printable 80 mm layout (print dialog or PDF), a public no-login link `/p/pos/<id>.<HMAC>` and a WhatsApp message.
- **Reports** (`/fin/pos/reports`): sales by day, cashier, item and payment method, net of refunds, with custom dates and CSV export. Totals tie to the ledger.
- **Who can do what**: `fin.pos.post` rings up sales; `fin.pos.create` opens and closes a till; `fin.pos.void` does refunds; `fin.pos.approve` is the **supervisor**: a different price, a discount above the limit, a refund above the limit, selling below zero stock, and POS settings. A "POS Cashier" role (view, create, post) is added by the permission sync.
- Settings and limits: POS > Settings (MoMo and card accounts, float source, discount limit, refund approval limit, receipt header and footer). A chart made before this change needs the account **6730 Cash Over / Short** (role `cash_over_short`) and the number sequences POS_REFUND and POS_SESSION (created automatically).
- Migrations: `..1000_fin_items_stock`, `..1100_fin_items_stock_triggers`, `..1200_fin_pos`, `..1300_fin_pos_triggers` (each with `down.sql`). Tested on MariaDB 10.11.

## Rules it enforces

- One posting door: `FinLedgerService.post()`. Balanced inside a database transaction (2+ lines, debits = credits to the pesewa, active posting accounts, open period).
- Posted entries are never edited or deleted. Corrections are reversing entries. The database triggers refuse it even if the app is bypassed.
- Money is DECIMAL(15,2) and is handled in whole pesewas in code, never floats.
- Accounts are found by **role** (`receivable`, `cogs`, ...), never by hard-coded code.
- Same-source posting is idempotent: `(sourceModule, sourceId)` is unique.
- Every change is written to `fin_audit_logs` (append-only) in the same transaction as the change.

## Permissions

`fin.<area>.<action>`. Areas: dashboard, sales, purchases, banking, pos, payroll, accounting, reports, items, contacts, settings. Owner-level roles get all of them; Accountant and Finance Officer get all; Auditor gets view + export.

## Tests

```
# unit + pure tests
npx jest src/modules/fin
# integration tests (real MySQL with the fin migrations applied; includes the trigger tests)
FIN_TEST_DATABASE_URL=mysql://user:pw@host:3306/db npx jest --runInBand src/modules/fin
```

## Deploying (VPS)

1. Backup first: `bash /opt/jokas/app/infra/vps/backup.sh`
2. Put the changed files in place, then run the normal deploy (it applies migrations): `sudo -iu deploy bash -lc 'cd /opt/jokas/app && ALLOW_DIRTY_DEPLOY=1 bash infra/vps/deploy.sh'`
3. The triggers migration needs the TRIGGER privilege (and `log_bin_trust_function_creators=1` if binary logging is on). If it fails, the tables are already created and the app still enforces every rule in code; ask for the privilege and apply that one migration again.
4. Open `/fin` as an owner-level user, then Settings, then Accounting > Chart of Accounts > "Use the poultry & feed template".

## Undo

Run the `down.sql` files newest first (triggers, then foundation). This deletes all `fin_*` data. The permissions are harmless to leave in place.
