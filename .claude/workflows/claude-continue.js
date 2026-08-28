export const meta = {
  name: 'selbe-implement',
  description: 'Audit findings-ийг 12 чиглэлээр (файл эзэмшил давхцахгүй) хэрэгжүүлэх',
  phases: [{ title: 'Fix', detail: '12 fixer — модуль тус бүрээр' }],
}

const AUDIT_DIR = 'C:\\Users\\ln9nr\\.claude\\jobs\\7426c218\\tmp\\audit'

const CTX = `
You are FIXING audited issues in the "Selbe" project at E:\\Selbe_db — a Next.js 15 + React 19 + ArcGIS JS SDK (@arcgis/core) GIS/IoT dashboard portal. UI language: Mongolian (Cyrillic). Client-only SPA (dynamic ssr:false). Data from ArcGIS FeatureServers + custom endpoints.

DESIGN SYSTEM (envhub language — documented in src/app/globals.css):
- Surfaces --bg/--surface/--surface-2/--sunken; depth via hairline borders (--line/--line-strong), shadows ONLY on floating elements (tooltip/menu).
- ONE data color --data; categorical identity palette --c1..--c8 (CVD-validated); status --good/--warn/--bad with text-safe --good-ink/--warn-ink/--bad-ink.
- NEW TOKEN just added: **--hue-ink** — ink for text ON accent/status-colored fills (light: #fff, dark: #0f1720). Use var(--hue-ink) wherever white text sits on var(--hue)/var(--data)/bright status fills.
- Inter only (--font-sans); numbers use class "num"; micro-headers class "eyebrow"; radius tokens --r-sm:2px/--r:3px/--r-lg:4px (+99px pills); spacing --s1..--s9; motion var(--ease); dark theme is DEFAULT, light must also work.

HOUSE STYLE: files carry dated Mongolian ⚠️ comments documenting deliberate decisions and past regressions. READ them; NEVER "fix" a documented deliberate decision. When your fix guards a non-obvious trap, add a brief Mongolian ⚠️ comment in the same style. Do not add narration comments ("changed X to Y").

YOUR PROCESS:
1. Read your findings JSON file (path below). It is an array of {severity, kind, file, line, title, detail, fix, confidence}.
2. For each finding: open the file, VERIFY the issue exists in the CURRENT code (line numbers may have shifted). If it is a false positive or a documented deliberate decision — skip with action "skipped" and a reason.
3. Fix ALL real high and medium findings. Fix low findings when the fix is safe and clearly an improvement. Prefer the finding's proposed fix unless you find a better minimal approach that respects the conventions.
4. Use targeted Edit operations — never rewrite a whole file. Preserve CRLF/indentation/comment style. TypeScript must stay valid (strict mode).

HARD RULES:
- Edit ONLY the files listed as YOURS. Everything else is read-only reference (other agents own them).
- Do NOT run tsc/eslint/tests/dev server; do NOT install packages; do NOT delete files; do NOT git commit; do NOT create new files unless explicitly allowed in your slice notes.
- No new dependencies, no new fonts, no hardcoded colors where a token exists.
- ArcGIS lifecycle care: every .on()/.watch() handle removed on cleanup; no leaks; respect the module-cached Map pattern in MapCanvas.
- If a fix would require editing a file you do not own, do the part inside your files and mark the rest "report_only" with a precise note.

RETURN (structured): summary; edited_files (repo-relative); results: one entry PER finding you processed with action fixed|partial|skipped|report_only and a short note (for "fixed" say what you changed; for "skipped" why).`

const OUT_SCHEMA = {
  type: 'object',
  required: ['summary', 'edited_files', 'results'],
  properties: {
    summary: { type: 'string' },
    edited_files: { type: 'array', items: { type: 'string' } },
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'action', 'note'],
        properties: {
          title: { type: 'string' },
          action: { enum: ['fixed', 'partial', 'skipped', 'report_only'] },
          note: { type: 'string' },
        },
      },
    },
  },
}

