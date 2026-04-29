# Design System Strategy: Cinematic Precision

## 1. Overview & Creative North Star
**Creative North Star: "The Kinetic Broadcast"**
This design system is engineered to feel like a high-end, real-time telemetry dashboard used in elite motorsport broadcasting. It rejects the "web-template" aesthetic in favor of a cinematic, performance-driven interface. The experience is defined by high-contrast typography, a "No-Line" architectural philosophy, and aggressive, intentional use of negative space. We are not just building an app; we are building a mission-control tool where every pixel conveys speed, data integrity, and premium technicality.

---

## 2. Colors & Tonal Architecture
The palette is rooted in deep blacks and tactical greys, punctuated by a high-visibility "Primary Lime" that demands immediate cognitive attention.

### The "No-Line" Rule
Traditional 1px borders are strictly prohibited for sectioning. Structural separation must be achieved through **Tonal Layering**. By shifting between surface tiers, we create a sophisticated "carved" look rather than a "sketched" one.

*   **Background (`#0e0e0e`):** The canvas. Use for the most recessed areas of the UI.
*   **Surface Low (`#131313`):** Primary layout containers.
*   **Surface (`#222222`):** Standard card and module backgrounds.
*   **Surface High (`#262626`):** Interactive elements or elevated "floating" modules.

### Surface Hierarchy & Nesting
To create depth, nest containers using a "Lightness Lift."
*   *Example:* A data table (Surface) sitting inside a layout section (Surface Low) creates a natural, soft edge.
*   **Glassmorphism:** For overlays or navigation bars, use semi-transparent surface colors with a `backdrop-blur: 20px`. This maintains the cinematic depth by allowing the "motion" of the background to bleed through without sacrificing legibility.

---

## 3. Typography: The Editorial Voice
Our typography is the primary driver of the "Cinematic" feel. We pair the technical precision of **Inter** with the aggressive, high-fashion impact of **Epilogue**.

*   **Display & Headlines (Epilogue):** Weight 900, Italic, -0.02em letter-spacing. This is our "Hero" style. It should feel fast and authoritative.
*   **The Signature Name Style:** To emphasize the athlete/competitor, use a dual-tier system:
    *   *First Name:* Small caps, Inter, Medium weight.
    *   *Surname:* Epilogue, Bold Italic, Large (Headline SM/MD).
*   **Labels (Inter):** Uppercase, 0.7rem, 0.08em letter-spacing. Use these for technical metadata and captions.
*   **Body (Inter):** 0.875rem, Weight 400. Optimized for readability against dark backgrounds.

---

## 4. Elevation & Depth
In this system, elevation is a product of light, not lines.

*   **The Layering Principle:** Depth is achieved by stacking. A `surface-container-lowest` module placed on a `surface-container-low` background creates an "inset" look, while a `surface-high` module creates an "outset" look.
*   **Ambient Shadows:** While the style is "flat," floating modals require a subtle "Ambient Glow." Use the `Secondary Blue` or `Primary Lime` at 4% opacity with a 40px blur to simulate the light of a broadcast screen reflecting off a surface.
*   **The Ghost Border Fallback:** If accessibility requires a border, use the `Borders` token (`rgba(73,72,71,0.15)`) only. Never use solid, opaque lines.

---

## 5. Components

### Buttons: High-Action Triggers
*   **Primary:** Lime background (`#d1ff4b`), Text: `#4a6000`. Style: Bold, Italic, Uppercase. Radius: 14px. These should look like physical "Engage" buttons on a steering wheel.
*   **Secondary:** Surface High background, Lime text. For secondary actions that still require brand presence.

### Input Fields: Technical Entry
*   **Surface High** background, 12px radius. 
*   **States:** No default border. On `:focus`, apply a 2px `Secondary Blue` border. This "blue-light" focus state mimics a technical system becoming "active."

### Cards & Modules
*   **Container:** Surface background, 16px radius.
*   **Rule:** Forbid divider lines within cards. Use `24px` or `32px` vertical padding to separate content blocks.

### The "Leaderboard" List
*   List items must not use dividers. Use alternating tonal shifts (Zebra striping) between `Surface Low` and `Surface` if the list is dense.
*   Include a "Live Indicator" component: A small Primary Lime dot with a subtle pulse animation for real-time data points.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use extreme contrast in type scales. A very small label next to a very large italic headline creates the "Editorial" look.
*   **Do** use the "Small Caps + Bold Italic" name styling for every participant entry to maintain brand signature.
*   **Do** use asymmetrical layouts. Let some elements bleed to the edge of the screen while others sit tight in the center.

### Don’t:
*   **Don’t** use shadows to define cards. If the card isn't visible, your background/surface tonal shift is too subtle.
*   **Don’t** use gradients on surfaces. The "cinematic" feel comes from the purity of the flat, dark tones.
*   **Don’t** use standard "Blue" for links. Use the Primary Lime or Secondary Blue tokens exclusively for interactive intent.
*   **Don’t** use 100% white text for everything. Use `Text Secondary` (#888888) for all non-essential info to keep the visual hierarchy focused.