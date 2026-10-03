"""Adds the version multi-select filter to Runs and Analytics (HD-035). Idempotent."""
import pathlib
root = pathlib.Path(__file__).parent
p = root / 'platform-gallery.html'
s = p.read_text(encoding='utf-8')

CSS = """
  /* version multi-select */
  .vsel{position:relative;display:inline-block}
  .vsel .trig{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;background:#fff}
  .vsel .trig.on{border-color:var(--primary);color:var(--primary-h);font-weight:600;background:var(--primary-0)}
  .vsel .dd{position:absolute;top:36px;left:0;z-index:4;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,.1);padding:8px;width:280px}
  .vsel .dd div{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;font-size:14px}
  .vsel .dd div:hover{background:var(--gray-bg)}
  .vsel .dd small{margin-left:auto;color:var(--faint);font-size:12px}
  .vsel .dd .foot{justify-content:space-between;border-top:1px solid var(--line);margin-top:6px;padding-top:10px;color:var(--nav-on);font-size:13px}
  .cmp td.best{background:#f0fdf4;font-weight:600}
  .chart i.b{background:#7c3aed}
  .legend{display:flex;gap:16px;font-size:13px;color:var(--mute);margin-top:8px}
  .legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
"""
if '/* version multi-select */' not in s:
    s = s.replace('</style>', CSS + '</style>', 1)

JS = r"""
/* VERSION FILTER (HD-035) */
const VCOUNT = {4:38, 3:294, 2:61, 1:19};
const versionFilter = (sel=[], open=false) => { const all = sel.length===0 || sel.length===4; const label = all ? 'All versions' : 'Versions: ' + sel.map(v=>'v'+v).join(', ');
  const box = on => `<i style="width:16px;height:16px;border:1.5px solid #9ca3af;border-radius:4px;display:inline-grid;place-items:center;font-size:11px;${on?'background:#7c3aed;border-color:#7c3aed;color:#fff':''}">${on?'✓':''}</i>`;
  return `<span class="vsel"><span class="trig ${all?'':'on'}">${label} <span>▾</span></span>${open?`<div class="dd">${[4,3,2,1].map(v=>`<div>${box(all||sel.includes(v))}v${v}${v===4?' · active':''}<small>${VCOUNT[v]} runs</small></div>`).join('')}<div class="foot"><span>Select all</span><span>Clear</span></div></div>`:''}</span>`; };
const runFiltersV = (on='All', sel=[], open=false) => `<div class="row" style="margin-bottom:14px;gap:6px">${['All','Running','Waiting','Completed','Failed','Expired','Superseded'].map(f=>`<span class="pill ${f===on?'info':''}" style="font-weight:500">${f}</span>`).join('')}<span style="margin-left:6px">${versionFilter(sel, open)}</span><span style="flex:1"></span><span class="input" style="max-width:220px;padding:7px 10px;font-size:13px;color:#9ca3af">Search by person</span></div>`;
const anHead = (filter, range) => `${crumbs('Pricing lead capture')}<div class="ph"><div><div class="row"><h1 style="font-size:26px">Pricing lead capture</h1><span class="pill ok">Live</span></div><div class="sub">${plat(P.ig)}</div></div><div class="row">${filter}<span class="btn sec">${range} ▾</span></div></div>${tabs('Analytics')}`;
"""
CARDS = r"""
/* VERSION FILTER CARDS */
add('runs-vfilter-open', 'Runs', 'Version filter open (multi-select)', frame({body: runsHead() + runFiltersV('All', [], true) + runsTable(runRows)}), 'versions filter dropdown');
add('runs-vfilter', 'Runs', 'Runs filtered to v3 and v4', frame({body: runsHead() + runFiltersV('All', [3,4]) + runsTable(runRows.filter(r=>r[4]==='v3'||r[4]==='v4')) + `<div class="hint" style="margin-top:10px">Showing 332 runs on v3 and v4. A run keeps the version it started on, so a v3 run that finished after v4 went live still counts for v3.</div>`}), 'versions filtered');
add('analytics-compare', 'Analytics', 'Analytics: compare versions (v3 vs v4)', frame({body: anHead(versionFilter([3,4]), 'Last 30 days') + `
<div class="tbl cmp" style="margin-bottom:18px"><table><thead><tr><th>Version</th><th>Published</th><th>Started</th><th>Replied</th><th>Reply rate</th><th>Completed</th><th>Completion</th><th>Emails captured</th><th>Email rate</th><th>Failed</th><th>Median time to email</th></tr></thead><tbody>
<tr><td><b>v4</b> <span class="pill ok" style="font-size:11px;padding:2px 8px">active</span></td><td class="mono">Oct 4</td><td>38</td><td>30</td><td class="best">79%</td><td>29</td><td>76%</td><td>24</td><td class="best">63%</td><td>1</td><td class="best">41 s</td></tr>
<tr><td><b>v3</b></td><td class="mono">Sep 30</td><td>294</td><td>206</td><td>70%</td><td>251</td><td class="best">85%</td><td>171</td><td>58%</td><td>8</td><td>2 min 10 s</td></tr>
</tbody></table></div>
<div class="chart">${[[30,22],[45,30],[60,40],[55,38],[80,60],[95,70],[70,52],[88,66],[100,72],[76,58],[64,50],[90,70],[85,66],[60,48]].map(([a,b])=>`<i style="height:${a}%"></i><i class="b" style="height:${b}%"></i>`).join('')}</div>
<div class="legend"><span><i style="background:#c4b5fd"></i>Started</span><span><i style="background:#7c3aed"></i>Emails captured</span><span style="margin-left:auto">Per day, selected versions combined. Green cells mark the better value.</span></div>
<div class="callout info" style="margin-top:16px"><b>What this says</b>v4 gets more replies to the first message (79% vs 70%) and captures emails from more of the people who start (63% vs 58%), and faster, but fewer finish the whole flow (76% vs 85%). v4 has run for one day; wait for about 100 runs before deciding.</div>`}), 'versions compare analytics table');
add('analytics-vfilter-open', 'Analytics', 'Analytics: version filter open', frame({body: anHead(versionFilter([], true), 'Last 30 days') + `<div class="stats" style="grid-template-columns:repeat(5,1fr)"><div class="stat"><b>412</b><span>Started · all versions</span></div><div class="stat"><b>72%</b><span>Reply rate · 297 replied</span></div><div class="stat"><b>371</b><span>Completed · 90%</span></div><div class="stat"><b>298</b><span>Emails captured</span></div><div class="stat"><b>9</b><span>Failed</span></div></div><div class="chart">${[30,45,60,55,80,95,70,88,100,76,64,90,85,60].map(h=>`<i style="height:${h}%"></i>`).join('')}</div>`}), 'versions dropdown analytics');
add('analytics-single-version', 'Analytics', 'Analytics: one version selected (v2)', frame({body: anHead(versionFilter([2]), 'All time') + `<div class="stats" style="grid-template-columns:repeat(5,1fr)"><div class="stat"><b>61</b><span>Started · v2</span></div><div class="stat"><b>64%</b><span>Reply rate · 39 replied</span></div><div class="stat"><b>52</b><span>Completed · 85%</span></div><div class="stat"><b>31</b><span>Emails captured · 51%</span></div><div class="stat"><b>2</b><span>Failed</span></div></div><div class="chart">${[20,35,50,45,60,40,30,25,15,10,5,0,0,0].map(h=>`<i style="height:${h}%"></i>`).join('')}</div><div class="hint" style="margin-top:8px">v2 was active from Sep 20 to Sep 30. Its runs stop when v3 took over; nothing was deleted.</div>`}), 'versions single');
"""
if '/* VERSION FILTER (HD-035) */' not in s:
    s = s.replace('/* RUNS */', JS + '\n/* RUNS */', 1)
