# S 1000 RR — 3D Showroom

Interactive Three.js showroom for the 2019 BMW S 1000 RR (Motorsport livery).

## Run it
Browsers block loading 3D files from `file://`, so serve the folder:

    cd s1000rr-showroom
    python3 -m http.server 8000      # or: npx serve
    # open http://localhost:8000

Everything (Three.js included) is bundled in `vendor/`, so it also works offline
(only the Google Fonts are loaded online, with a system-font fallback).

## Files
- `index.html`, `style.css`, `app.js` – the site
- `assets/bmw-s1000rr.glb` – your model, optimised (47 MB → 6.8 MB: WebP textures ≤2048px + meshopt)
- `vendor/three/` – Three.js r160 + the add-ons used

## Customising
- Hotspots: edit the `SPOTS` array in `app.js` (u = rear→front, v = ground→top, w = centre→side)
- Camera angles: `viewDefs()` in `app.js`
- Colours: CSS variables at the top of `style.css` (taken from the livery: M light blue, M blue, M dark blue, M red)
