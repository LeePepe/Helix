# Ultracode Workflow Scripts

Ready-to-run `Workflow` tool scripts that pipeline the existing `helix-*` agents with adversarial verification. The orchestrating skill (`helix-fit-finish` / `helix-gen-code`) passes `args` with the prepared session. Adapt agent labels/paths as needed.

## fit-finish — fan-out + multi-lens verify

```js
export const meta = {
  name: 'helix-fit-finish-ultra',
  description: 'Compare Figma vs code with per-UIPart fan-out and 3-lens adversarial diff verification',
  phases: [{ title: 'Analyze' }, { title: 'Collect' }, { title: 'Compare' }, { title: 'Verify' }],
}
const { session_dir, domains, focusAreas } = args
await parallel([
  () => agent(`helix-design-system-analyzer. session_dir:${session_dir} focusAreas:${focusAreas}`, {phase:'Analyze'}),
  () => agent(`helix-code-analyzer. session_dir:${session_dir}`, {phase:'Analyze'}),
])
await agent(`helix-figma-collector. session_dir:${session_dir} domains:${JSON.stringify(domains)}`, {phase:'Collect'})
const cmp = await agent(`helix-comparer. session_dir:${session_dir}. Return JSON {diffs:[{id,desc,severity,file}]}`,
  {phase:'Compare', schema:{type:'object',properties:{diffs:{type:'array',items:{type:'object'}}},required:['diffs']}})
const LENS = ['visible in screenshot', 'token truly exists in guide', 'severity justified']
const judged = await parallel((cmp.diffs||[]).map(d => () =>
  parallel(LENS.map(l => () => agent(`Refute diff via lens "${l}": ${JSON.stringify(d)}. real=false if unsure`,
    {phase:'Verify', schema:{type:'object',properties:{real:{type:'boolean'}},required:['real']}})))
  .then(v => ({d, keep: v.filter(Boolean).filter(x=>x.real).length>=2}))))
return { confirmed: judged.filter(x=>x.keep).map(x=>x.d) }
```

## gen-code — judge panel of plans

```js
export const meta = {
  name: 'helix-gen-code-ultra',
  description: 'Generate code via 3-plan judge panel then verified BUILD',
  phases: [{ title: 'Setup' }, { title: 'Plan' }, { title: 'Build' }],
}
const { session_dir, outputPath, focusAreas } = args
await agent(`helix-design-system-analyzer. session_dir:${session_dir} focusAreas:${focusAreas}`, {phase:'Setup'})
await agent(`helix-figma-collector. session_dir:${session_dir}`, {phase:'Setup'})
const angles = ['composition-first','token-fidelity-first','a11y-first']
const plans = await parallel(angles.map(a => () => agent(`helix-planner (${a}). session_dir:${session_dir}`, {phase:'Plan'})))
const best = await agent(`Pick & merge the best plan. ${JSON.stringify(plans.filter(Boolean))}`, {phase:'Plan'})
const code = await agent(`helix-code-generator BUILD. plan:${best} out:${outputPath}`, {phase:'Build'})
const v = await agent(`Verify: only guide tokens, no invented names. ${code}`, {phase:'Build', schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']}})
return { code, verified: v.ok }
```
