# headlessui-main — Context & Conventions

Single source of truth for working on this app. **Update this file whenever behavior changes.**

A Vite + React (TypeScript) SPA that re-implements the ServiceNow widget in [../widget v2 - azurui/](../widget%20v2%20-%20azurui/) as a standalone browser app. Same backend (ServiceNow scripted REST API `x_gegis_uwm_dashbo/v1/auditpageapi`), same gating rules, two UI variants.

URL routes:
- `/audit/<submissionSysId>?version=<id>` → classic table layout (v1, [AuditPage.tsx](src/pages/AuditPage.tsx) + [FieldsPanel.tsx](src/components/FieldsPanel.tsx))
- `/audit/v2/<submissionSysId>?version=<id>` → redesigned mapping workspace (v2, [AuditPageV2.tsx](src/pages/AuditPageV2.tsx))
- Anything else without a stored auth config → [ConfigPage.tsx](src/pages/ConfigPage.tsx)

`?submissionSysId=<id>` query format is auto-rewritten to path style on first load ([App.tsx:parseAuditLocation](src/App.tsx)).

---

## Files

| Path | Role |
|---|---|
| [src/App.tsx](src/App.tsx) | Route parsing, auth init, page switching |
| [src/pages/AuditPage.tsx](src/pages/AuditPage.tsx) | v1 page — owns state, autosave, version/config plumbing |
| [src/pages/AuditPageV2.tsx](src/pages/AuditPageV2.tsx) | v2 page — same backend, redesigned workspace |
| [src/components/FieldsPanel.tsx](src/components/FieldsPanel.tsx) | v1 sidebar — 6-column table of fields with inline inputs |
| [src/components/PDFViewer.tsx](src/components/PDFViewer.tsx) | PDF.js viewer + annotation canvas + source-coord overlays |
| [src/components/Toast.tsx](src/components/Toast.tsx) | Toast container (driven by `ToastContext`) |
| [src/context/ToastContext.tsx](src/context/ToastContext.tsx) | `useToast()` for inline notifications |
| [src/services/apiService.ts](src/services/apiService.ts) | All `/auditpageapi/*` calls (axios), response normalization |
| [src/services/authService.ts](src/services/authService.ts) | OAuth client-credentials flow, token storage, auto-refresh |
| [src/styles/*.css](src/styles/) | Per-page CSS (audit, auditV2, fieldsPanel, pdfViewer, config, toast) |
| [netlify/functions/](netlify/functions/) | `app-config.mjs` (managed-config probe), `auth-token.mjs` (server-side token exchange to dodge CORS) |
| [vite.config.ts](vite.config.ts) | Vite config |

---

## Auth flow

Two modes, decided at boot in [App.tsx](src/App.tsx) → `authService.loadManagedConfig()`:

1. **Managed** — `/api/app/config` returns `{managedAuthEnabled: true, baseUrl}`. Client-id/secret live server-side (Netlify env), browser hits `/api/auth/token` for a bearer token. Use this in production.
2. **Self-config** — User enters baseUrl/clientId/clientSecret in [ConfigPage.tsx](src/pages/ConfigPage.tsx). Credentials persist to `localStorage` under `snow_auth_config`. Token under `snow_auth_token`. Only for local dev / single-user setups.

Token is auto-refreshed 5 min before expiry ([authService.ts:scheduleTokenRefresh](src/services/authService.ts)). All API calls go through `apiService.ensureClient()` → adds `Authorization: Bearer <token>` interceptor.

---

## Backend endpoints (all under `<baseUrl>/api/x_gegis_uwm_dashbo/v1/auditpageapi/`)

| Method | Path | Purpose |
|---|---|---|
| GET | `config` | Static config (status arrays). **No longer used by the React app** — pulled inline from `fetchMapping.result.config` instead. |
| GET | `fetchMapping/:submissionSysId` | Returns `{result: {submissionNumber, submissionStatusChoice, config, mapping[], versions[], selectedDataExtract}}` |
| GET | `lineOfBusiness/:submissionSysId` | (Unused in this app — defined in `apiService` for completeness) |
| POST | `saveMapping` | `{submissionNumber, dataExtractSysId, updates:[{sys_id, qa_override_value, data_verification, commentary}]}` |
| POST | `markComplete` | `{submissionNumber, dataExtractSysId}` |
| GET | `attachment/:sys_id?format=binary` | PDF bytes — fetched directly by PDFViewer (not via apiService) |

---

## Editable field gating (mirrors widget v2 - azurui)

Three booleans derived per render from the `fetchMapping` response:

```ts
canEditDataVerification = !isReadOnlyVersion && dataVerificationEditStatuses.includes(submissionStatus)
canEditQaOverride       = !isReadOnlyVersion && qaOverrideEditStatuses.includes(submissionStatus)
canEditCommentary       = canEditDataVerification || canEditQaOverride
```

Where:
- `submissionStatus` = `result.submissionStatusChoice` (e.g. `DATA_CAPTURE`, `QUALITY_ASSURANCE`, `LETTER_OF_AUTHORITY`, …)
- `dataVerificationEditStatuses` / `qaOverrideEditStatuses` = `result.config.*` (server-driven)
- `isReadOnlyVersion` = `!result.selectedDataExtract.active` (preferred), falling back to `versions[].active` lookup

**Important:** `isReadOnlyVersion` reads from `selectedDataExtract` first to match the widget's server-resolved version. Picking from `versions[]` is fallback only. ([AuditPageV2.tsx](src/pages/AuditPageV2.tsx) load block, [AuditPage.tsx](src/pages/AuditPage.tsx) load block)

When `canEdit*` is false the corresponding input/button is disabled. The handlers (`handleAcceptField`, `handleToggleConflict`, `handleOverrideChange`) also early-return on the gate so keyboard shortcuts (`A`/`C`) can't bypass it.

Console logs `[AuditV1] gating inputs:` / `[AuditV2] gating inputs:` dump the actual values on load — use these to diagnose "why is this read-only?" reports.

---

## Autosave (per-field debounce, mirrors widget's `autoSaveField`)

Both pages autosave each field independently. No bulk Save button is required during editing (v2 still has a "Save & exit" for explicit flushes).

**Trigger graph:**
- Any state-mutating user action (input keystroke, Accept, Conflict) calls `handleFieldChange` → marks dirty → calls `scheduleAutoSave(fieldId, 600)`.
- Input `onBlur` cancels the pending debounce and fires `autoSaveField(fieldId)` immediately.

**`autoSaveField(fieldId)` bail-outs (logs the reason to console):**
1. Field not found
2. `isReadOnlyVersion` (version is non-active)
3. Status not in any edit list (`canEditDataVerification && canEditQaOverride` both false)
4. Field not in `dirtyFieldIds`
5. `submissionNumber` not loaded yet
6. QA Override is set but Commentary is empty (toast warning, save blocked — same rule as the widget)

On success: removes the sys_id from `dirtyFieldIds`, flashes "Saved <field>" pill for 1.8s. On error: red pill for 4s + toast with the error message.

**Refs vs state (critical):** every gate the saver checks reads from a `*Ref.current` mirror, not the closure-captured state value. Reason: blur/click can fire before React commits the next render, so closures hold stale `dirtyFieldIds` / `canEdit*` / etc. Refs are kept in sync via `useEffect(() => { ref.current = value }, [value])` per piece of state, plus `dirtyFieldIdsRef.current = next` is written *inside* the `setDirtyFieldIds` updater so it's fresh before the next scheduled save fires.

**Debounce mechanism:** `autoSaveDebounceTimersRef` is a `Map<sys_id, timeoutHandle>`. `scheduleAutoSave` clears the existing handle for that sys_id and sets a new one (600ms). Blur reads the same map to cancel + fire immediately. Cleanup useEffect clears all timers on unmount.

UI surface:
- v1: pill in the sidebar header (`fields-panel-autosave-{saving,saved,error}`)
- v2: pill in the footer bar (`audit-v2-autosave-{saving,saved,error}`)

---

## PDFViewer

PDF.js v4. Loads bytes from `/auditpageapi/attachment/<id>?format=binary`. Caches loaded PDFs in a module-level `pdfCache: Map<cacheKey, PDFDocumentProxy>` keyed by `${baseUrl}::${attachmentId}`.

**Render pipeline:** two refs (`requestSeqRef` for PDF load, `pageRenderSeqRef` for page render) ensure stale async work bails out — the right pattern for cancellable async work, no time-based debounce needed.

**Overlays:** `highlightCoords` is a `useMemo` derived from `(navigateSource, sourceOverlays)`. **It must stay `useMemo`, not `useState` + `useEffect`** — when the parent doesn't pass `sourceOverlays`, the default would be a new `[]` ref per render and a `useEffect` dep on it would loop forever via `setHighlightCoords`. The module-level `EMPTY_OVERLAYS` constant is the stable default. (This bit us once — leaving the comment.)

**Wheel-to-paginate:** scrolling past the bottom of one page advances to the next, throttled to one page-flip per 240ms via `wheelLockRef`. `pageTransitionDirectionRef` is used to scroll the new page to top (next) or bottom (prev) after render.

**Coordinate format:** `D(page, x1, y1, x2, y2, x3, y3, x4, y4)` in PDF point units; multiple shapes separated by `;`. Same as the widget. Converted to canvas pixels via `value * 72 * scale`.

---

## State model — v1 ([AuditPage.tsx](src/pages/AuditPage.tsx))

Owns: `fields[]`, `config`, `submissionNumber`, `submissionStatus`, `versions[]`, `selectedVersionSysId`, `isReadOnlyVersion`, `selectedDocument`, `selectedAttachmentId`, `navigateSource` + `navigateSeq`, `dirtyFieldIds`, `autoSaveStatus` + `autoSaveMessage`, and many refs (see Autosave above).

Passes everything down to `<FieldsPanel>` + `<PDFViewer>` as props. FieldsPanel is the "dumb" presentation — all autosave logic lives in AuditPage.

---

## State model — v2 ([AuditPageV2.tsx](src/pages/AuditPageV2.tsx))

Self-contained (no FieldsPanel). Additional concepts:
- **Derived field state** (`deriveFieldState`): `'review' | 'conflict' | 'missing' | 'validated'` — drives tab counts, card accent color, overlay tone
- **Tabs**: `'review' | 'conflicts' | 'missing' | 'validated' | 'all'` (counts shown next to each)
- **Filters**: section, marked-only, override-only, free-text search, sort by confidence/field name, density (comfortable/compact)
- **Keyboard nav**: `J/K` or arrows = next/prev field, `A` = Accept AI value, `C` = toggle conflict, `O` = open override editor, `?` = show shortcuts panel, `Esc` = close. All gated by the same `canEdit*` rules.

Per-field card has expanded view (when selected) with Accept / Conflict / Override buttons + a peek table comparing AI / Verified / Override values.

---

## Conventions / gotchas

- **`isReadOnlyVersion` reads from `selectedDataExtract.active` first.** Falling back to `versions[].active` is for responses that omit `selectedDataExtract`. Don't reverse this — the widget uses the server-resolved field.
- **Config comes from `fetchMapping.result.config`, not the separate `getConfig` endpoint.** Matches the widget. The `apiService.getConfig()` method is kept for compatibility but no longer called from either page.
- **All async saver gating goes through refs.** If you add another field to the gate, mirror it with a `*Ref` and a sync `useEffect`. Closure-captured state will be stale.
- **`handleFieldChange` is the single trigger for autosave.** Don't add `setTimeout(autoSaveField, ...)` in feature handlers — `handleFieldChange` already schedules it via `scheduleAutoSave`.
- **Per-field input `onBlur` cancels the debounce and fires immediately.** When adding a new editable input, wire `onChange` → `handleFieldChange` (which schedules) and `onBlur` → cancel-handle + `autoSaveField`. Don't rely on blur alone — the v2 override input can unmount before blur fires when the user clicks another card.
- **QA Override → Commentary rule blocks the save.** If `qa_override_value` is set with empty `commentary`, `autoSaveField` toasts a warning and returns without POSTing. Mirrors the widget. (v1: commentary is an inline input; v2: user clicks Conflict to add `[qa-conflict]` commentary or types in the override editor.)
- **PDFViewer.highlightCoords stays a `useMemo`.** See PDFViewer section above. Converting back to state + effect will re-introduce an infinite loop.
- **CSS class prefixes are page-scoped.** v2 uses `audit-v2-*`, v1's panel uses `fields-panel-*` / `header-*` / `btn-*`. Don't cross-pollinate.

---

## Local dev

```bash
npm ci
npm run dev      # vite on http://localhost:5173
npm run build    # → dist/
npm run lint     # eslint
```

If Vite reports port 5173 in use, kill the orphan: `netstat -ano | findstr :5173` then `Stop-Process -Id <pid> -Force`. Don't run two dev servers — HMR will land in the wrong instance.

For self-config mode in dev, ServiceNow must allow your dev origin in CORS, OR run the netlify functions locally (`netlify dev`) which proxies the OAuth call server-side.

---

## Deploy

- **Netlify (recommended)** — `netlify deploy --prod`. `netlify.toml` already wires SPA fallback + the two auth functions.
- **EC2 / nginx** — `npm run build` → rsync `dist/` to `/var/www/audit` → nginx with `try_files $uri $uri/ /index.html`. If CORS blocks browser → SN calls, front the API with a same-origin nginx `location /api/ { proxy_pass https://<instance>.service-now.com/api/; }` and point baseUrl at your domain.

---

## Related

- [../widget v2 - azurui/CLAUDE.md](../widget%20v2%20-%20azurui/CLAUDE.md) — the ServiceNow widget this app is a port of. Behaviour rules (gating, autosave, validation) should stay aligned.
- [../widget v2 - property-locations/](../widget%20v2%20-%20property-locations/) — sibling widget, not currently mirrored here.
