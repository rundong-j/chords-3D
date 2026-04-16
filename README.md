# Chords 3D - Tonnetz on Torus

A Mithril.js + Three.js web app that renders a Tonnetz projected onto a torus surface.

## Features

- 3D torus scene with orbit controls
- Tonnetz graph embedded on torus surface
- Curved interval edges (5ths, minor 3rds, major 3rds) rendered with thick `LineSegments2` lines
- Pitch-class labels rendered directly on the torus surface
- Label visibility culling based on camera-facing check + torus occlusion
- Camera-aware label orientation for improved readability in tilted views
- UI toggles for interval classes and notation style
- Interactive sound:
  - click a pitch label to play its single-note tone
  - click a Tonnetz triangle on the torus to play its triad chord

## Tech Stack

- [Mithril.js](https://mithril.js.org/)
- [Three.js](https://threejs.org/)
- [Vite](https://vitejs.dev/)

## Getting Started

### Prerequisites

- Node.js 18+ (recommended)
- npm

### Install

```bash
npm install
```

### Run (dev)

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Network Testing (phone/tablet)

Vite is configured to bind to all interfaces (`0.0.0.0`).
Use the network URL shown by Vite (for example `http://10.0.0.5:5173`).

## Project Structure

- `src/main.js` - scene setup, graph rendering, interaction, UI
- `src/tonnetz.js` - Tonnetz graph logic + torus math helpers
- `src/style.css` - app and UI styling
- `vite.config.js` - dev/preview host + ports

## Notes

- Current Tonnetz grid uses 12 steps around the fifths direction and 8 around the minor-third direction.
- Tonnetz rows are staggered in torus parameter space to make triangles appear closer to isosceles.
- Edge/label layering is tuned so torus is underneath, lines float just above the surface, and labels render above lines.
- Thick lines are rendered with Three.js `LineSegments2` + `LineMaterial`.

