let selectedCustomerId='';
function customerSales(id){return db.sales.filter(s=>s.customerId===id);}
function customerStats(id){
 const sales=customerSales(id),debts=sales.filter(s=>s.paymentType==='deferred');
 const purchases=sales.reduce((a,s)=>a+Math.round(s.total*100),0)/100;
 const debt=debts.reduce((a,s)=>a+Math.round(s.total*100),0)/100;
 const paid=debts.reduce((a,s)=>a+Math.round(debtPaid(s.id)*100),0)/100;
 const balance=debts.reduce((a,s)=>a+Math.round(debtRemaining(s)*100),0)/100;
 const overdue=debts.filter(s=>s.dueDate&&s.dueDate<today()).reduce((a,s)=>a+Math.round(debtRemaining(s)*100),0)/100;
 const advance=Number(db.customers.find(c=>c.id===id)?.advanceBalance||0);
 const advanceUsed=sales.reduce((a,s)=>a+Number(s.advanceApplied||0),0);
 return {sales,purchases,debt,paid,balance,overdue,advance,advanceUsed};
}
function fillCustomerSelect(){
 const sel=$('sCustomer'),value=sel.value,query=$('customerSelectSearch').value.trim().toLocaleLowerCase('tr-TR');
 sel.innerHTML='<option value="">Müşteri seçilmedi</option>'+db.customers.filter(c=>(c.active||c.id===value)&&(!query||c.name.toLocaleLowerCase('tr-TR').includes(query)||c.id===value)).slice().sort((a,b)=>a.name.localeCompare(b.name,'tr')).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
 if(db.customers.some(c=>c.id===value))sel.value=value;
 saleCustomerChanged();
}
function saleCustomerChanged(){
 const id=$('sCustomer').value,c=db.customers.find(c=>c.id===id),st=c?customerStats(id):null;
 $('saleCustomerBalance').textContent=c?`Cari hesap: ${money(st.balance)} kalan borç · ${money(st.overdue)} vadesi geçmiş · ${money(st.advance)} kullanılabilir ön ödeme`:'';
}
function newCustomer(){['cuId','cuName','cuPhone','cuEmail','cuAddress','cuNote'].forEach(k=>$(k).value='');$('cuActive').value='true';$('customerFormTitle').textContent='Yeni Müşteri';$('customerForm').style.display='block';$('cuName').focus();}
function editCustomer(id){const c=db.customers.find(c=>c.id===id);if(!c)return;for(const [key,field] of [['cuId','id'],['cuName','name'],['cuPhone','phone'],['cuEmail','email'],['cuAddress','address'],['cuNote','note']])$(key).value=c[field]||'';$('cuActive').value=String(c.active);$('customerFormTitle').textContent='Müşteriyi Düzenle';$('customerForm').style.display='block';$('cuName').focus();}
function cancelCustomer(){$('customerForm').style.display='none';}
function renderCustomers(){
 if(!$('customerRows'))return;
 const q=$('customerSearch').value.trim().toLocaleLowerCase('tr-TR'),filter=$('customerFilter').value;
 const all=db.customers.map(c=>({...c,stat:customerStats(c.id)}));
 const shown=all.filter(c=>`${c.name} ${c.phone} ${c.email}`.toLocaleLowerCase('tr-TR').includes(q)&&(!filter||(filter==='debt'&&c.stat.balance>0)||(filter==='overdue'&&c.stat.overdue>0)||(filter==='active'&&c.active)||(filter==='inactive'&&!c.active))).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
 const total=all.reduce((a,c)=>a+c.stat.balance,0),overdue=all.reduce((a,c)=>a+c.stat.overdue,0);
 $('customerTotals').innerHTML=[['Kayıtlı müşteri',num(all.length)],['Borcu olan müşteri',num(all.filter(c=>c.stat.balance>0).length)],['Toplam cari alacak',money(total)],['Vadesi geçmiş alacak',money(overdue)],['Müşteri ön ödeme bakiyeleri',money(all.reduce((a,c)=>a+c.stat.advance,0))]].map(([l,v])=>`<div class="card kpi"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div></div>`).join('');
 $('customerRows').innerHTML=shown.map(c=>`<tr><td><b>${esc(c.name)}</b>${c.active?'':' <span class="muted">(Pasif)</span>'}</td><td>${esc(c.phone)}</td><td>${money(c.stat.purchases)}</td><td>${money(c.stat.debt)}</td><td>${money(c.stat.paid)}</td><td><b>${money(c.stat.balance)}</b></td><td>${money(c.stat.overdue)}</td><td><b>${money(c.stat.advance)}</b></td><td class="actions"><button onclick="openCustomer('${c.id}')">Cari Hesap</button><button class="secondary" onclick="editCustomer('${c.id}')">Düzenle</button></td></tr>`).join('')||'<tr><td colspan="9" class="empty">Müşteri bulunamadı.</td></tr>';
 if(selectedCustomerId)renderCustomerDetail();
}
function customerStatement(id){
 const rows=[];
 for(const e of db.cashEntries.filter(e=>e.kind==='advance'&&e.customerId===id))rows.push({date:e.date,kind:'advance',name:'Ön ödeme alındı',note:e.note||'',due:'',debit:0,credit:e.amount,sort:0});
 for(const s of customerSales(id)){
  rows.push({date:s.date,kind:'sale',name:s.paymentType==='deferred'?'Vadeli satış':'Peşin satış',note:s.productName||product(s.productId)?.name||'Ürün',due:s.dueDate||'',debit:s.total,credit:0,sort:1});
  if(s.paymentType!=='deferred')rows.push({date:s.date,kind:'payment',name:'Satışta ödeme',note:'Ön ödemeden kullanılan: '+money(s.advanceApplied||0),due:'',debit:0,credit:Math.max(0,Math.round((s.total-Number(s.advanceApplied||0))*100)/100),sort:2});
  for(const e of db.cashEntries.filter(c=>c.kind==='debt'&&c.saleId===s.id))rows.push({date:e.date,kind:'payment',name:'Borç tahsilatı',note:e.note||'',due:'',debit:0,credit:e.amount,sort:3});
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.sort-b.sort);
 let running=0;for(const r of rows){running=Math.round((running+r.debit-r.credit)*100)/100;r.balance=running;}
 return rows;
}
function openCustomer(id){if(!db.customers.some(c=>c.id===id))return;selectedCustomerId=id;renderCustomerDetail();$('customerDetail').scrollIntoView({behavior:'smooth',block:'start'});}
function renderCustomerDetail(){
 const c=db.customers.find(c=>c.id===selectedCustomerId);if(!c){$('customerDetail').style.display='none';return;}
 $('customerDetail').style.display='block';$('customerDetailTitle').textContent=`Cari Hesap: ${c.name}`;
 const st=customerStats(c.id),rows=customerStatement(c.id);
 $('customerDetailStats').innerHTML=`<p><b>Telefon:</b> ${esc(c.phone||'—')} · <b>E-posta:</b> ${esc(c.email||'—')} · <b>Adres:</b> ${esc(c.address||'—')}</p><p><b>Toplam alışveriş:</b> ${money(st.purchases)} · <b>Vadeli satış:</b> ${money(st.debt)} · <b>Tahsilat:</b> ${money(st.paid)} · <b>Kalan borç:</b> ${money(st.balance)} · <b>Vadesi geçmiş:</b> ${money(st.overdue)} · <b>Kullanılabilir ön ödeme:</b> ${money(st.advance)} · <b>Satışlarda kullanılan ön ödeme:</b> ${money(st.advanceUsed)}</p>`;
 $('customerStatementRows').innerHTML=rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.name)}</td><td>${esc(r.note)}</td><td>${esc(r.due||'—')}</td><td>${r.debit?money(r.debit):'—'}</td><td>${r.credit?money(r.credit):'—'}</td><td>${money(r.balance)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Bu müşteriye bağlı satış yok.</td></tr>';
 const legacy=db.sales.filter(s=>!s.customerId&&s.paymentType==='deferred'&&s.customer&&s.customer.trim().toLocaleLowerCase('tr-TR')===c.name.trim().toLocaleLowerCase('tr-TR'));
 $('customerLegacyNotice').innerHTML=legacy.length?`<p><b>Eski satışlar:</b> Bu müşteri adına benzeyen ${legacy.length} eski borç satışı henüz cari hesaba bağlanmamış. Eşleşmeyi kontrol edip tek tek bağlayın.</p>${legacy.map(s=>`<div style="padding:5px 0">${esc(s.date)} · ${esc(s.productName||'Satış')} · Kalan ${money(debtRemaining(s))} <button class="secondary" onclick="linkLegacySale('${s.id}','${c.id}')">Bu müşteriye bağla</button></div>`).join('')}`:'';
}
function customerCsv(rows,filename){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const blob=new Blob(['\ufeff'+rows.map(r=>r.map(q).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function exportCustomersCsv(){customerCsv([['Müşteri','Telefon','E-posta','Alışveriş','Vadeli satış','Tahsilat','Kalan borç','Vadesi geçmiş','Ön ödeme bakiyesi'],...db.customers.map(c=>{const s=customerStats(c.id);return [c.name,c.phone,c.email,s.purchases,s.debt,s.paid,s.balance,s.overdue,s.advance];})],'musteriler-cari-hesap.csv');}
function exportCustomerStatementCsv(){const c=db.customers.find(c=>c.id===selectedCustomerId);if(!c)return;customerCsv([['Müşteri',c.name],['Tarih','İşlem','Açıklama','Vade','Borç','Ödeme','Bakiye'],...customerStatement(c.id).map(r=>[r.date,r.name,r.note,r.due,r.debit,r.credit,r.balance])],`cari-ekstre-${today()}.csv`);}
function printCustomerStatement(){if(!selectedCustomerId)return;document.body.classList.add('printing-customer');window.print();setTimeout(()=>document.body.classList.remove('printing-customer'),1000);}
function renderCustomerReport(){const el=$('reportCustomerStats');if(!el)return;const stats=db.customers.map(c=>customerStats(c.id));const debt=stats.reduce((a,s)=>a+s.balance,0),overdue=stats.reduce((a,s)=>a+s.overdue,0);el.innerHTML=`<h4>Müşteri Cari Hesapları</h4><p>Kayıtlı müşteri: <b>${num(db.customers.length)}</b> · Borcu olan: <b>${num(stats.filter(s=>s.balance>0).length)}</b> · Toplam kalan alacak: <b>${money(debt)}</b> · Kullanılabilir ön ödemeler: <b>${money(stats.reduce((a,s)=>a+s.advance,0))}</b> · Vadesi geçmiş: <b>${money(overdue)}</b></p><p class="muted">Cari hesap toplamları tüm dönemlere aittir. Eski müşteri kimliği bulunmayan satışlar bağlanana kadar bu toplama dahil değildir.</p>`;}
