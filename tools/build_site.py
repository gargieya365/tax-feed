import json,re,os,sys,glob
sys.path.insert(0,'.')
TEST='--test' in sys.argv
OUT='site_test' if TEST else 'site'; os.makedirs(OUT,exist_ok=True)
css=open('_css.txt').read();modal=open('_modal.txt').read();js=open('_js.txt').read()
EXTRA='''
*{box-sizing:border-box}body{margin:0}
.nav{display:flex;gap:.3rem;flex-wrap:wrap;padding-top:calc(env(safe-area-inset-top,0px) + .9rem);border-bottom:1px solid var(--line);padding-bottom:.6rem}
.nav a{font-size:.88rem;font-weight:500;color:var(--ink-2);text-decoration:none;padding:.4rem .9rem;border-radius:999px;min-height:2.25rem;display:inline-flex;align-items:center}
.nav a[aria-current=page]{background:var(--ink);color:var(--bg)}
.nav a:not([aria-current]):hover{color:var(--ink)}
.strip{top:calc(env(safe-area-inset-top,0px) + 3.6rem)}
.tools{top:calc(env(safe-area-inset-top,0px) + 7rem)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;margin-top:1.2rem}
.card{display:grid;gap:.4rem;padding:1.2rem 1.3rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:inherit;text-decoration:none}
.card:hover{border-color:var(--ink-3)}
.card h3{font:500 1.35rem/1.2 var(--f-display)}
.card p{color:var(--ink-2);font-size:.9rem}
.card .go{font-size:.85rem;font-weight:600}
.card .k{font-family:var(--f-mono);font-size:.7rem;letter-spacing:.07em;text-transform:uppercase;color:var(--warn)}
.hero.slim{padding-block:1.6rem 1rem}
'''
open(f'{OUT}/app.css','w').write(css+EXTRA)
js=js.replace('const DATA = __DATA__;\n(function () {','(function () {\n  const DATA = window.DATA;\n  const PAGE = document.querySelector("[data-page]").dataset.page;',1)
js=js.replace("const $ = (id) => document.getElementById(id);","const _dm = {};\n  const $ = (id) => document.getElementById(id) || (_dm[id] = _dm[id] || document.createElement('div'));",1)
js=js.replace("  drawFirst(); drawRest(); progress(); paintStatus();\n  initCaps();","""  $('b-rest').textContent = rest.length + ' updates, grouped by law';
  const AR = window.ARCH; $('b-arch').textContent = AR && AR.rows.length ? AR.rows.length + ' earlier entries' : 'Fills from tomorrow, one day at a time';
  drawFirst(); drawRest(); progress(); paintStatus();
  initCaps();""",1)
assert 'window.DATA' in js and '_dm' in js and 'b-rest' in js
open(f'{OUT}/app.js','w').write(js)
d=json.load(open('all_data.json'))
open(f'{OUT}/data.js','w').write('window.DATA='+json.dumps(d,ensure_ascii=False).replace('</','<\\/')+';')
def nav(cur): 
    L=[('index.html','Today','today'),('everything.html','Everything else today','everything'),('archive.html','Previous content','archive')]
    return '<nav class="nav" aria-label="Pages">'+''.join(f'<a href="{h}"'+(' aria-current="page"' if k==cur else '')+f'>{n}</a>' for h,n,k in L)+'</nav>'
