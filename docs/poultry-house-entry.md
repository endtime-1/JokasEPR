# Whole-house entry (Egg, Feed and Mortality records)

On the **Egg Production**, **Feed Consumption** and **Mortality** record screens, choosing a house (and leaving
**Pen** on "all pens") now lists every pen of that house as its own small form. Fill in the pens you want to
record and save once. The screens stay separate: eggs, feed and deaths are still three different screens.

## What it does

- One card per pen, in pen order. Each card shows the batch that holds birds in that pen.
  A pen with no birds is greyed out; for eggs, a batch that is not a laying flock is greyed out too.
- Pens left blank are skipped.
- **Save** sends each filled pen, one after the other, to the same endpoint the single-pen form uses
  (`/poultry/egg-production-records`, `/poultry/feed-consumption-records`, `/poultry/mortality-records`).
  So every existing rule still applies: live-bird limits, one batch per pen, stock deducted or credited,
  audit trail, and "eggs cannot exceed the birds in the pen".
- A pen the server turns down is marked in red with the server's reason. The other pens still save,
  and the pen that failed keeps what was typed.
- Every pen is sent with its own idempotency key, so pressing Save again after a dropped connection
  cannot record a pen twice. Changed figures get a fresh key.
- A pen that already has records for the chosen date shows them ("Already recorded for this date"),
  and warns before adding to them.
- Choosing a single pen in the **Pen** box brings back the original single-pen form, unchanged.
  Editing a record (the pencil in the list) also uses the original form.

## Boxes per screen

| Screen | Boxes for each pen |
| --- | --- |
| Egg Production | Crates (fills Good with crates x 30), Good, Cracked, Dirty, Broken, Rejected (pieces) |
| Feed Consumption | Bags (50 kg each, decimals allowed, sent as kg), Cost (optional) |
| Mortality | Deaths, Deliberate culls, Reason (optional). Deaths and culls are saved as separate records, as before |

Above the pens, eggs and feed show the store and product the record will use. They are filled in the same way the
single-pen form does it (the farm's egg or feed store, a product that fits the bird type) and can be changed.

## Safety checks in the pen forms

- Whole numbers only for eggs and birds; a slip in one pen is shown on that pen and does not hold up the others.
- Feed: more than 60 bags for one pen at once is refused here, because it is almost certainly kg typed into the
  bags box (stock is kept in kg, bags are 50 kg). If such an amount is genuinely right, choose the pen in the
  **Pen** box and record it with the single-pen form.
- Eggs are only accepted for laying flocks (layers and breeders), the same rule the server applies.
- If the connection drops, the pens not yet sent are not tried, and pressing Save again sends only the pens still
  waiting. A pen that did reach the server is recognised by its key and is not recorded twice.

## On a phone

On narrow screens the four rarely used egg boxes (cracked, dirty, broken, rejected) sit behind a toggle on each
pen, and open by themselves once something is typed in them. On wider screens all six boxes are always shown.
Enter moves down the same column to the next pen.

## Notes

- Only the website changes. The API is untouched: nothing new on the server side.
- The phone app (`apps/mobile`) is not changed.
- Mortality can no longer be saved against "the house" without a pen from this screen: every death goes to a pen.
- All pens of a house share one feed product and store. For a house with different bird types, record the pen on its own.
- Files: `apps/web/components/poultry-house-entry.tsx` (screen), `apps/web/lib/poultry-house-entry.ts` (logic),
  and a few small edits in `apps/web/components/poultry-pages.tsx`.
