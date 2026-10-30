
const CASH_METHODS={cash:'Nakit',card:'POS bekleyen',iban:'Banka / IBAN',unknown:'Belirtilmemiş'};
const CASH_KINDS={manual:'Manuel',opening:'Açılış bakiyesi',transfer:'Transfer',fee:'POS / banka komisyonu',settlement:'POS aktarımı',debt:'Borç tahsilatı'};
const cents=n=>Math.round((Number(n)||0)*100);
const currency=n=>Math.round(n)/100;
function debtPaid(saleId){const sale=db.sales.find(s=>s.id===saleId);return sale?Number(sale.paidAmount||0):0;}
function debtRemaining(s){return Math.max(0,currency(cents(s.total)-cents(debtPaid(s.id))));}
function cashLedger(){
 const sales=db.sales.filter(s=>s.paymentType!=='deferred').map(s=>({id:s.id,date:s.date,direction:'in',method:['cash','card','iban'].includes(s.paymentType)?s.paymentType:'unknown',amount:s.total,source:'sale',kind:'sale',note:'Satış: '+(s.productName||product(s.productId)?.name||'Ürün')}));
 const expenses=db.expenses.map(e=>({id:e.id,date:e.date,direction:'out',method:['cash','card','iban'].includes(e.paymentType)?e.paymentType:'unknown',amount:e.amount,source:'expense',kind:'expense',note:(e.cat||'Gider')+(e.note?' — '+e.note:'')}));
 const manual=db.cashEntries.flatMap(c=>{
  if(c.kind==='transfer'||c.kind==='settlement')return [{...c,id:c.id+'-out',recordId:c.id,direction:'out',source:'manual',kind:c.kind},{...c,id:c.id+'-in',recordId:c.id,direction:'in',method:c.targetMethod,source:'manual',kind:c.kind}];
  return [{...c,source:'manual',kind:c.kind||'manual'}];
 });
 return [...sales,...expenses,...manual].filter(x=>Number.isFinite(x.amount)&&x.amount>=0);
}
function balanceFor(method,through){return currency(cashLedger().filter(x=>x.method===method&&(!through||x.date<=through)).reduce((a,x)=>a+(x.direction==='in'?1:-1)*cents(x.amount),0));}
function toggleCashForm(force){const el=$('cashForm');el.style.display=(force===false||(!force&&el.style.display!=='none'))?'none':'block';if(el.style.display==='block')$('cDate').value||=today();}
function cashKindChanged(){const kind=$('cKind').value; $('cTargetWrap').style.display=['transfer','settlement'].includes(kind)?'block':'none';$('cDirectionWrap').style.display=['transfer','settlement','opening','fee'].includes(kind)?'none':'block';if(kind==='settlement'){$('cMethod').value='card';$('cTarget').value='iban';}if(kind==='fee')$('cMethod').value='iban';}
function cashFiltered(){const f=$('cf').value,t=$('ct').value,dir=$('cDirectionFilter').value,method=$('cMethodFilter').value,source=$('cSourceFilter').value;return cashLedger().filter(x=>(!f||x.date>=f)&&(!t||x.date<=t)&&(!dir||x.direction===dir)&&(!method||x.method===method)&&(!source||x.source===source));}
function sumDirection(rows,direction){return currency(rows.filter(x=>x.direction===direction).reduce((a,x)=>a+cents(x.amount),0));}
function cashPeriodStats(f,t){const dated=cashLedger().filter(x=>(!f||x.date>=f)&&(!t||x.date<=t));const incoming=sumDirection(dated,'in'),outgoing=sumDirection(dated,'out');const outstanding=currency(db.sales.filter(s=>s.paymentType==='deferred').reduce((a,s)=>a+cents(debtRemaining(s)),0));const overdue=currency(db.sales.filter(s=>s.paymentType==='deferred'&&s.dueDate&&s.dueDate<today()).reduce((a,s)=>a+cents(debtRemaining(s)),0));return {dated,incoming,outgoing,net:currency(cents(incoming)-cents(outgoing)),outstanding,overdue};}
function renderDebtList(){
 const debts=db.sales.filter(s=>s.paymentType==='deferred').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
 const sel=$('debtSale'),previous=sel.value;
 sel.innerHTML=debts.filter(s=>debtRemaining(s)>0).map(s=>`<option value="${esc(s.id)}">${esc(s.customer||s.productName||'Satış')} · ${esc(s.date)} · Kalan ${money(debtRemaining(s))}</option>`).join('');
 if(debts.some(s=>s.id===previous&&debtRemaining(s)>0))sel.value=previous;
 $('debtList').innerHTML='<h3>Borçlu satışlar ve tahsilatlar</h3><div class="tablewrap"><table><thead><tr><th>Müşteri / satış</th><th>Vade</th><th>Satış</th><th>Tahsil edilen</th><th>Kalan</th></tr></thead><tbody>'+debts.map(s=>`<tr><td>${esc(s.customer||s.productName||'Satış')}</td><td>${esc(s.dueDate||'Belirtilmedi')}</td><td>${money(s.total)}</td><td>${money(debtPaid(s.id))}</td><td>${money(debtRemaining(s))}</td></tr>`).join('')+'</tbody></table></div>';
}
function renderReconciliations(){
 const rows=db.reconciliations.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);
 $('reconcileHistory').innerHTML='<h4>Son mutabakatlar</h4><div class="tablewrap"><table><thead><tr><th>Tarih</th><th>Hesap</th><th>Sistem</th><th>Fiilî</th><th>Fark</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(CASH_METHODS[r.method])}</td><td>${money(r.expected)}</td><td>${money(r.actual)}</td><td>${money(r.actual-r.expected)}</td></tr>`).join('')+'</tbody></table></div>';
}
function renderCash(){
 if(!$('cashRows'))return;
 const f=$('cf').value,t=$('ct').value,stats=cashPeriodStats(f,t),dated=stats.dated,filtered=cashFiltered();
 $('cashCards').innerHTML=[['Gelen',stats.incoming],['Giden',stats.outgoing],['Net hareket',stats.net],['Kalan alacak',stats.outstanding],['Vadesi geçmiş alacak',stats.overdue]].map(([label,value])=>`<div class="card kpi"><div class="label">${esc(label)}</div><div class="value">${money(value)}</div></div>`).join('');
 $('cashByMethod').innerHTML='<h3>Hesap bakiyeleri ve dönem hareketleri</h3><div class="tablewrap"><table><thead><tr><th>Hesap</th><th>Gelen</th><th>Giden</th><th>Dönem neti</th><th>Toplam kayıtlı bakiye</th></tr></thead><tbody>'+['cash','card','iban','unknown'].map(k=>{const a=dated.filter(x=>x.method===k),i=sumDirection(a,'in'),o=sumDirection(a,'out');return `<tr><td>${esc(CASH_METHODS[k])}</td><td>${money(i)}</td><td>${money(o)}</td><td>${money(i-o)}</td><td>${money(balanceFor(k))}</td></tr>`;}).join('')+'</tbody></table></div><p class="muted">Bakiye, yalnızca sisteme kaydedilen hareketlerin toplamıdır. Açılış bakiyesi ve eski kayıtların ödeme türü eksikse banka veya kasa ekstresiyle eşit olmayabilir. POS tahsilatı bankaya geçince transfer kaydedin.</p>';
 $('cashRows').innerHTML=filtered.sort((a,b)=>b.date.localeCompare(a.date)).map(x=>`<tr><td>${esc(x.date)}</td><td>${x.direction==='in'?'Gelen':'Giden'}</td><td>${x.source==='sale'?'Satış':x.source==='expense'?'Gider':esc(CASH_KINDS[x.kind]||'Manuel')}</td><td>${esc(CASH_METHODS[x.method]||'Belirtilmemiş')}</td><td>${esc(x.note||'')}</td><td class="num">${x.direction==='in'?money(x.amount):'—'}</td><td class="num">${x.direction==='out'?money(x.amount):'—'}</td><td>${x.source==='manual'?`<button class="danger" onclick="deleteCashEntry('${esc(x.recordId||x.id)}')">Sil</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">Kayıt bulunamadı.</td></tr>';
 renderDebtList();renderReconciliations();
}
function renderCashReport(){
 const el=$('reportCashStats');if(!el)return;
 const st=cashPeriodStats($('rf').value,$('rt').value);
 el.innerHTML=`<div class="report-cards">${[['Gelen',st.incoming],['Giden',st.outgoing],['Net hareket',st.net],['Kalan alacak (tüm dönemler)',st.outstanding],['Vadesi geçmiş alacak',st.overdue]].map(([l,v])=>`<div class="card"><span class="muted">${esc(l)}</span><strong>${money(v)}</strong></div>`).join('')}</div><div class="tablewrap"><table><thead><tr><th>Ödeme türü</th><th>Gelen</th><th>Giden</th><th>Net</th></tr></thead><tbody>${['cash','card','iban','unknown'].map(k=>{const a=st.dated.filter(x=>x.method===k),i=sumDirection(a,'in'),o=sumDirection(a,'out');return `<tr><td>${esc(CASH_METHODS[k])}</td><td>${money(i)}</td><td>${money(o)}</td><td>${money(i-o)}</td></tr>`;}).join('')}</tbody></table></div><p class="muted">Transferler her iki hesapta karşılıklı görünür; toplam neti değiştirmez. Borç tahsilatları tahsil edildikleri tarihte hesaplanır.</p>`;
}
function exportCashCsv(){const lines=[['Tarih','Yön','Kaynak','Para türü','Açıklama','Gelen','Giden'],...cashFiltered().map(x=>[x.date,x.direction==='in'?'Gelen':'Giden',x.source,CASH_METHODS[x.method]||'Belirtilmemiş',x.note,x.direction==='in'?x.amount:'',x.direction==='out'?x.amount:''])];const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const blob=new Blob(['\ufeff'+lines.map(r=>r.map(q).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kasa-defteri-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
