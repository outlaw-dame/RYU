# ADR-002: Native Packaging Decision (PWA vs Capacitor)

## Status

**Accepted** -- June 2026

## Context

RYU is a local-first book-social reading app currently distributed as a Progressive Web App (PWA). As the app approaches beta, a decision is needed on whether the PWA distribution model is sufficient or whether native packaging via Capacitor (or similar) is required to meet user expectations on iOS and Android.

Key questions:
- Do PWA capabilities cover all critical user-facing features?
- Would Capacitor provide meaningful capability improvements that justify the maintenance cost?
- What is the right timing for native packaging if it is eventually needed?

## Evaluation

### Pure PWA Capabilities and Limits

| Capability | iOS Safari | Android Chrome | Desktop |
|---|---|---|---|
| **Push Notifications** | Supported (iOS 16.4+) | Full support | Full support |
| **Badge API** | Not supported | Supported | Supported (macOS/Windows) |
| **File Handling API** | Not supported | Supported | Supported |
| **Share Target** | Supported (via manifest) | Full support | Limited |
| **App Store Presence** | Not available | TWA via Play Store | Microsoft Store (PWA) |
| **Background Sync** | Not supported | Supported | Supported |
| **Persistent Storage** | Quota limits, 7-day eviction risk | Stable | Stable |
| **Home Screen Install** | Manual (Add to Home Screen) | Install prompt | Install prompt |

**Key PWA Limitations on iOS:**
- No Badge API means no unread-count indicators on the app icon
- No Background Sync means social activity updates require the app to be open
- Storage can be evicted after 7 days of inactivity in some iOS versions
- No File Handling API registration means the app cannot register as a handler for book file types

**PWA Strengths:**
- Zero friction install (no app store, no review process)
- Instant updates (no store review delay)
- Single codebase, single deployment target
- No native bridge overhead or plugin maintenance
- Push notifications now work on all major platforms (iOS 16.4+)
- Share Target works via web manifest on both iOS and Android
- Web Share API supported across platforms

### Capacitor iOS/Android Packaging

**Benefits:**
- Full native push notification control (APNs/FCM)
- Native file access and document picker
- App store presence and discoverability
- Badge API via native bridge on all platforms
- Background processing and fetch
- Deep linking with native URL schemes
- Biometric authentication integration

**Costs and Risks:**
- Native bridge version drift: Capacitor major versions require migration work
- Plugin maintenance: community plugins may become unmaintained
- Debugging complexity: issues can span web, bridge, and native layers
- Build infrastructure: requires Xcode (macOS) and Android Studio for builds
- App store review process: 1-7 day delays for updates, risk of rejection
- Increased CI/CD complexity (iOS signing, provisioning profiles)
- Two additional deployment targets to test and maintain

### Push Notifications Feasibility

**Web Push (current PWA path):**
- Supported on iOS 16.4+, Android, Desktop
- Uses standard Push API + Service Worker
- No native dependency required
- Requires HTTPS and user permission
- Works in standalone PWA mode on all platforms

**Native Push (Capacitor path):**
- Full APNs/FCM integration
- Background notification handling
- Rich notifications with actions
- Silent push for data sync
- Requires Apple Developer account and FCM setup

**Assessment:** Web Push is sufficient for RYU's social notification needs (new followers, likes, boosts). Rich notification actions and silent data sync are nice-to-have but not critical for a reading app.

### Share Target Behavior

**Current PWA:**
- Registered via `manifest.webmanifest` share_target field
- Works well on Android (appears in system share sheet)
- Works on iOS in standalone PWA mode
- Can receive shared URLs and text

**Native (Capacitor):**
- Native intent handling on Android
- Share Extension on iOS (more reliable, richer UI)
- Can receive file types (EPUB, PDF) directly

**Assessment:** PWA share target handles the primary use case (sharing book URLs/links). File sharing (receiving EPUB/PDF via share) would benefit from native but is not a beta requirement.

### File Handling

**Current PWA:**
- File Handling API: supported on Android Chrome and Desktop, not iOS Safari
- Fallback: manual file input element (`<input type="file">`)
- Can read files selected by user in all browsers

**Native (Capacitor):**
- Register as file type handler (EPUB, PDF, OPDS)
- Access Downloads folder directly
- Better integration with "Open with" system menus

**Assessment:** The fallback file input works everywhere. File type registration is a convenience improvement, not a blocker.

### App Store Implications

**Listing:**
- App Store: potential for discovery, but requires Apple Developer Program ($99/year)
- Play Store: TWA (Trusted Web Activity) allows PWA listing without full native build
- Neither store listing is required for beta

**Review Process:**
- Apple: 1-7 day review, strict guidelines (potential rejection for "web-wrapper" apps)
- Google: 1-3 day review, more lenient with TWAs/PWAs
- Updates delayed by review cycle (vs instant PWA updates)

**Assessment:** App store presence provides discoverability but adds friction, cost, and delay. For a beta targeting existing community members (via Mastodon/fediverse), direct PWA install is sufficient.

### Native Bridge Risks

1. **Version drift:** Capacitor major versions (v4 -> v5 -> v6) require migration effort and may break plugins
2. **Plugin maintenance:** Community plugins (file-opener, share, badge) may lag behind OS updates
3. **Debugging complexity:** Stack traces span JavaScript, native bridge, and platform-specific code
4. **Build environment:** Requires Xcode on macOS for iOS builds, Android Studio for Android
5. **CI cost:** Native builds are slower and require specialized runners (macOS for iOS)
6. **Dependency creep:** Once native plugins are adopted, removing them becomes increasingly difficult

## Decision

**PWA-only for beta release. Capacitor deferred to a future phase (post-beta) if user feedback demonstrates need.**

### Rationale

1. **Push notifications work on all target platforms** via Web Push (iOS 16.4+ resolved the last major gap)
2. **Share Target works via manifest** for the primary use case (URL/text sharing)
3. **File handling** has acceptable fallbacks (file input element) on iOS
4. **No app store presence is needed for beta** -- distribution is via direct URL to fediverse community
5. **Badge API absence on iOS** is acceptable for beta (low-impact limitation)
6. **Maintenance cost of Capacitor** is not justified by the marginal capability gains at this stage
7. **Instant updates** via PWA deployment are critical during beta iteration

### When to Revisit

Capacitor packaging should be reconsidered if:
- User research shows significant install friction (users expect app store presence)
- A feature requiring native file type registration becomes a priority (EPUB import via "Open with")
- Background sync becomes critical for social feed freshness
- iOS Badge API support does not materialize in future Safari versions

### If Capacitor is Adopted Later

A separate packaging track would be created with:
- Dedicated `capacitor/` directory at project root
- Platform-specific config (`capacitor.config.ts`)
- CI/CD pipeline for iOS/Android builds (GitHub Actions with macOS runner)
- No changes to the core `src/` code -- Capacitor wraps the existing web build
- Feature flags for native-only capabilities
- Acceptance criteria: all existing PWA tests continue to pass unchanged

## Consequences

- No native dependencies are introduced for beta
- The app remains a pure PWA with zero native bridge code
- No Apple Developer Program enrollment required for beta
- CI/CD remains simple (web build + deploy only)
- The `src/native-packaging/` module provides a programmatic capability matrix for future evaluation
- Beta readiness checklist includes packaging decision status
- Future agents MUST NOT introduce Capacitor, native plugins, or app store packaging without a new ADR

## References

- Phase 39: Beta readiness audit
- Phase 40: Native packaging decision
- iOS 16.4 Web Push: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Capacitor documentation: https://capacitorjs.com/docs
- PWA capabilities: https://web.dev/articles/what-are-pwas
