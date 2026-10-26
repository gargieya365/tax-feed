
const D=window.ARCH;
(()=>{
const $=i=>document.getElementById(i),el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n};
const R=D.rows,PUB=D.public;
const FILT=[['party','Party Name'],['court','Court'],['section','Section'],['subject','Subject/Catch Note'],['cite','Source/Citation'],['date','Date'],['ref','Ref No'],['ay','Assessment Year'],['para','Any Para'],['favour','Favour'],['judge','Judge'],['counsel','Counsel'],['held','Held'],['concl','Conclusion']].filter(f=>!(PUB&&['held','concl','para'].includes(f[0])));
const COLS=[['date','Date'],['area','Law'],['kind','Type'],['party','Party'],['court','Court'],['section','Section'],['subject','Subject / catch note'],['cite','Source / citation'],['ref','Ref no'],['ay','AY'],['judge','Judge'],['counsel','Counsel'],['favour','Favour']];
const FAV={'Assessee':['For assessee','good'],'Assessee (partly)':['Partly assessee','mid'],'Revenue':['For revenue','bad']};
const st={f:{},law:'',type:'',grp:'',sort:['date','descending'],page:0,open:null},PER=100;
$('sub').textContent=D.subline;
const uniq=k=>[...new Set(R.map(r=>r[k]).filter(Boolean))].sort();
[['law','area','All laws'],['type','kind','All types']].forEach(([id,k,a])=>{const s=$(id);s.append(new Option(a,''));uniq(k).forEach(v=>s.append(new Option(v,v)));s.onchange=()=>{st[id]=s.value;st.page=0;draw()}});
$('grp').onchange=e=>{st.grp=e.target.value;st.page=0;draw()};
FILT.forEach(([k,l])=>{const i=el('input','in');i.placeholder=l;i.setAttribute('aria-label',l);i.type='search';i.oninput=()=>{st.f[k]=i.value.trim().toLowerCase();st.page=0;draw()};$('grid').append(i)});
$('tg').onclick=()=>{const h=$('grid').hidden=!$('grid').hidden;$('tg').textContent=h?'Show filters':'Hide filters';$('tg').setAttribute('aria-expanded',String(!h))};
$('clr').onclick=()=>{st.f={};st.law=st.type='';document.querySelectorAll('#grid input').forEach(i=>i.value='');$('law').value=$('type').value='';st.page=0;draw()};
COLS.forEach(([k,l])=>{const th=el('th','',l);th.tabIndex=0;th.onclick=th.onkeydown=e=>{if(e.type==='keydown'&&e.key!=='Enter')return;st.sort=[k,st.sort[0]===k&&st.sort[1]==='ascending'?'descending':'ascending'];draw()};th.dataset.k=k;$('hd').append(th)});
const val=(r,k)=>(r[k]||'')+'';
const match=r=>{if(st.law&&r.area!==st.law)return 0;if(st.type&&r.kind!==st.type)return 0;for(const[k,v]of Object.entries(st.f)){if(v&&!val(r,k).toLowerCase().includes(v))return 0}return 1};
function draw(){
 let L=R.filter(match);const[k,dir]=st.sort,m=dir==='ascending'?1:-1;
 const cmp=(a,b)=>m*val(a,k).localeCompare(val(b,k),undefined,{numeric:true})||val(b,'date').localeCompare(val(a,'date'));
 if(st.grp)L.sort((a,b)=>val(a,st.grp).localeCompare(val(b,st.grp))||cmp(a,b));else L.sort(cmp);
 document.querySelectorAll('#hd th').forEach(th=>th.setAttribute('aria-sort',th.dataset.k===k?dir:'none'));
 const pages=Math.max(1,Math.ceil(L.length/PER));st.page=Math.min(st.page,pages-1);
 const S=L.slice(st.page*PER,(st.page+1)*PER);
 $('meta').textContent=L.length+' of '+R.length+' items'+(R.length?' · '+D.from+' to '+D.to:'');
 $('pg').textContent='Page '+(st.page+1)+' of '+pages;$('pv').disabled=st.page<=0;$('nx').disabled=st.page>=pages-1;
 const tb=$('tb');tb.replaceChildren();
 if(!S.length){const tr=el('tr'),td=el('td','empty',R.length?'Nothing matches these filters.':'Nothing in the archive yet. Items move here after the day they are published.');td.colSpan=COLS.length;tr.append(td);tb.append(tr);return}
 let g=null;
 S.forEach(r=>{
  if(st.grp&&r[st.grp]!==g){g=r[st.grp];const tr=el('tr'),td=el('td','',g);td.colSpan=COLS.length;td.style.cssText='font-weight:600;background:var(--soft)';tr.append(td);tb.append(tr)}
  const tr=el('tr','r');tr.tabIndex=0;
  COLS.forEach(([c])=>{const td=el('td',c==='subject'?'subj':(['date','section','ay'].includes(c)?'n':''));
   if(c==='favour'){const f=FAV[r.favour];if(f)td.append(el('span','fav '+f[1],f[0]))}
   else if(c==='kind'||c==='area')td.append(el('span','tag',val(r,c)));
   else td.textContent=val(r,c);tr.append(td)});
  const tog=()=>{st.open=st.open===r.id?null:r.id;draw()};tr.onclick=tog;tr.onkeydown=e=>{if(e.key==='Enter')tog()};
  tb.append(tr);
  if(st.open===r.id){const x=el('tr','x'),td=el('td');td.colSpan=COLS.length;const dl=el('dl','dl');
   const rows=[['Party',r.party],['Court',r.court],['Date',r.date],['Section',r.section],['Subject',r.subject],['Citation',r.cite],['Ref no',r.ref],['Assessment year',r.ay],['Para',PUB?'':r.para],['Judge',r.judge],['Counsel',r.counsel],['Held',PUB?'':r.held],['Conclusion',PUB?'':r.concl],['Source',r.source]];
   rows.forEach(([a,b])=>{if(b){dl.append(el('dt','',a),el('dd','',b))}});
   if(r.url){const dd=el('dd'),a=el('a','','Open on Taxmann');a.href=r.url;a.target='_blank';a.rel='noopener';dd.append(a);dl.append(el('dt','','Link'),dd)}
   td.append(dl);x.append(td);tb.append(x)}
 });
}
$('pv').onclick=()=>{st.page--;draw();$('tb').closest('.tw').scrollTop=0};$('nx').onclick=()=>{st.page++;draw();$('tb').closest('.tw').scrollTop=0};
$('foot').textContent=D.foot;
draw();
})();
