"""Inlines the wiki data into platform-gallery.html and adds the wiki button, modal and cards.
Idempotent: markers guard every insertion."""
import re, io, pathlib
root = pathlib.Path(__file__).parent
p = root / 'platform-gallery.html'
s = p.read_text(encoding='utf-8')

CSS = """
  /* wiki modal */
  .wiki{width:1120px;max-width:96%;height:640px;max-height:92%;background:#fff;border-radius:14px;box-shadow:0 20px 40px rgba(0,0,0,.25);display:grid;grid-template-columns:280px 1fr;overflow:hidden;position:relative}
  .wnav{background:#f9fafb;border-right:1px solid var(--line);padding:16px 10px;overflow:auto}
  .wnav .wtitle{font-weight:600;font-size:15px;padding:6px 10px 12px;color:var(--text)}
  .wnav .wsub{font-size:12px;color:var(--mute);padding:0 10px 10px}
  .wnav div[data-i]{padding:8px 10px;border-radius:8px;color:var(--mute);font-size:14px;cursor:pointer;margin-bottom:2px}
  .wnav div[data-i]:hover{background:#f3f4f6}
  .wnav div[data-i].on{background:var(--nav-on-bg);color:var(--nav-on);font-weight:600}
  .wart{padding:26px 34px 30px;overflow:auto;font-size:15px;line-height:1.6}
  .wart h2{margin:0 0 14px;font-size:22px;font-weight:600}
  .wart p{margin:0 0 12px}
  .wart ul,.wart ol{margin:0 0 12px;padding-left:22px}
  .wart li{margin-bottom:6px}
  .wart .wfoot{margin-top:26px;padding-top:12px;border-top:1px solid var(--line);color:var(--faint);font-size:12px}
  .wclose{position:absolute;right:16px;top:12px;color:var(--faint);cursor:pointer;font-size:16px}
  .wikibtn::before{content:"📖";margin-right:2px}
"""
if '/* wiki modal */' not in s:
    s = s.replace('</style>', CSS + '</style>', 1)

# wiki button in the editor header
old_head = "const editorHead = (name, p, state='Draft', actions) => `${crumbs(name)}<div class=\"ph\"><div><div class=\"row\"><h1 style=\"font-size:26px\">${name}</h1>${state==='Live'?'<span class=\"pill ok\">Live</span>':state==='Paused'?'<span class=\"pill warn\">Paused</span>':'<span class=\"pill\">Draft</span>'}</div><div class=\"sub\">${plat(p)}</div></div><div class=\"row\">${actions ?? (state==='Live'?'<span class=\"btn ghost\">Move to draft</span><span class=\"btn sec\">Save</span><span class=\"btn\">Save and publish</span>':'<span class=\"btn sec\">Save draft</span><span class=\"btn\">Publish</span>')}</div></div>${tabs('Editor')}`;"
new_head = "const wikiBtn = p => `<span class=\"btn sec wikibtn\" data-p=\"${p.k}\">${p.name} automations wiki</span>`;\nconst editorHead = (name, p, state='Draft', actions) => `${crumbs(name)}<div class=\"ph\"><div><div class=\"row\"><h1 style=\"font-size:26px\">${name}</h1>${state==='Live'?'<span class=\"pill ok\">Live</span>':state==='Paused'?'<span class=\"pill warn\">Paused</span>':'<span class=\"pill\">Draft</span>'}</div><div class=\"sub\">${plat(p)}</div></div><div class=\"row\">${wikiBtn(p)}${actions ?? (state==='Live'?'<span class=\"btn ghost\">Move to draft</span><span class=\"btn sec\">Save</span><span class=\"btn\">Save and publish</span>':'<span class=\"btn sec\">Save draft</span><span class=\"btn\">Publish</span>')}</div></div>${tabs('Editor')}`;"
if 'const wikiBtn' not in s:
    assert old_head in s, 'editorHead not found'
    s = s.replace(old_head, new_head, 1)

