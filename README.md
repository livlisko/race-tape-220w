# Race Tape · 220 W Effort Laps

[Open Race Tape](https://livlisko.github.io/race-tape-220w/)

A static React + Vite dashboard that reconstructs a 3:34 cycling race as 137 contiguous workout-style laps: 68 efforts and 69 Between periods.

An Effort is raw recorded power strictly above 220 W for at least 16 consecutive recorded seconds. Recording gaps are hard barriers; exactly 220 W and shorter surges remain Between. W/kg uses a rider weight of 150 lb.

The repository intentionally contains the complete analyzed ride snapshot, including exact route coordinates. The app makes no external map-tile requests and has no server-side or OpenAI runtime dependency.

## Local development

```bash
npm install
npm run dev
```

## Validation and production build

```bash
npm run check
```

The Vite base is relative, so the generated `dist/` works from either a user Pages domain or a repository subpath. The included GitHub Actions workflow validates the data, builds the app, and deploys `dist/` on pushes to `main`.
