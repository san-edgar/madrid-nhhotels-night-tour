# Madrid NH Hotels Night Tour (Stage B: playable 3D foundation)

Night drive through Madrid. Visit all 14 NH hotels; each arrival is a
checkpoint (+500 pts). Beat the tour — final score is time-based.

## Run it

```bash
cd game
python3 -m http.server 8123
# open http://localhost:8123/ (or 127.0.0.1:8123)
```

No build step. three.js 0.186.0 loads from the jsDelivr CDN via import map.

## Controls

- W / ↑ — throttle · S / ↓ — brake · A,D / ←,→ — steer
- SPACE — handbrake (drift) · R — reset to last checkpoint · ENTER — start

## Status

- Stage B greybox: real road network (OpenStreetMap, 2,289 roads), real
  building footprints (19,043), 14 hotel checkpoints, arcade drift physics,
  locked chase camera, night lighting rig, HUD + minimap.
- Placeholders: car is a greybox fastback, buildings untextured, HUD unstyled.
- Publish: UNLOCKED by Edgar (2026-10-01); target is GitHub Pages.
  The orchestrator does the publishing — this repo is the game source.

## Debug / capture hooks (not gameplay)

`?debug=drive` autopilot · `?debug=drift` drift weave · `?debug=cp&cp=N`
teleport to beacon N · `?debug=arrival&cp=N` frozen arrival frame ·
`?debug=win` instant win · `?debug=tour` beacon tour · `?look=alt` swap
renderer preset. See tools/stage-b-capture.sh.
