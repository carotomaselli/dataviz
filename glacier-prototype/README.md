# Prototype Specification: Swiss Glaciers

## General

- **Project:** Interactive map showing ... [ADD DESCRIPTION]
- **Technology:** Web prototype using **d3.js** (plain HTML, CSS and JavaScript, no build tools). [ADD DETAILS]
- **Data:** All data files are in the `data/` folder. Use only this data; do not invent values.

# Gletscher als Eiszapfen – Web-Prototyp (d3.js)

Start: `index.html` im Browser öffnen (braucht Internet für d3 von cdnjs). Parameter zum Testen: `?year=2050&glacier=B36-26`.

- `app.js` Zeichnung, Animation, Zeitstrahl, Seitenspalte
- `data.js` vorberechnete Daten (erzeugt)
- `build_data.py` erzeugt `data.js` aus `data/*.csv`: `python3 build_data.py data data.js`

Methode: Ausgangsvolumen je Gletscher V = 0.034 · A^1.36 (Fläche 2000), Verlust pro Jahr = Massenbilanz × Fläche. Lücken in Messreihen werden über das Mittel der Gletscher mit vollständiger Reihe gefüllt. Ab 2026: mittlere Massenbilanz 2011–2025 fortgeschrieben, Fläche schrumpft mit dem Volumen. Das ist eine Trendfortschreibung, keine Klimaprognose.

## How this specification is organized

- Every screen of the prototype has its own folder in `screens/`, numbered in the order a user sees them (`01_overview`, `02_glacier_selected`, …).
- Each screen folder contains a `README.md` with the description of that screen, plus one or more photos of the paper prototype.
- **All images in a screen folder belong to that screen.** `screen.jpg` is the main photo; additional photos show other states of the same screen (e.g. `state_no-data.jpg`).
