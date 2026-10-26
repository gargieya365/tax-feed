import json,sys,glob
sys.path.insert(0,'.')
from arch_fields import fields
PUB='--public' in sys.argv; TEST='--test' in sys.argv
TODAY='2026-10-26'
rows=[]
for f in ['all_data.json']+sorted(glob.glob('backfill/rows_*.json')):
    d=json.load(open(f)); rows+= (d['rows'] if isinstance(d,dict) else d)
rows=[r for r in rows if TEST or r['day']<TODAY]
out=[]
for r in rows:
    f=fields(r)
    out.append({'id':r['id'],'date':r.get('order_iso') or r['day'],'area':r['area'],'kind':r['kind'],'party':r['parties'] or r['headline'],'court':r['forum'] if r['forum']!='—' else '','section':r['mark'],'subject':r['topic'] or r['headline'],'cite':r['cite'],'favour':r['favour'],'source':r['source']+' ('+r['day']+')','url':r['url'],**f})
if PUB:
    for o in out:
        for k in ('held','concl','para','judge','counsel'): o[k]=''
days=sorted({r['day'] for r in rows})
data={'public':PUB,'rows':out,'from':days[0] if days else '','to':days[-1] if days else '',
 'subline':'Everything published before today, one searchable table. Filter on any field, sort by any column, group by law or type, and click a row for the full entry.',
 'foot':'Entries are taken from Taxmann and Current Tax Online mails and were not checked against the official order or notification. Date is the order date where the source gives one, otherwise the day the mail was published. Blank cells mean the source did not state that detail; nothing is inferred. Judge and counsel appear only in Taxmann alerts, and reference numbers and assessment years only where the text states them.'+(' Held, conclusion and para text are omitted from this public version; follow the source link.' if PUB else '')}
import os
od='site_test' if TEST else 'site'; os.makedirs(od,exist_ok=True)
open(od+'/archive_data.js','w').write('window.ARCH='+json.dumps(data,ensure_ascii=False).replace('</','<\\/')+';')
print(len(out),'rows',PUB)
