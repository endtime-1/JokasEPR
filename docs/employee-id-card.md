# Employee ID card and QR attendance scan

## What it is

- **HR > Employees > (an employee) > "ID card" tab** shows the card, front and back, ready to print at card size
  (54 x 86 mm, portrait; page 1 is the front, page 2 the back).
  - Front: company logo, photo, name, job title, location, staff ID, joined date, and a QR code.
  - Back: company name and address, emergency contact, "if found" wording, signature line, issue date.
- **Attendance scanner** (side menu, or HR > Time & leave > Scan card) is the gate/desk screen. It opens the camera by itself and
  keeps scanning card after card. Attendance is mostly Monday to Saturday, but a scan counts on any day (some Sundays are worked): the first scan of the day marks the person present
  (creating that day's record if nobody had opened attendance for it); any later scan the same day shows "You have marked your
  attendance for today" and changes nothing. A day entered by hand as absent or on leave is turned into present by the scan.
  There is no check-out by scan.

## Who can use the scanner

New permission **hr.attendance.scan**, and a new system role **Attendance Scanner** (created for every company at the next
start-up). Give that role to the person who marks attendance (Users > edit user > role). They see only the scanner in their
menu and can scan on their own phone; they cannot see employees or HR records. HR Officer, HR/Admin, admins and anyone with
hr.manage can scan too (a custom role with only hr.manage needs hr.attendance.scan added to see the menu item).

## How the QR is protected

The QR holds `JK1.<employee id>.<signature>`. The signature is an HMAC made with the server's secret (`JWT_ACCESS_SECRET`),
so a code cannot be invented or edited, and a code from another company is refused. Scanning needs a signed-in user with
HR manage permission. Nothing extra is stored in the database: the code is recomputed whenever the card is opened.
Scans are written to the audit log, and the attendance row is marked "QR card scan".

Only active employees can be scanned. A terminated or suspended employee's card is refused, so there is no need to
collect a card back for it to stop working.

## Company details on the card

The address and logo on the card come from **Settings > Company profile** (the same place invoices and letters read them), so
changing them there changes every card, with no deploy. If no logo is set there, the Akoko logo is used for Akoko companies and
the company name as text for others (`ID_CARD_BRANDS` in `employee-id-card.tsx` holds that fallback and the colour).

## Files

- API (new): `apps/api/src/modules/hr/employee-card.{service,controller}.ts`, `dto/employee-card.dto.ts`,
  `employee-card.service.spec.ts`; registered in `hr.module.ts`.
  Routes: `GET /hr/employees/:id/id-card` (HR read), `POST /hr/attendance/scan` (HR manage).
- Web (new): `apps/web/components/employee-id-card.tsx`, `attendance-scan-page.tsx`, `app/(shell)/hr/attendance/scan/page.tsx`;
  small edits in `hr-pages.tsx` (the tab), `hr-nav.tsx` (menu item).
- No database change.

## Lost or stolen card

**Replace card** (on the ID card tab, HR manage permission) cancels the current card at once and shows a new one to print. The
QR then carries a higher version number, `JK1.<id>.<version>.<signature>`; a scan of any older version is refused with
"replaced by a newer one". Versions are kept in one company setting (`hr.idcard.versions`), no table change. Replacements are audited.

## Scanning on every device

- Camera: browsers with a built-in QR detector (Chrome, Edge, Android) use it. Everything else (iPhone Safari, Firefox) uses jsQR,
  a small open-source decoder (Apache-2.0, `apps/web/public/vendor/jsQR.js`, licence beside it), loaded only when needed.
  The camera needs an https page.
- A USB or Bluetooth scanner types the code into the box on the Scan card page.

## Limits

- Scanning needs a connection; there is no offline queue yet.
- Scanning needs HR manage permission.