const SLICES = [
  {
    key: 'shell',
    own: 'src/components/Portal.tsx, src/components/ViewRail.tsx, src/components/Home.tsx, src/components/AuthGate.tsx, src/components/UserAdmin.tsx, src/components/Icon.tsx, src/app/shell.module.css, src/components/home.module.css, src/components/auth.module.css, src/components/userAdmin.module.css, src/lib/permissions.ts, src/lib/permsRemote.ts, src/lib/theme.tsx, src/lib/themeKey.ts, src/lib/urlState.ts',
    notes: `- "Permissions table org-shared editable": the real fix is ArcGIS item sharing config (server side) — in code, correct the misleading comment in permsRemote.ts and mark the finding report_only with exact instructions (capabilities=Query for org, editing via owner/admin only).
- "signOut only clears local credentials": implement the oauth2/signout redirect as proposed (find portalUrl/appId in AuthGate).
- White-on-accent contrast: use the new var(--hue-ink) token in shell.module.css (.mapBtnOn, .tsTabOn), home.module.css (.signIn, .avatarFallback), userAdmin.module.css (.pageBadge, .addBtn), auth.module.css (.btn).
- theme.tsx first-visit fallback must match layout.tsx's dark default.
- ?v=__proto__ crash: validate with Object.hasOwn(VIEW_BY_KEY, v) style checks (also fix scopeFromUrl-like sites in YOUR files only; Root.tsx is NOT yours — if Root.tsx has the same hole, report_only).
- Dead CSS removal: verify with Grep across src that a class is truly unreferenced before deleting.`,
  },
  {
    key: 'map',
    own: 'src/components/MapCanvas.tsx, src/components/map.module.css, src/lib/webmapStyle.ts, src/lib/scene3d.ts, src/lib/plan2d.ts, src/lib/silenceOrthoLogs.ts, src/components/LayerCatalog.tsx, src/components/LayerSwatch.tsx, src/components/OpacityPanel.tsx, src/components/ZoneFilter.tsx, src/components/catalog.module.css, src/components/tree.module.css, src/components/opacity.module.css, src/components/swatch.module.css',
    notes: `- Findings pointing at src/modules/Gazar.tsx and src/modules/Iot.tsx are handled by other agents — mark those "report_only" without editing.
- pickByQuery filter bypass: include the layer's active definitionExpression in the fallback REST query where.
- Camera teleport on dim switch: preserve the current viewpoint (capture center/scale or camera before destroy, apply to the next view) unless a ⚠️ comment documents the reset as deliberate.
- Fullscreen: make the button a real <button> with keyboard activation and dynamic label; surfacing the buried toolbars can be partial (report_only for larger UX redesign).
- SketchViewModel update storm: only run the expensive query on event.state === 'complete' (verify event shape first).
- Esri LayerList conflict: prefer syncing widget-initiated visibility changes back into React state (watch visible) or make the widget read-only follower — choose the minimal robust option.`,
  },
  {
    key: 'services',
    own: 'src/lib/services.ts, src/lib/query.ts, src/lib/useAsync.ts, src/lib/format.ts, src/lib/totals.ts, src/lib/land.ts, src/lib/filter.tsx, src/lib/blockProgress.ts, src/lib/docs.ts, src/lib/brief.ts, src/lib/financeFieldLabels.ts, src/lib/filters.check.mjs, src/lib/series.check.mjs, src/lib/blockProgress.check.mjs',
    notes: `- You MAY use curl (Bash) against the public ArcGIS REST services to verify layer/field facts before config edits. Never guess a layer id.
- khil2 wrong mapping: probe the TD (test_data) FeatureServer layer list to find the true "Сэлбэ 2" boundary layer (audit verified 2 polygons ~21.8 ha exist); if genuinely absent from TD, point khil2 back at the legacy service that still hosts it. Verify by querying the chosen layer.
- Cost model collapse: the legacy Selbe_ET service still has negj_une cost fields; restore per-layer cost entries for the ~20 migrated layers ONLY where you can verify the legacy field exists and the layer mapping is unambiguous (probe with f=json). Partial restoration with a precise note is better than guessing.
- blockProgress: route its fetches through the shared limiter/retry in query.ts without changing its public API.
- format.ts date()/mnt(0): check all call sites with Grep before changing semantics; if a change would alter test expectations (.check.mjs), update the check file only if the new behavior is clearly more correct.
- The tests in src/lib/*.check.mjs hit live services; keep them passing conceptually but do NOT run them.`,
  },
  {
    key: 'dashboard',
    own: 'src/modules/Dashboard.tsx, src/modules/dashboard.module.css, src/modules/ViewPanel.tsx, src/modules/overview.module.css',
    notes: `- overview.module.css findings from other slices are YOURS: (1) active map-tool buttons white-on-cyan → var(--hue-ink); (2) dead IoT CSS left after migration to iot.module.css — verify with Grep then remove; (3) ~350 lines of dead CSS — remove ONLY selectors you verify unreferenced with Grep across src (class names are used via CSS-module imports — grep for the identifier, e.g. "ringTop").
- Detail-mode grid hole (high): implement the map row-span fix; verify against the actual JSX structure in Dashboard.tsx; update the stale comment.
- «Эх үүсвэр» NaN (high): use the module's own srcNum/srcStr helpers as proposed.
- Error surfacing: reuse the ui.tsx primitives (Data/Empty/Loading) and useAsync retry where available rather than inventing new patterns.`,
  },
  {
    key: 'domainA',
    own: 'src/modules/Gazar.tsx, src/modules/gazar.module.css, src/modules/Habea.tsx, src/modules/habea.module.css, src/modules/Irged.tsx, src/modules/irged.module.css, src/modules/Finance.tsx, src/modules/finance.module.css, src/modules/Tailan.tsx, src/modules/report.module.css, src/modules/survey.module.css',
    notes: `- Finance.tsx is YOURS and it exports helpers used by Tsogts.tsx and ExecKpi.tsx (other agents) — keep every exported signature stable.
- Add module-level caching to loadFinData (memoized promise like live.ts does) — this also fixes findings owned by other slices; do it here.
- ComboChart distortion (preserveAspectRatio none): fix inside Finance.tsx so both Finance and Tsogts render correctly.
- Gazar map onPick dead scaffolding: either wire pickRef properly to a real pick handler or remove the dead cursor/hover affordance — choose what the surrounding ⚠️ comments support.
- report.module.css print-from-dark: force the light palette under @media print (tokens can be re-declared there).
- Tailan email flow: emailReport.ts belongs to another agent — fix only the Tailan.tsx side (error surfacing, unreachable UI paths); recipients constant lives in emailReport.ts → report_only for that part.
- survey.module.css is dead (imported nowhere): do NOT delete the file; leave a header comment marking it dormant, and mark the finding partial.`,
  },
  {
    key: 'domainB',
    own: 'src/modules/Tsogts.tsx, src/modules/tsogts.module.css, src/modules/Bagts.tsx, src/modules/BuildingPanel.tsx, src/modules/monitor.check.mjs, src/modules/bagts.check.mjs',
    notes: `- bagtsKey collision «БАГЦ 1-4» vs «Багц 14» (high): fix the key normalization so range rows cannot collide with real pack numbers; keep monitor.check/bagts.check expectations in mind (you own those check files — update them only if the new behavior is clearly more correct).
- Do NOT edit src/modules/Finance.tsx (another agent fixes ComboChart internals there) — for the squashed ComboChart in the 250px row, fix what you can from the call site (container/props); else report_only.
- Ring null→0 false «0%»: pass null through (Ring already handles null correctly).
- Stale highlight on pack switch: clear the previous highlight in the same effect that applies the new one (see ViewPanel.tsx exemplary ref-based cleanup pattern).`,
  },
  {
    key: 'iot',
    own: 'src/modules/Iot.tsx, src/modules/iot.module.css, src/lib/sensors.ts, src/lib/agg.ts, src/lib/live.ts',
    notes: `- This module is new and unfinished — raise it to production grade. All three highs are real: (1) chart time axis must show timestamps, not values; (2) sensors cache must have a TTL + periodic refresh (follow live.ts's existing polling pattern); (3) error state must be honest and the retry path reachable.
- Freshness donut double legend: use the Donut built-in legend only.
- dim can be 'bim' but IoT offers 2D/3D only: clamp to '2d' on entry (setDim) — check how Portal passes dim.
- ~800 tab stops from Trend points: Trend lives in ui.tsx which the ORCHESTRATOR is fixing (roving tabindex) — mark that finding report_only; do NOT edit ui.tsx.
- Map sensor picking: if wiring a real onPick flow is too large, at minimum remove the false affordance and stabilize the memo(MapCanvas) props (hoist the noop). Document what a full linkage needs (report_only note).
- overview.module.css dead IoT CSS belongs to the dashboard agent — report_only.
- Use var(--hue-ink), spacing tokens --s*, and format.ts helpers (fmt/num formatting) for unformatted values.`,
  },
  {
    key: 'sheet',
    own: 'src/modules/sheet/Sheet.tsx, src/modules/sheet/Pivot.tsx, src/modules/sheet/FillNew.tsx, src/modules/sheet/Level5.tsx, src/modules/sheet/Conclusion.tsx, src/modules/sheet/Wbs.tsx, src/modules/sheet/colWidths.tsx, src/modules/sheet/ags.ts, src/modules/sheet/bagts.pkg.ts, src/modules/sheet/bagts.trees.ts, src/modules/sheet/bagtsSheet.ts, src/modules/sheet/wbs.data.ts, src/modules/sheet/sheet.module.css, src/modules/sheet/floor.check.mjs',
    notes: `- Publish button contrast (high): var(--hue-ink) on the status-green fill (or --good-ink background with white — pick the better contrast in BOTH themes).
- FillNew unsaved-changes guard (high): add beforeunload + in-app navigation guard for dirty state, and persist a draft (sessionStorage) like Pivot's draft slot if feasible; partial is acceptable with a clear note.
- Stale-write publish: send only the edited attribute fields in applyEdits, not whole rows, so concurrent edits to other fields survive.
- Ctrl+S with open editor: commit the in-progress cell value before publishing.
- Crosshair perf: prefer CSS :hover / CSS-variable based highlight over per-cell React state.
- Findings marked [unmounted] concern pages not currently routed — still fix cheap ones; skip risky rewrites with a note.
- floor.check.mjs must stay conceptually green (cumulative floor guard) — if you add the missing guard in FillNew, mirror the check's rules.`,
  },
  {
    key: 'suitCore',
    own: 'src/modules/analysis/Suitability.tsx, src/modules/analysis/SuitMap.tsx, src/modules/analysis/SuitDetail.tsx, src/modules/analysis/suitability.module.css, src/lib/analysis/config.ts, src/lib/analysis/data.ts, src/lib/analysis/score.ts, src/lib/analysis/costs.ts, src/lib/analysis/transport.ts, src/lib/analysis/transport.check.mjs',
    notes: `- The mojibake finding is ALREADY FIXED by the orchestrator — Suitability.tsx is now clean UTF-8. Skip it (action skipped, note "fixed upstream"). Line numbers in other Suitability findings should now match HEAD-era numbering.
- fetchAll pagination: advance offset by records actually received.
- Hardcoded dark-only palettes (basemap gallery row, hover-panel status colors): replace with tokens (--surface/--ink/--line, --good-ink/--bad-ink/--warn-ink).
- ≤1100px clipped layout: make the fixed grid rows scrollable/min-content so the right column is reachable.
- ECON_SCORE dead code: remove it and its stale comment (verify unreferenced with Grep first).`,
  },
  {
    key: 'suitSub',
    own: 'src/modules/analysis/suit/Urban.tsx, src/modules/analysis/suit/TrafficOverlay.tsx, src/modules/analysis/suit/SimulationPanel.tsx, src/modules/analysis/suit/Economics.tsx, src/modules/analysis/suit/Timeline.tsx, src/modules/analysis/suit/Layout.tsx, src/modules/analysis/suit/Ranking.tsx, src/modules/analysis/suit/BlendCard.tsx, src/modules/analysis/suit/TransportPanel.tsx, src/modules/analysis/suit/simulation.module.css, src/modules/analysis/suit/simulation.ts, src/modules/analysis/suit/transportModes.ts, src/modules/analysis/suit/netSources.ts, src/modules/analysis/suit/roadNet.ts, src/modules/analysis/suit/roadDemand.ts, src/modules/analysis/suit/busAccess.ts, src/modules/analysis/suit/buildings.ts, src/modules/analysis/suit/osmNet.ts, src/modules/analysis/suit/heat.ts, src/modules/analysis/suit/model.ts, src/modules/analysis/suit/format.ts, src/modules/analysis/suit/traffic.ts',
    notes: `- traffic.ts has a 2154-line regression check (traffic.check.mjs, NOT yours to edit) — avoid behavioral changes to traffic.ts.
- Dead code (osmNet.ts fully dead, roadNet.ts dead exports, unreachable BlendCard/Economics pair): do NOT delete files; remove dead exports only after Grep-verifying zero references, and add a dormant-file header comment where the whole file is unused.
- Spinner-forever and stale-readout fixes: follow the existing loading/error patterns in the same files.
- tReadout hardcoded colors → --good-ink/--warn-ink/--bad-ink tokens.
- role=tablist without semantics: either add proper arrow-key roving tabindex (copy Tabs in ui.tsx) or downgrade the roles honestly.`,
  },
  {
    key: 'agentAI',
    own: 'src/components/AgentChat.tsx, src/components/AgentMarkdown.tsx, src/components/AgentChart.tsx, src/components/agent.module.css, src/lib/agent/tools.ts, src/lib/agent/registry.ts, src/lib/agent/datasets.ts, src/lib/agent/overview.ts, src/lib/agent/client.ts, src/lib/agent/notes.ts, src/lib/agent/chart.ts, src/lib/agent/compute.ts, src/lib/agent/format.ts, src/lib/agent/agent.check.mjs',
    notes: `- Both highs (history clear corruption; markdown chart-fence swallow) have precise proposed fixes — implement them.
- ds:cashflow2 view gating: check how 'view' gating works in datasets.ts/tools.ts; extend so finance-view users can query it (e.g. allow an array of views) without weakening the sensitive gating.
- Abort → ArcGIS queries: thread an AbortSignal from client.ts through tools.ts query calls where the plumbing is reasonable; partial ok.
- Scroll anchoring: only auto-scroll when the user is already at the bottom.
- Dialog a11y: focus the input on open, Escape closes, aria-live polite on the progress log.
- agent.check.mjs is YOURS: fix the mislabeled finance-scope assertion (use scope ['finance'] and add the refusal counterpart) — the orchestrator will run it after.
- send button contrast → var(--hue-ink).`,
  },
  {
    key: 'kpiDocs',
    own: 'src/components/ExecKpi.tsx, src/components/execKpi.module.css, src/components/DocViewer.tsx, src/components/docviewer.module.css, src/lib/emailReport.ts, src/lib/reportPdf.ts',
    notes: `- ExecKpi error surfacing (high): failed loaders must show an error state with retry, not '…' forever.
- emailReport dead Outlook/OWA fallback (high): make the documented fallback reachable (fix the branch logic); keep the .eml approach.
- Hardcoded test recipient: extract to a clearly named constant at the top with a Mongolian ⚠️ comment that it MUST be replaced with the real distribution list; report_only for choosing actual addresses.
- loadFinData caching is being fixed in Finance.tsx by another agent — skip that finding (note it). For the bundle-size finding, lazy-load the heavy imports inside ExecKpi (dynamic import in the loader effect) WITHOUT editing Finance.tsx/Dashboard.tsx.
- DocViewer modal: focus management + Escape + loading/error state for the iframe.
- Card hover box-shadow violates the no-shadow rule → hairline border-color change instead.`,
  },
]

phase('Fix')
log('12 fixer агент зэрэг ажиллаж эхэллээ')
const results = await parallel(SLICES.map((sl) => () =>
  agent(
    `${CTX}\n\nYOUR SLICE: "${sl.key}"\nYOUR FINDINGS FILE (Read it first): ${AUDIT_DIR}\\${sl.key}.json\n\nFILES YOU OWN (may edit — everything else read-only):\n${sl.own}\n\nSLICE NOTES:\n${sl.notes}`,
    { label: `fix:${sl.key}`, phase: 'Fix', schema: OUT_SCHEMA },
  ).then((r) => (r ? { slice: sl.key, ...r } : null)),
))

const ok = results.filter(Boolean)
const tally = { fixed: 0, partial: 0, skipped: 0, report_only: 0 }
for (const r of ok) for (const x of r.results) tally[x.action] = (tally[x.action] || 0) + 1
log(`Дууслаа: ${ok.length}/12 slice · fixed ${tally.fixed} · partial ${tally.partial} · skipped ${tally.skipped} · report ${tally.report_only}`)
return { tally, slices: ok }