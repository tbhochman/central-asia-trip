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

## Live inReach tracking

When Garmin inReach tracking is on, the app's Map tab shows a live layer:
green breadcrumb trail, pulsing current-position marker, any messages sent
to the shared map, and a "🛰 LIVE · N min ago · elevation" pill (tap it to
jump to the latest position). Auto-refreshes every 5 min while open.

Pipeline: `.github/workflows/track.yml` polls the Garmin MapShare KML feed
every 15 minutes (August only), `track-fetch.js` parses the points and
encrypts them with the trip password (same AES-256-GCM scheme as the trip
data), and the result is force-pushed as a single-commit `track` branch.
The app fetches `track.enc.json` from raw.githubusercontent.com (CORS-open)
and decrypts it client-side — location data is never public plaintext.

One-time setup:

1. Enable MapShare at explore.garmin.com → Account → Social (note the name
   in your `share.garmin.com/<name>` URL)
2. Add repo secrets:
   ```sh
   gh secret set MAPSHARE_NAME --body 'YourMapShareName'
   gh secret set TRIP_PASSWORD --body 'the-trip-password'
   gh secret set MAPSHARE_PASSWORD --body '...'   # only if MapShare has one
   ```
3. Turn on tracking on the inReach. First points appear within ~15–30 min
   (Garmin send interval + workflow cron + CDN cache).

Test locally: `PASSWORD=pw MAPSHARE_NAME=name node track-fetch.js` writes
`track.enc.json` (gitignored on main); the app loads it from the site root
when served on localhost.

## Security notes

- Trip data is encrypted with AES-256-GCM, key derived via PBKDF2 (200k iters, SHA-256)
- The encrypted blob is in `data.enc.js`; without the password, it's ciphertext
- Source files (HTML, CSS, app.js, build.js) are not encrypted — only the trip data is
- This is client-side; a determined attacker with the URL could brute-force a weak password

