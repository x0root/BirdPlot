# BirdPlot 0.4.1 — Complete Rebrand & Modern UI Overhaul

## Rebranding to BirdPlot EVERYTHING
- **Project Identity**: The entire extension is now **BirdPlot**.
  - Name in `manifest.json`: **BirdPlot — See what AI means**
  - Action title: **BirdPlot setup**
  - Package: **birdplot-extension** v0.4.1
  - Global API: `globalThis.BirdPlotRepair` (with `globalThis.StudentVizRepair` maintained for seamless backwards compatibility)
- **Updated AI Instruction Protocol**:
  - Primary code flags: `# START_BIRDPLOT` and `# END_BIRDPLOT` (with `# START_STUDENTVIZ` / `# END_STUDENTVIZ` supported as transparent aliases)
  - Primary code fences: ```` ```birdplot-python ````, ```` ```birdplot ````, ```` ```python ````, and ```` ```studentviz-python ````
  - Instruction prompt updated in `popup.js` with modern BirdPlot branding

## UI Overhaul: Clean, Sleek & Minimalist
- **Extension Popup Refresh**:
  - Modern tech aesthetic inspired by Vercel and Linear with refined typography and soft ambient shadows
  - Brand Mark: Custom geometric origami bird icon SVG with an indigo gradient
  - Status Indicator: Animated emerald pulsating pill showing `WASM 0.4.1`
  - Tactile Primary Button: Polished "Copy AI instructions" button with copy SVG icon, hover elevation, and an animated checkmark state on click (`✓ Copied!`)
  - Library Chips: Visual pill badges highlighting key visualization engines (`Matplotlib`, `Plotly 3D`, `Animations (GIF)`, `NumPy`, `SciPy`, `SymPy`, `+29 more`)
  - Step Cards: Clean numbered step cards with soft tinted badges (`01`, `02`, `03`)
  - Smooth Switch: iOS-style toggle with smooth cubic-bezier transitions
- **Injected Chat Card Redesign**:
  - Brand Bar: Sleek 44px toolbar with the BirdPlot bird icon SVG and minimalist typography
  - Micro Badges: Refined category pills (`PYTHON`, `3D SCENE`, `ANIMATION`, `CHEMISTRY`, `GEOMETRY`, `GRAPH`)
  - Ghost Action Buttons: Refined `Code`, `↺ Retry`, `Hide` with subtle hover borders and active click feedback
  - Scale Segment Toggle: Segmented scale pill (`Fit`, `75%`, `50%`, `100%`) with active tint
  - Loading State: Modern pulsing spinner ring with clean status text: `Executing Python in Pyodide…`
  - Error Callout: Crisp modern error banner with rounded corners, rose tint, and collapsible monospace trace
  - Pure White Stage: High-contrast, clean rendering container with zero tint tampering
- **Plotly & 3D WebGL Polish**:
  - Resilient communication handshake: Channel-bound message protocol that eliminates race conditions
  - Full animation frame support: Automatically uses `Plotly.newPlot` for framed figures so scrub sliders and play buttons work seamlessly
  - Sandbox CSP optimization: Full permissions for Web Workers and blob URLs for high-performance 3D WebGL scenes
