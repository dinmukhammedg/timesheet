# Timesheet Automation

This repository contains a first-pass automation tool for the KPMG IMS timesheet flow.

## What it does

- Opens the timesheet site in a persistent browser profile
- Lets you complete the email OTP step manually
- Reads rows from an Excel workbook
- Attaches the internal order code
- Fills the hour value for each entry

## Workbook format

Use an `.xlsx` file with one of these layouts:

### Option 1: `Entries` sheet

Required columns:

- `date`
- `internal_order_code`
- `hours`

Optional columns:

- `project_name`
- `project_type`

### Option 2: `Entries` + `Codes`

If you want to store names instead of codes:

- `Entries` sheet columns:
  - `date`
  - `project_name`
  - `hours`
- `Codes` sheet columns:
  - `project_name`
  - `code`

## Run

```powershell
node scripts/timesheet-automation.js path\to\timesheet.xlsx
```

## Notes

- The script is intentionally human-in-the-loop for OTP.
- The browser selectors may need a small tune-up if the site changes.
- I built this around the UI shown in your screenshots, but I have not tested it against the live site yet.
