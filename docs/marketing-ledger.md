# Marketing Ledger

Each marketer states, week by week, **which customers they will sell to and how much**. When the week ends, that plan is set against the **sales actually recorded**, and the result is filed as a report in the ledger. A supervisor, manager or the CEO opens the ledger and sees, for every marketer, what was planned and what was really sold.

Web: **Market Planning → Marketing ledger** (`/market-planning/ledger`). API: `/api/v1/market-planning/ledger/*`.

It is separate from *Targets* on purpose. A Target is a production-demand plan: approving one creates production plans and Feed Mill orders and only accepts feed products that have a formula. A ledger plan is a sales commitment with **no production side effects**, and it can include any sellable product.

## The weekly cycle

| Step | Who | What happens |
|---|---|---|
| 1. Plan | Marketer | Picks the customers, the product, the expected quantity (bags for feed) and price. Price is filled in from what that customer last paid, else the price list. Weeks run Monday to Sunday. |
| 2. Submit | Marketer | Locks the plan for editing. A plan first submitted after the end of the first day of the week is marked **late**. |
| 3. Approve | A manager (not the plan's author or owner) | The approved plan is the **baseline** the week is measured against. A manager can *send back* a plan with a reason; if it was already approved, the ledger shows it as **revised**. |
| 4. Sell | — | Orders are recorded in Sales as normal. Nothing extra to enter. |
| 5. Close the week | Marketer (or a manager for them) | From the last day of the week. The plan is set against the sales; the marketer gives a short reason for every line that fell short. The figures are **frozen**. |
| 6. Sign off | A different manager | Records that the week was reviewed, with an optional comment. |

Until a week is closed, its figures are live (they change as orders are entered). After it is closed, the report says what it said on the day; if orders for that week are later added, cancelled or edited, the ledger shows what the records say now beside what was filed and flags the difference.

## What each person sees

- **Marketer**: only their own pages.
- **Manager / CEO / anyone with `market-planning.manage`**: everyone, the company totals and the reconciliation.
- **Read-only roles** (e.g. Auditor): everyone, read only.

No new permissions: it uses `market-planning.read` / `.submit` / `.manage`. Every action is written to the audit log.

## How a sale is counted and credited

**Sold** = every order dated in the week that was not cancelled (pending, approved and delivered), valued at the order's line totals. Egg sales are a separate record and are not included. Order-level discounts/tax and sales returns are not netted.

Each order is credited to **one** marketer, so the marketers always add up to no more than the company's sales:

1. the marketer whose plan names the customer; otherwise
2. the marketer who entered the order; otherwise
3. the marketer who owns the customer's market (Market Planning → Markets).

Ties are settled by who entered the order, then the market owner, then whoever submitted first. An order nobody can claim is shown as **not credited to any marketer** at the top of the ledger, with the customers, so it can be fixed by assigning those customers to a market.

## The measures

| Measure | Meaning |
|---|---|
| Variance | sold − planned (GHS). Negative = short of plan. |
| Attainment | sold ÷ planned. |
| Volume variance | (sold qty − planned qty) × planned price |
| Price variance | sold value − planned price × sold qty |
| Unplanned sales | sold to a customer/product combination that was not in the plan |
| | **volume + price + unplanned = total variance, exactly** |
| Hit rate | planned customers who bought anything ÷ planned customers (the "strike rate") |
| Plan accuracy | 100% − Σ\|sold − planned\| ÷ planned, counted line by line, so selling the right amount to the wrong customers does not score well |
| Line result | within ±10% of the planned quantity is **on plan**; above is **above plan**; below is **short**; zero is **no sale** |

The **Scorecard** shows attainment for each marketer over the last 4–12 weeks, how many plans came in on time and were closed, and a *pattern* once three weeks have finished: plans that run high (sales average under 80% of plan) or low (over 120%). It is a direction to discuss, not a verdict. Only finished weeks count towards averages.

## Standards this follows

- Plan-versus-actual with variance = actual − plan, and the price / volume split of sales variance ([Umbrex](https://umbrex.com/resources/company-analysis/finance/budget-vs-actual-revenue-variance/), [Outreach](https://outreach.io/resources/blog/variance-analysis), [OpenTuition](https://opentuition.com/acca/pm/sales-mix-variance-variance-analysis-acca-performance-management-pm/)); every variance should provoke a question, hence the required reason for each shortfall.
- Forecast accuracy measured in both directions, and bias tracked over time rather than judged on one week ([Rox](https://www.rox.com/articles/how-to-measure-revenue-forecast-accuracy), [Fitgap](https://us.fitgap.com/stack-guides/detecting-and-correcting-forecast-bias-across-reps-and-managers)).
- Planned visits that turn into orders (strike rate) alongside the money result, since activity without outcome misleads ([OpMetrix](https://help.opmetrix.com/reporting/strike-rate)).
- A fixed baseline, a lock, and an attributed change log with reasons, so a plan cannot quietly move after the fact ([Fitgap](https://us.fitgap.com/stack-guides/creating-an-auditable-forecast-change-log-that-reduces-blame-and-improves-accountability), [Oracle](https://docs.oracle.com/cd/F95753_01/crm92pbr22/eng/crm/csfa/InactivatingandLockingForecasts-09429a.html)).

These are vendor and training sources rather than a formal standard; the thresholds (±10%, 80–120%, end of day one) are constants at the top of `apps/api/src/modules/market-planning/marketing-ledger.calc.ts`.

## Not in this version

- Visits (the Field Visits GPS check-ins) are not yet shown beside the plan.
- Egg sales, returns and order-level discounts are not part of "sold".
- No reminders yet (e.g. "you have no plan for this week") and no automatic closing of a week nobody closed.
- A plan can be sent back and edited, but there are no per-line amendments with reasons.
- QuickBooks remains the accounting record; the ledger reads the sales orders in this system.

## Files

- Schema: `MarketingPlan`, `MarketingPlanLine` in `packages/db/prisma/schema.prisma`; migration `20261112000000_marketing_ledger` (adds two tables, changes nothing existing).
- API: `apps/api/src/modules/market-planning/marketing-ledger.{calc,service,controller}.ts`, DTOs in `dto/marketing-ledger.dto.ts`. The rules live in `marketing-ledger.calc.ts` as pure functions with their own tests.
- Web: `apps/web/components/marketing-ledger-pages.tsx` and routes under `apps/web/app/(shell)/market-planning/ledger/`.
