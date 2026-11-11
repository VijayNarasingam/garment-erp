# Garment ERP print agent (Windows)

A small local agent that prints 58/80 mm thermal bills **silently** — no Windows
print dialog, no browser dialog. The ERP app builds the ESC/POS byte stream and
posts it to this agent, which spools the raw bytes to the printer you selected.

- Runs on `127.0.0.1:17890` only. Nothing is reachable from the network.
- Every call except `/health` needs the pairing token.
- Windows PowerShell 5.1 only. No Node, Java or Python needed.

## Install (on the billing PC)

1. Open **PowerShell as Administrator**.
2. Run the installer from this folder:

   ```powershell
   cd path\to\garment-erp\printer-agent
   .\install.ps1
   ```

3. The installer prints a **pairing token**. Copy it.
4. In the app open **Settings → Bill print**, paste the token, press **Connect**,
   choose the 80 mm thermal printer (not the label printer) and press **Test print**.
5. When the test bill looks right, turn on **Print bills automatically**.

Options: `-Port 17890`, `-ResetToken`, `-InstallDir <path>`, `-NoStart`.

The installer:

- copies the agent to `%ProgramData%\GarmentPrintAgent`,
- compiles `RawSpooler.dll` (Win32 `winspool` raw printing),
- writes `config.json` with the token,
- reserves `http://127.0.0.1:17890/` for your Windows user,
- registers a **hidden** scheduled task `GarmentPrintAgent` that starts at logon,
- starts the agent and waits for `/health`.

## Uninstall

```powershell
.\uninstall.ps1        # keeps logs and the token
.\uninstall.ps1 -Purge # removes everything
```

## API

All responses are JSON. The token goes in the `X-Print-Agent-Token` header.

### `GET /health` (no token)

```json
{ "status": "ok", "version": "1.0.0", "uptimeSeconds": 812, "queueDepth": 0 }
```

### `GET /printers`

```json
{
  "defaultPrinter": "XP-80C",
  "printers": [
    {
      "name": "XP-80C",
      "driverName": "XPrinter XP-80C",
      "portName": "USB001",
      "status": "Idle",
      "isDefault": true,
      "isVirtual": false,
      "isLabelPrinter": false
    }
  ]
}
```

`isVirtual` marks PDF/XPS printers. `isLabelPrinter` is a name and driver
heuristic — the app shows a warning when a bill is sent to one.

### `POST /print`

```json
{ "printer": "XP-80C", "jobName": "INV/2026-27/000123", "dataBase64": "<raw ESC/POS>", "copies": 1 }
```

```json
{ "jobId": "3f4c2a1b", "printer": "XP-80C", "bytes": 4821, "copies": 1, "warning": null }
```

Errors: `400 INVALID_REQUEST`, `401 UNAUTHORIZED`, `404 UNKNOWN_PRINTER`,
`405 METHOD_NOT_ALLOWED`, `413 PAYLOAD_TOO_LARGE`, `429 RATE_LIMITED`,
`500 PRINT_FAILED`.

- Copies are clamped to 1–3.
- The decoded payload may not exceed 512 KB, the request body 1 MB.
- 60 requests per minute per client.
- One job at a time; a second job waits for the first to finish.
- A job that does not finish within 10 seconds returns `500 PRINT_FAILED`.
  The agent never retries on its own, so paper is never printed twice.

## How it works

```
ERP app  --(POST /print, base64 ESC/POS)-->  agent  --> queue folder
                                                        |
                                          worker process (one job at a time)
                                                        |
                                          Win32 StartDocPrinter (RAW) -> USB printer
```

The HTTP front-end answers `/health` immediately while the worker owns the
printer, so the app never hangs during a print.

Logs: `%ProgramData%\GarmentPrintAgent\logs\agent-YYYY-MM-DD.log`
(one file per day, seven days kept, 5 MB cap).

## Check the paper without burning paper

From the `frontend` folder:

```powershell
npm run print:preview
```

It builds the real ESC/POS byte stream for a sample bill, replays it through a
small ESC/POS interpreter and writes `frontend/print-preview/` — `receipt.bin`
(the exact bytes), `receipt.txt` (the decoded paper) and `receipt.png` (a
picture of the 80 mm roll, plus the 58 mm and duplicate variants). Use it after
changing the receipt template.

## Troubleshooting

**The app says "Agent not running".**
Check the task: `Get-ScheduledTask -TaskName GarmentPrintAgent` and
`Start-ScheduledTask -TaskName GarmentPrintAgent`. Then read the newest log
file. If the agent cannot bind the port, reserve it again with `install.ps1`.

**Nothing comes out of the printer.**
The bytes are sent, so the problem is usually the driver or the paper:

- Install the vendor driver for the thermal printer (ESC/POS). A "Generic /
  Text Only" driver often drops the ESC/POS commands.
- Check the queue: `Get-PrintJob -PrinterName "XP-80C"`.
- Test with the vendor's own test page first. If the vendor test prints, the
  driver is fine and the issue is in the receipt template.

**The QR code does not print.**
Some firmware ignores `GS ( k`. The rest of the bill still prints. The test
print tells you whether the printer supports native QR.

**The bill is cut off on one side.**
The paper width setting (80 mm / 58 mm) must match the roll. An 80 mm-only
printer ignores the 58 mm setting — that is a hardware limit, not a bug.

**Bills come out on the label printer.**
Pick the thermal printer in Settings → Bill print → Bill printer. The agent
flags label and virtual printers, and the app shows a warning.

**The browser print dialog opens on every bill.**
Auto-print needs a pairing token and a selected printer. Until then the app
falls back to the browser dialog on purpose, so a bill is never lost.

## Security notes

- Loopback only (`127.0.0.1`), so other machines on the shop network cannot
  reach it.
- The token is stored in the browser of the billing PC, in
  `localStorage['garment.print.prefs.v1']`.
- Requests with a foreign `Host` header are rejected.
- CORS is echoed back to the calling origin and the token is required for every
  data call, so a random web page cannot print bills.