STRIP='''<div class="strip" role="status" aria-live="polite"><div class="strip-row"><span class="strip-name">Daily Tax Brief</span><span class="strip-count" id="count"></span></div><div class="bar" aria-hidden="true"><i id="fill"></i></div></div>'''
FOOT='<p class="foot" id="foot"></p>'
FONTS='''<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">'''
SCRIPTS='<script charset="utf-8" src="data.js"></script><script charset="utf-8" src="archive_data.js"></script><script charset="utf-8" src="app.js"></script>'
index=f'''<title>Daily Tax Brief</title>
<meta name="claude:viewport-fit-sides" content="cover">
{FONTS}
<link rel="stylesheet" href="app.css">
<div class="page" data-page="today"><div class="col">
{nav('today')}{STRIP}
<header class="hero"><p class="date" id="date"></p><h1 id="h1"></h1><p id="sub"></p><div class="due" id="due" hidden></div></header>
<div class="sec-h"><h2>Read first</h2><span class="n" id="n-first"></span></div>
<p class="note">Home-bench and Rajasthan items, reassessment and search limitation, stay of demand and penalty notices that did not state the limb. Picked from headlines and headnotes by rule, not from a full read of each order. Open any item to read the full text, highlight it, and add notes or comments.</p>
<ul class="list" id="first"></ul>
<section class="finish" id="finish" hidden><span class="tick" aria-hidden="true">&#10003;</span><h3 id="finishH"></h3><p id="finishP"></p></section>
<section class="share"><button class="btn" id="copy" type="button">Copy brief for WhatsApp</button><span class="toast" id="toast" role="status"></span><textarea id="manual" readonly hidden aria-label="Brief text to copy"></textarea></section>
<div class="sec-h"><h2>Keep reading</h2></div>
<div class="cards">
<a class="card" href="everything.html"><span class="k">Today</span><h3>Everything else today</h3><p id="b-rest"></p><span class="go">Open the full list &rarr;</span></a>
<a class="card" href="archive.html"><span class="k">Backlog</span><h3>Previous content</h3><p id="b-arch"></p><span class="go">Search and filter the table &rarr;</span></a>
</div>
{FOOT}
</div></div>
{modal}
{SCRIPTS}
'''
open(f'{OUT}/index.html','w').write(index)
def full(title,cur,body,extra=''):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>{title}</title>{FONTS}<link rel="stylesheet" href="app.css"></head><body><div class="page" data-page="{cur}"><div class="col">{nav(cur)}{body}</div></div>{extra}</body></html>'''
ev=f'''{STRIP}<header class="hero slim"><p class="date" id="date"></p><h1 class="hero-h" style="font-family:var(--f-display);font-weight:500;font-size:clamp(1.9rem,6vw,2.8rem);line-height:1.1;letter-spacing:-.02em">Everything else today</h1><p id="sub"></p></header>
<div class="sec-h"><h2>All other updates</h2><span class="n" id="n-rest"></span></div>
<div class="tools"><div class="chips" id="chips"></div><div class="find"><input class="q" id="q" type="search" placeholder="Search party, section or topic" aria-label="Search all updates"><label class="tg"><input type="checkbox" id="unread"> Unread only</label><label class="tg"><input type="checkbox" id="mine"> With my notes or comments</label></div></div>
<div id="rest"></div>{FOOT}'''
open(f'{OUT}/everything.html','w').write(full('Everything else today','everything',ev,modal+'<script charset="utf-8" src="data.js"></script><script charset="utf-8" src="archive_data.js"></script><script charset="utf-8" src="app.js"></script>').replace('<div class="page" data-page="everything"><div class="col">','<div class="page" data-page="everything"><div class="col">',1))
# archive
at=open('archive_template.html').read()
acss=at[at.index('<style>')+7:at.index('</style>')]
abody=at[at.index('<div class="wrap">')+len('<div class="wrap">'):at.index('<script>')].rsplit('</div>',1)[0]
ajs=at[at.rindex('<script>')+8:at.rindex('</script>')].replace('const D=__DATA__;','const D=window.ARCH;')
open(f'{OUT}/archive.js','w').write(ajs)
acss=re.sub(r'body\{[^}]*\}','',acss,1); acss=re.sub(r'\.wrap\{[^}]*\}','',acss,1)
open(f'{OUT}/archive.css','w').write(acss+'.wrap{max-width:none}.col{max-width:100rem}h1{margin-top:1.4rem}')
arch=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Previous content</title>{FONTS}<link rel="stylesheet" href="app.css"><link rel="stylesheet" href="archive.css"></head><body><div class="page" data-page="archive"><div class="col" style="max-width:100rem">{nav('archive')}{abody}</div></div><script charset="utf-8" src="archive_data.js"></script><script charset="utf-8" src="archive.js"></script></body></html>'''
open(f'{OUT}/archive.html','w').write(arch)