# wiki data + modal + cards, inserted before the render block
wiki_js = (root / 'platform-wiki-1.js').read_text(encoding='utf-8') + '\n' + (root / 'platform-wiki-2.js').read_text(encoding='utf-8')
MODAL = r"""
/* WIKI */
const wikiModal = (pk, idx=0) => { const arts = WIKI[pk]; const a = arts[idx]; const name = WIKI.names[pk];
  return `<div class="modal-bg wiki-bg"><div class="wiki" data-p="${pk}"><div class="wnav"><div class="wtitle">${name} automations wiki</div><div class="wsub">${arts.length} articles</div>${arts.map((x,i)=>`<div class="${i===idx?'on':''}" data-i="${i}">${x.t}</div>`).join('')}</div><div class="wart"><span class="wclose">✕</span><h2>${a.t}</h2>${a.h}<div class="wfoot">Updated October 2026. Facts marked (verify) should be checked against the platform’s current documentation before relying on them.</div></div></div></div>`; };
const wikiBody = (pk) => { const p = P[pk]; const names = {ig:'Pricing lead capture',fb:'Free guide on GUIDE',th:'Launch day replies',x:'Pricing on X',bs:'Bluesky pricing',yt:'Thank every commenter',li:'Whitepaper replies',wa:'Catalog on request',tt:'TikTok inbox replies',pi:'—'};
  if (pk==='pi') return header('DM automations','6 automations','<span class="btn">+ New automation</span>') + listTable(LIST_ROWS);
  return editorHead(names[pk], p, 'Draft') + trigger({p, keywords:['pricing'], allowDM: !['th','yt','li'].includes(pk), allowComments: !['wa','tt'].includes(pk), kinds: ['wa','tt'].includes(pk)?['dm']:['comments']}) + `<div class="card"><h3>Then…</h3><div class="steps">${stepReply(1,'Sent you a DM!')}${con()}${addStep(false)}</div></div>`; };
for (const pk of ['ig','fb','th','x','bs','yt','li','wa','tt','pi']) {
  add('wiki-'+pk, 'Wiki', `${WIKI.names[pk]} automations wiki (${WIKI[pk].length} articles, click the left list)`, frame({body: wikiBody(pk), overlay: wikiModal(pk, 0)}), 'wiki ' + WIKI.names[pk].toLowerCase() + ' limits rules policy flagging timing best practices');
}
add('wiki-ig-windows', 'Wiki', 'Instagram wiki opened on “The two windows”', frame({body: wikiBody('ig'), overlay: wikiModal('ig', 2)}), 'wiki instagram windows 7 days 24 hours');
"""
if '/* WIKI */' not in s:
    s = s.replace('/* render */', wiki_js + '\n' + MODAL + '\n/* render */', 1)

DELEG = r"""
<script>
/* wiki interactions: open from any editor, switch articles, close */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.wikibtn');
  if (btn) { const app = btn.closest('.app'); app.querySelectorAll('.wiki-bg').forEach(x=>x.remove()); app.insertAdjacentHTML('beforeend', wikiModal(btn.dataset.p, 0)); return; }
  const nav = e.target.closest('.wnav div[data-i]');
  if (nav) { const w = nav.closest('.wiki'); const pk = w.dataset.p; const i = +nav.dataset.i; const a = WIKI[pk][i];
    w.querySelectorAll('.wnav div[data-i]').forEach(d=>d.classList.toggle('on', d===nav));
    const art = w.querySelector('.wart'); art.innerHTML = `<span class="wclose">✕</span><h2>${a.t}</h2>${a.h}<div class="wfoot">Updated October 2026. Facts marked (verify) should be checked against the platform’s current documentation before relying on them.</div>`; art.scrollTop = 0; return; }
  if (e.target.closest('.wclose')) { e.target.closest('.wiki-bg').remove(); }
});
</script>
"""
if 'wiki interactions' not in s:
    s = s.replace('</body>', DELEG + '</body>', 1)

# nav link for the wiki group
if '#wiki-ig' not in s:
    s = s.replace('<a href="#system">System states</a>', '<a href="#system">System states</a><a href="#wiki-ig">Wiki</a>', 1)

p.write_text(s, encoding='utf-8', newline='\n')
print('built', len(s), 'bytes')
