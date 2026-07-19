# UI color packages

## Status and purpose

These are **IMPLEMENTED application color packages**. All ten are selectable in **More → Appearance and units → Color package**, persist with the local app settings and backup format, and apply through the shared semantic color tokens without changing information architecture. Signal Garden is the default for an installation that has no saved package. Strong screenshots supplied by the repository owner remain private edit targets for the Heritage Atlas and Signal Garden reference previews.

Every package reserves color by meaning: current/action, completed/success, coaching/information, caution, destructive, and neutral structure. Text and icons must still communicate state without color alone, and normal text must meet WCAG AA contrast.

## Package comparison

| Package | Canvas / card | Primary / current | Success | Coaching | Warning | Destructive | Character |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Heritage Atlas | `#F5E9C9` / `#FFFDF5` | `#245CA6` | `#287052` | `#E4C768` | `#B87916` | `#A33A32` | Parchment training journal with navy, evergreen, oxblood, cobalt, and antique gold. |
| Signal Garden | `#FFF8E8` / `#FFFFFF` | `#176FD1` | `#168A54` | `#F4C84A` | `#D97A20` | `#E55445` | Bright, energetic athletic interface with forest, vivid blue, coral, sunflower, and mint. |
| Alpine Ledger | `#EDF4F1` / `#FFFFFF` | `#347CB8` | `#205E48` | `#BFDDE8` | `#D9982B` | `#C7463D` | Cool mist, pine, glacier blue, alpine red, and amber. |
| Training Hall | `#F4EBDD` / `#FFFCF7` | `#285CB5` | `#327341` | `#D8B54B` | `#B97722` | `#8E2F3C` | Bone, burgundy, royal blue, varsity green, and mustard. |
| Harbor Pulse | `#F4E5CE` / `#FFFDF8` | `#1987D4` | `#16766F` | `#F3C85B` | `#D67A34` | `#D84B3F` | Sand, deep teal, azure, tomato, and fresh leaf green. |
| Prairie Electric | `#F2E2B9` / `#FFFDF6` | `#3D61C8` | `#4B8338` | `#E7B93F` | `#D47727` | `#C94234` | Wheat, indigo, grass green, orange-red, and cornflower. |
| Redwood Circuit | `#F5E9D8` / `#FFFDFC` | `#294E75` | `#557B5C` | `#D1A568` | `#B96D30` | `#9E4638` | Cream, redwood, sage, navy, and copper. |
| Mediterranean Set | `#F3EFD9` / `#FFFEF7` | `#285FC7` | `#687D2B` | `#E8C83A` | `#C97C2A` | `#C6533F` | Limestone, olive, ultramarine, terracotta, and lemon. |
| Modern Primary | `#F7F5EF` / `#FFFFFF` | `#1769D2` | `#168358` | `#F2C230` | `#D9831E` | `#D64136` | Soft white, dark ink, emerald, cobalt, vermilion, and clean yellow. |
| Night Stadium | `#0C1727` / `#142237` | `#4FA3FF` | `#42CE79` | `#F4C84C` | `#F29C38` | `#FF6B61` | Midnight navy and slate with electric stadium accents. |

## Shared component rules

- Primary buttons use the primary/current color with high-contrast text; success green is reserved for completed sets and finish actions.
- Coaching blocks use a tinted gold/parchment surface with dark text and a colored leading rule, not a full-screen monochrome wash.
- Destructive actions always combine red with explicit copy such as “Cancel Workout” or “Remove.”
- Previous performance uses a neutral or blue-tinted surface; today’s target uses the primary accent; completion uses green.
- Warm-ups use amber/gold labels, working sets use neutral numbered labels, and the current set receives an outline plus text label.
- Bottom navigation remains visually quiet so workout data and the current action retain priority.

## Reference mockups

Heritage Atlas and Signal Garden are rendered against Strong Photos 2–6 as direct style transfers. Each edit preserves the original screen geometry, content, controls, phone chrome, and scroll position while changing color, surface hierarchy, borders, buttons, and status emphasis. The resulting files remain local under the privacy-ignored `docs/design/strong-ui-mockups/` path because their source screenshots contain personal workout details.

The mockup images are references; the corresponding Comprehensive Fitness packages are implemented in `index.html` and selectable in the app. Browser tests verify that all ten choices apply distinct canvas/action/success/destructive token combinations and persist after reload.

## Selection guidance

- Choose **Heritage Atlas** for a warm, premium training-journal feel with restrained but meaningful color.
- Choose **Signal Garden** for the clearest increase in energy, action visibility, and status differentiation.
- Use the remaining eight packages as palette directions if neither fully rendered option is right; any selected package should receive the same five-screen validation before implementation.
