# Platform & UI Foundation Architecture

## Icon System: Phosphor

RYU uses **[Phosphor Icons](https://phosphoricons.com/)** (`@phosphor-icons/react`) as the icon library.

### Rules

- All icon rendering goes through `src/design/icons/AppIcon.tsx`
- Semantic icon names are mapped in `src/design/icons/iconMap.ts`
- Direct imports from `@phosphor-icons/react` are **only allowed** in:
  - `src/design/icons/AppIcon.tsx`
  - `src/design/icons/iconMap.ts`
  - `src/design/icons/iconTypes.ts`
  - `src/main.tsx` (IconContext provider)
- Run `npm run check:icons` to verify compliance
- There is **no Iconoir dependency** — any references to Iconoir in old PR descriptions are outdated

### Adding a new icon

1. Add the Phosphor import to `src/design/icons/iconMap.ts`
2. Add the semantic name to the `AppIconName` type
3. Map it in the `iconMap` record
4. Use `<AppIcon name="your-name" />` in components

## Framework7 Integration

RYU uses **Framework7** (`framework7` + `framework7-react`) for adaptive UI primitives.

### Initialization

- F7 is initialized **once** in `src/main.tsx` via `Framework7.use(Framework7React)`
- Theme is set from `detectPlatform().frameworkTheme` (iOS on Apple, Material elsewhere)
- The theme is computed at startup and does not change mid-session (OS does not change mid-session)
- The app is wrapped in `<F7App>` → `<View main>` in `main.tsx`

### Adaptive Primitives

Located in `src/design/adaptive/`:

| Component | Purpose |
|-----------|---------|
| `AdaptiveSheet` | Bottom sheet (swipe, backdrop, escape, safe areas) |
| `AdaptiveButton` | F7-backed button with variant support |
| `AdaptiveTextField` | Native input/textarea with keyboard hints |
| `AdaptiveSearchField` | Search input with icon, clear button, native attributes |

### Migration Status

- ✅ F7 initialized with auto theme
- ✅ Platform detection (OS, device class, display mode, capabilities)
- ✅ Root data attributes (`data-ryu-os`, `data-ryu-device`, etc.)
- ✅ ComposeSheet uses AdaptiveSheet
- ✅ AppTabBar uses AppIcon
- ✅ Search inputs use AdaptiveSearchField
- ⬜ Remaining screens still use custom inline styles (gradual migration)
- ⬜ F7 Page/Navbar/Toolbar not yet adopted for navigation

## Platform Detection

Located in `src/platform/`:

- `detectPlatform.ts` — OS, device class, display mode, input capabilities
- `PlatformProvider.tsx` — React context, sets root data attributes
- `platformCapabilities.ts` — Convenience hooks (`useIsIOS()`, `useIsMobile()`, etc.)
- All detection functions include SSR/non-browser guards

## PWA Manifest

Located at `public/manifest.webmanifest`:

- ✅ `display: "standalone"` with `display_override` for window-controls-overlay
- ✅ Icons: 192px, 512px (any + maskable), SVG, Apple touch icon
- ✅ `share_target` for receiving shared content
- ✅ `protocol_handlers` for `web+ryu://` links
- ✅ `launch_handler: "navigate-existing"`
- ✅ All icon files verified on disk

## Service Worker

- Registered in `main.tsx` on window load
- Located at `public/sw.js`
- Should not fight local-first data behavior (RxDB owns persistence)
