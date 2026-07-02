# Central Asia · August 2026

Personal trip planning site — interactive map, day-by-day itinerary, and a
checkable logistics tracker. Password-gated with client-side AES-256-GCM.

## Editing trip data

1. Edit `data.js` (gitignored — not committed)
2. Run `PASSWORD='your-password' node build.js` to regenerate `data.enc.js`
3. Commit `data.enc.js` and push

## Local dev

```sh
python3 -m http.server 8766
# open http://localhost:8766
```

## Security notes

- Trip data is encrypted with AES-256-GCM, key derived via PBKDF2 (200k iters, SHA-256)
- The encrypted blob is in `data.enc.js`; without the password, it's ciphertext
- Source files (HTML, CSS, app.js, build.js) are not encrypted — only the trip data is
- This is client-side; a determined attacker with the URL could brute-force a weak password

