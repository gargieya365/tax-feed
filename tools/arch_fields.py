import re
def _all(r): return '\n'.join([r['src']]+[e['text'] for e in r.get('extra',[])])
def kd(t,k):
    m=re.search(r'^\s*'+k+r'\s*:\s*(.+)$',t,re.M); return m.group(1).strip() if m else ''
def fields(r):
    t=_all(r)
    ref=[]
    for m in re.finditer(r'\b((?:ITA|I\.T\.A\.|W\.P\.\(?C?\)?|SLP|C\.A\.|Civil Appeal|Appeal|Case|Company Petition|CP|IA|Circular|Notification|Ref\.?)\s*(?:\(?[A-Za-z.]*\)?\s*)?No\.?s?\s*[:\-]?\s*[\w()./\- ]{1,40}?)(?=[,;\n]| dated| vs| v\.|$)',t):
        s=m.group(1).strip()
        if re.search(r'\d',s) and s not in ref: ref.append(s)
    ay=[]
    for m in re.finditer(r'(?:Assessment Years?|A\.?Y\.?s?)\s*[:\-]?\s*((?:20\d\d\s*-\s*\d\d)(?:\s*(?:,|and|&|to)\s*(?:20\d\d\s*-\s*\d\d))*)',t):
        v=re.sub(r'\s+','',m.group(1))
        if v not in ay: ay.append(v)
    para=' '.join(re.findall(r'\[(Paras?\s[^\]]+)\]',t))
    held=[]
    for m in re.finditer(r'(Whether[^\[\]]*?)\s-\s*Held\s*,?\s*(yes|no)\b',t,re.S):
        held.append(re.sub(r'\s+',' ',m.group(1)).strip()+' → '+m.group(2).capitalize())
    sm=re.search(r'Summary:\s*(.+?)\n\s*\n?Headnote:',t,re.S)
    concl=re.sub(r'\s+',' ',sm.group(1)).strip() if sm else (r.get('outcome') or r['headline'])
    return {'ref':'; '.join(ref[:3]),'ay':', '.join(ay[:4]),'para':para,'judge':kd(t,'Judge Name'),'counsel':kd(t,'Counsel Name'),'held':' | '.join(held[:6]),'concl':concl}
