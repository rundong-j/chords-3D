# Chords 3D - Tonnetz on Torus

A Mithril.js + Three.js web app that renders a Tonnetz projected onto a torus surface.

## Features

- 3D torus scene with orbit controls
- Tonnetz graph embedded on torus surface
- Curved interval edges (5ths, minor 3rds, major 3rds)
- Pitch-class labels rendered on the torus
- Visibility culling for labels based on camera and torus occlusion
- UI toggles for interval classes and notation style

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
- Thick lines are rendered with Three.js `LineSegments2` (`LineMaterial`).

