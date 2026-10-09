# Air Pointer

Air Pointer is a Windows desktop app that turns a webcam-tracked hand into a system mouse.

## Gestures

- Index finger only: move the cursor
- Thumb + index quick pinch: one left click
- Thumb + index hold (450 ms): drag until released
- Thumb + middle pinch: right-click
- Thumb + ring pinch: double-click
- Thumb + pinky pinch: lock the cursor in place
- Index + middle fingers: scroll up/down
- Open palm: steady hold without cursor movement
- `Ctrl+Shift+Q`: emergency pause

## Run

```powershell
npm install
npm start
```

Allow camera access when Windows asks. Stability defaults to 82%, which ignores small hand shake. Raise it for a steadier cursor or lower it for faster response.

The install step downloads the official MediaPipe hand landmark model and verifies its SHA-256 checksum. No camera video is uploaded. To build a Windows installer, run `npm run dist:win`.

Live website: deployment in progress.

Browser demo: deployment in progress. It controls an on-page cursor; Windows system control requires this desktop app.

The Windows installer will be published from the repository releases page.
