# Smoke Test Checklist — Windows Installer

Run this checklist on a real Windows machine after building a release with
`npm run build:win`. Everything here needs real hardware or a real install and
cannot be verified by automated tests or by the sandbox this project is
normally developed in. `npm run smoke:package` already proves the packaged
native SQLite binding and the bundled Drizzle migrations both load correctly
under Electron's packaged runtime — this checklist does not repeat that check;
it picks up from there with the things only a real install and real hardware
can confirm.

**Installer filename:** `dist/pos-1.0.0-setup.exe` — lowercase `pos`.
electron-builder's `nsis.artifactName` template (`${name}-${version}-setup.${ext}`)
pulls from `package.json`'s `name` field, which is the lowercase npm-style
`"pos"`, not the capitalized `productName: POS` used for the installed app's
display name, Start Menu entry, and `POS.exe` inside the install directory.
Only the installer artifact's own filename is lowercase — everything about the
installed app itself is "POS". If the version has since been bumped past
1.0.0, the filename changes accordingly (`pos-<version>-setup.exe`); adjust
the paths below to match.

**Unsigned installer:** No code-signing certificate exists for this project
(out of scope for MVP — see
`docs/superpowers/plans/2026-09-04-phase6-windows-packaging-smoke-test.md`).
Windows SmartScreen **will** show an "unrecognized app" warning the first
time you run `pos-1.0.0-setup.exe` — this is expected, not a bug. Click
"More info" → "Run anyway" to proceed.

## 1. Install

- [ ] Copy `dist/pos-1.0.0-setup.exe` to the target Windows machine (or build directly on it with `npm run build:win`).
- [ ] Run the installer. Confirm:
  - [ ] SmartScreen warning appears (expected — see above) and "Run anyway" proceeds.
  - [ ] Installer completes without error.
  - [ ] A desktop shortcut named "POS" was created.
  - [ ] The app appears in Windows Settings → Apps as "POS".
- [ ] Launch the app from the desktop shortcut. Confirm it opens to the POS tab with an empty cart, and the barcode field is focused automatically.
- [ ] Close the app, then check that `%APPDATA%\pos\pos.db` exists. Note the
      folder is lowercase `pos`, not `POS` — Electron's `userData` directory
      name comes from `package.json`'s `name` field (the same lowercase
      `"pos"` behind the installer filename above), not from
      `electron-builder.yml`'s `productName`. This is expected, not a bug.
      Finding this file here confirms the packaged `getDbPath()` /
      `getMigrationsPath()` fix from this phase is working end-to-end on a
      real install, not just under `npm run smoke:package`.

## 2. Barcode scanner (spec §17: "ต่อ USB Barcode Scanner แล้วสแกนสินค้าจริงได้")

- [ ] Connect a USB barcode scanner configured in keyboard-emulation mode (the standard mode for this class of scanner — see spec §10.1).
- [ ] Add at least 2 real products via the Products tab (or use seed data — see §3 below) with real barcodes.
- [ ] On the POS tab, click into the barcode field, then scan a physical barcode without touching the keyboard. Confirm the product is added to the cart with quantity 1.
- [ ] Scan the same barcode again. Confirm the quantity increments to 2, without needing to click back into the field (the field should already have refocused itself after the first scan).
- [ ] Scan a second, different product. Confirm it appears as its own line.
- [ ] Scan several items in a row with no mouse clicks in between (spec §17: "สแกนหลายรายการต่อเนื่องโดยไม่ต้องใช้เมาส์" — scan multiple items continuously without using the mouse). Confirm every scan lands correctly.
- [ ] Scan a barcode that doesn't match any product. Confirm a clear "Barcode not found" message appears and the cart is unchanged.

## 3. End-to-end sale (spec §17: full flow + Dashboard)

- [ ] With 2+ items in the cart, confirm the running Total updates correctly as you scan.
- [ ] Click "Finish Sale". Confirm: the cart clears, a success message with the correct total appears, and no error is shown.
- [ ] Go to the Products tab and confirm the stock for each sold item decreased by exactly the quantity sold.
- [ ] Go to the Dashboard tab. Confirm "Sales Today", "Orders Today", and "Units Sold Today" all reflect the sale you just completed (spec §17: "Dashboard แสดงยอดขายหลังการขายทันที" — Dashboard shows sales immediately after the sale).
- [ ] Go to the Sales History tab. Confirm the new sale appears at the top of the list with the correct total, and clicking "View" shows the correct line items.

## 4. Uninstall (optional, but good practice before repeating this checklist on the same machine)

- [ ] Uninstall via Windows Settings → Apps → POS → Uninstall.
- [ ] Confirm the Start Menu/desktop shortcut is removed.
- [ ] Note: `%APPDATA%\pos\pos.db` is intentionally NOT removed by uninstall (matches typical Windows app behavior — user data persists across reinstall). Delete it manually only if you want a fully clean slate for the next test run.

## If anything fails

Note exactly which checklist item failed, what you observed instead, and
whether it reproduces on a second attempt, then report it back rather than
trying to fix packaging config directly on the test machine — packaging
fixes belong in `electron-builder.yml`/`package.json`/`src/main/database/db-path.ts`
in the repo, verified with `npm run build:win` + `npm run smoke:package`
before producing another installer to retest.