if '/* VERSION FILTER CARDS */' not in s:
    s = s.replace('/* render */', CARDS + '\n/* render */', 1)

# default Runs and Analytics screens show the closed filter too
old_rf = "const runFilters = (on='All') => `<div class=\"row\" style=\"margin-bottom:14px;gap:6px\">${['All','Running','Waiting','Completed','Failed','Expired','Superseded'].map(f=>`<span class=\"pill ${f===on?'info':''}\" style=\"font-weight:500\">${f}</span>`).join('')}<span style=\"flex:1\"></span>"
new_rf = old_rf.replace("<span style=\"flex:1\"></span>", "<span style=\"margin-left:6px\">${versionFilter([])}</span><span style=\"flex:1\"></span>")
if 'versionFilter([])}</span><span style="flex:1">' not in s:
    assert old_rf in s, 'runFilters not found'
    s = s.replace(old_rf, new_rf, 1)
old_an = "<div class=\"row\"><span class=\"btn sec\">Last 7 days ▾</span></div></div>${tabs('Analytics')}<div class=\"stats\"><div class=\"stat\"><b>412</b>"
if old_an in s:
    s = s.replace(old_an, "<div class=\"row\">${versionFilter([])}<span class=\"btn sec\">Last 7 days ▾</span></div></div>${tabs('Analytics')}<div class=\"stats\"><div class=\"stat\"><b>412</b>", 1)

p.write_text(s, encoding='utf-8', newline='\n')
print('version filter added', len(s))
