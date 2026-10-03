"""Adds the versions window and its states to platform-gallery.html (HD-034). Idempotent."""
import pathlib
root = pathlib.Path(__file__).parent
p = root / 'platform-gallery.html'
s = p.read_text(encoding='utf-8')

CSS = """
  /* versions window */
  .vers{width:860px;max-width:94%;background:#fff;border-radius:14px;box-shadow:0 20px 40px rgba(0,0,0,.25);padding:22px 24px;position:relative}
  .vers h3{margin:0 0 4px;font-size:18px}
  .vers .hint{margin-bottom:14px}
  .vers table td{font-size:14px;padding:12px 14px}
  .vers table th{padding:10px 14px}
  .vers .act{display:flex;gap:8px;justify-content:flex-end}
  .vbanner{border-radius:10px;padding:12px 16px;font-size:14px;display:flex;align-items:center;gap:12px;margin-bottom:16px;background:#fff7ed;color:#7c2d12;border:1px solid #fed7aa}
  .vbanner b{color:#c2410c}
  .vbanner .spacer{flex:1}
"""
if '/* versions window */' not in s:
    s = s.replace('</style>', CSS + '</style>', 1)

JS = r"""
/* VERSIONS (HD-034) */
const VERS = [
  {v:4, when:'Oct 4, 10:00', by:'Dmitriy', note:'Shorter pricing message, new link', runs:2},
  {v:3, when:'Sep 30, 14:22', by:'Dmitriy', note:'Added the webhook step', runs:3},
  {v:2, when:'Sep 20, 11:05', by:'Dmitriy', note:'Ask for the email before the link', runs:0},
  {v:1, when:'Sep 12, 09:05', by:'Dmitriy', note:'First published', runs:0},
];
const versionsModal = (active=4, opts={}) => `<div class="modal-bg"><div class="vers"><span class="wclose">✕</span><h3>Versions · Pricing lead capture</h3><div class="hint">Every publish creates a new version. Making an older version active keeps the newer ones. Editing the active version and publishing creates the next number. Runs finish on the version they started with.</div>
<div class="tbl"><table><thead><tr><th>Version</th><th>Published</th><th>Change</th><th>Runs on it</th><th>State</th><th></th></tr></thead><tbody>
${opts.draft?`<tr><td><b>Draft</b></td><td class="mono">unpublished</td><td>Edits on top of v${active}</td><td>—</td><td><span class="pill">Not published</span></td><td class="act"><span class="btn sec sm">Continue editing</span></td></tr>`:''}
${VERS.map(r=>`<tr><td><b>v${r.v}</b></td><td class="mono">${r.when} · ${r.by}</td><td>${r.note}</td><td>${r.runs?`${r.runs} in progress`:'—'}</td><td>${r.v===active?'<span class="pill ok">Active</span>':(r.v>active?'<span class="pill info">Newer, not active</span>':'<span class="pill">Previous</span>')}</td><td class="act"><span class="btn sec sm">View</span>${r.v===active?'':'<span class="btn sm">Make active</span>'}</td></tr>`).join('')}
</tbody></table></div></div></div>`;
const vBanner = (text, actions) => `<div class="vbanner">${text}<span class="spacer"></span>${actions}</div>`;

add('versions', 'Versions', 'Versions window (v4 active)', frame({body: editorHead('Pricing lead capture', P.ig, 'Live', '<span class="btn ghost">Versions</span><span class="btn ghost">Move to draft</span><span class="btn sec">Save</span><span class="btn">Save and publish</span>') + trigger({p:P.ig}) + IG_STEPS({noAdd:true}), overlay: versionsModal(4)}), 'history list revert');
add('versions-confirm', 'Versions', 'Make v3 active: confirmation', frame({body: editorHead('Pricing lead capture', P.ig, 'Live') + trigger({p:P.ig}) + IG_STEPS({noAdd:true}), overlay: `<div class="modal-bg"><div class="modal"><h3>Make version 3 active?</h3><p>New comments and messages will run version 3. Version 4 stays in the history and can be made active again at any time. 2 runs in progress on version 4 finish on version 4.</p><p>If you edit version 3 afterwards and publish, it is saved as version 5.</p><div class="foot"><span class="btn sec">Cancel</span><span class="btn">Make version 3 active</span></div></div></div>`}), 'revert modal');
add('versions-reverted', 'Versions', 'After revert: v3 active, v4 kept', frame({body: editorHead('Pricing lead capture', P.ig, 'Live') + vBanner('<b>Version 3 is active.</b> Version 4 is kept in the history. Editing and publishing will create version 5.', '<span class="btn sec sm">Versions</span>') + trigger({p:P.ig}) + `<div class="card"><h3>Then…</h3><div class="steps">${stepReply(1)}${con()}${stepDM(2,'Send a message','Hey! Reply with your email and I’ll send you the pricing sheet.')}${con()}${stepWait(3)}${con()}${stepDM(4,'Send a message','Thanks! Here it is 👇',['Open pricing sheet'],'<div class="meta">Button opens https://oqtastore.example/pricing-v3?e={{email}}</div>')}${con()}${stepHook(5)}</div></div>`, overlay: versionsModal(3) + `<div class="toast ok">✓ Version 3 is active. Version 4 is kept.</div>`}), 'revert done toast');
add('versions-view-old', 'Versions', 'Viewing a non-active version (read-only)', frame({body: editorHead('Pricing lead capture', P.ig, 'Live', '<span class="btn ghost">Versions</span><span class="btn sec">Edit as a new version</span><span class="btn">Make active</span>') + vBanner('<b>You are viewing version 4.</b> The active version is 3. Nothing here is editable until you make it active or edit it as a new version.', '') + trigger({p:P.ig}) + IG_STEPS({noAdd:true})}), 'read only');
add('versions-publish-next', 'Versions', 'Publishing edits on the active version → next number', frame({body: editorHead('Pricing lead capture', P.ig, 'Live') + trigger({p:P.ig}) + IG_STEPS({noAdd:true}), overlay: `<div class="modal-bg"><div class="modal"><h3>Publish as version 5?</h3><p>Version 3 stays in the history unchanged. 3 runs in progress on version 3 finish on it; new comments and messages run version 5.</p><div class="foot"><span class="btn sec">Cancel</span><span class="btn">Publish version 5</span></div></div></div>`}), 'confirm');
add('versions-with-draft', 'Versions', 'Versions window with unpublished draft edits', frame({body: editorHead('Pricing lead capture', P.ig, 'Live', '<span class="btn ghost">Versions</span><span class="btn ghost">Move to draft</span><span class="btn sec">Save</span><span class="btn">Save and publish</span>') + trigger({p:P.ig}) + IG_STEPS({noAdd:true}), overlay: versionsModal(4, {draft:true})}), 'draft row');
"""
if '/* VERSIONS (HD-034) */' not in s:
    s = s.replace('/* render */', JS + '\n/* render */', 1)

# retire the old single drawer card and the old toast wording
s = s.replace("add('state-versions','Editor states','Version history',", "add('state-versions-old','Editor states','Version history (superseded by the Versions group)',", 1)
s = s.replace('<div class="toast ok">✓ Published. Version 3 is live.</div>', '<div class="toast ok">✓ Published as version 4.</div>', 1)
if '#versions' not in s:
    s = s.replace('<a href="#wiki-ig">Wiki</a>', '<a href="#wiki-ig">Wiki</a><a href="#versions">Versions</a>', 1)
# the versions modal reuses .wclose; make the close handler generic
s = s.replace("if (e.target.closest('.wclose')) { e.target.closest('.wiki-bg').remove(); }", "if (e.target.closest('.wclose')) { const bg = e.target.closest('.modal-bg'); if (bg) bg.remove(); }", 1)

p.write_text(s, encoding='utf-8', newline='\n')
print('versions added', len(s))
