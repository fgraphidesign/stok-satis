let editingStock=null;
const selectedProductIds=new Set();
function toggleProductSelection(id,checked){if(checked)selectedProductIds.add(id);else selectedProductIds.delete(id);updateSelectedProductsUI();}
function toggleVisibleProducts(checked){for(const p of filteredProducts()){if(checked)selectedProductIds.add(p.id);else selectedProductIds.delete(p.id);}renderProducts();}
function updateSelectedProductsUI(){for(const id of [...selectedProductIds])if(!db.products.some(p=>p.id===id))selectedProductIds.delete(id);const el=$('selectedProductsCount'),btn=$('deleteSelectedProductsButton');if(el)el.textContent=`${selectedProductIds.size} ürün seçildi`;if(btn)btn.disabled=!selectedProductIds.size;const all=$('selectVisibleProducts');if(all){const rows=filteredProducts();all.checked=rows.length>0&&rows.every(p=>selectedProductIds.has(p.id));all.indeterminate=rows.some(p=>selectedProductIds.has(p.id))&&!all.checked;}}
let db={products:[],sales:[],expenses:[],cashEntries:[],reconciliations:[],customers:[]};
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat('tr-TR').format(Number(n)||0);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date());
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function product(id){return db.products.find(x=>x.id===id)}
function stockText(p){if(p.stock===null)return 'Sayım bekliyor';let q=Math.max(0,Number(p.stock)||0), c=Number(p.caseQty)||1; return `${Math.floor(q/c)} koli + ${q%c} adet (${q} adet)`}

document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));$(b.dataset.tab).classList.add('active'); if(b.dataset.tab==='reports')renderReport(); if(b.dataset.tab==='quickprices'){renderQuickPrices();$('quickPriceSearch').focus();}});

function newProduct(){editingStock=null;clearImage();['pName','pSku','pCat','pSupplier','pBuy','pBuyCase','pWhole','pRetail','pCaseQty','pStock','pMin','pNote'].forEach(id=>$(id).value='');$('pCaseQty').value=1;$('pStock').value=0;$('pMin').value=0;$('pId').value='';$('productForm').style.display='block';scrollTo(0,0)}
function cancelProduct(){$('productForm').style.display='none'}
function editProduct(id){
 let p=product(id); if(!p)return;editingStock=p.stock;clearImage();setImage(p.image||'');
 $('pId').value=p.id;$('pName').value=p.name;$('pSku').value=p.sku;$('pCat').value=p.cat;$('pSupplier').value=p.supplier;$('pBuy').value=p.buy;$('pBuyCase').value=p.buyCase;$('pWhole').value=p.whole;$('pRetail').value=p.retail;$('pCaseQty').value=p.caseQty;$('pStock').value=p.stock??'';$('pMin').value=p.min;$('pNote').value=p.note||'';$('productForm').style.display='block';scrollTo(0,0)
}
function renderProducts(){
 let rows=filteredProducts();
 $('productRows').innerHTML=rows.length?rows.map(p=>`<tr><td><input type="checkbox" aria-label="${esc(p.name)} seç" ${selectedProductIds.has(p.id)?'checked':''} onchange="toggleProductSelection('${p.id}',this.checked)"></td>
 <td>${imageTag(p,'product-thumb')}<b>${esc(p.name)}</b><br><span class="muted">${esc(p.cat||'')}</span></td><td>${esc(p.sku||'')}</td>
 <td>${money(p.buy)}</td><td>${money(p.buyCase)}</td><td>${money(p.whole)}</td><td>${money(p.retail)}</td><td>${num(p.caseQty)} adet</td>
 <td class="${p.stock!==null&&p.stock<=p.min?'danger':''}">${stockText(p)}</td><td>${money((p.stock??0)*p.buy)}</td>
 <td class="actions"><button onclick="editProduct('${p.id}')">Düzenle</button><button class="danger" onclick="deleteProduct('${p.id}')">Sil</button></td></tr>`).join(''):`<tr><td colspan="11" class="empty">Henüz ürün yok.</td></tr>`;
 updateSelectedProductsUI();
}
let saleSearchMatches=[],saleSearchActive=0;
function fillProducts(){
 const selected=$('sProduct').value;
 const p=product(selected);
 $('saleSelectedProduct').textContent=p?`${p.name} · ${p.sku||'Kodsuz'} · ${stockText(p)}`:'Henüz ürün seçilmedi.';
 if(!p&&selected)$('sProduct').value='';
 if(!$('saleProductResults').hidden)searchSaleProducts();
}
function searchSaleProducts(){
 $('sProduct').value='';$('saleSelectedProduct').textContent='Arama sonucundan bir ürün seçin.';syncSalePrice();
 const query=$('saleProductSearch').value.trim().toLocaleLowerCase('tr-TR');
 saleSearchMatches=db.products.filter(p=>`${p.name} ${p.sku||''} ${p.cat||''}`.toLocaleLowerCase('tr-TR').includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'tr')).slice(0,50);
 saleSearchActive=0;
 const panel=$('saleProductResults');
 panel.hidden=false;$('saleProductSearch').setAttribute('aria-expanded','true');
 panel.innerHTML=saleSearchMatches.length?saleSearchMatches.map((p,i)=>`<button type="button" class="sale-search-option ${i===0?'active':''}" role="option" aria-selected="${i===0}" data-sale-index="${i}"><strong>${esc(p.name)}</strong><small>${esc(p.sku||'Kodsuz')} · ${esc(p.cat||'')} · ${stockText(p)} · Perakende ${money(p.retail)}</small></button>`).join(''):'<div class="muted" style="padding:12px">Eşleşen ürün bulunamadı.</div>';
 panel.querySelectorAll('[data-sale-index]').forEach(button=>button.addEventListener('click',()=>selectSaleProduct(Number(button.dataset.saleIndex))));
}
function selectSaleProduct(index){
 const p=saleSearchMatches[index];if(!p)return;
 $('sProduct').value=p.id;
 $('saleProductSearch').value=p.name;
 $('saleProductResults').hidden=true;$('saleProductSearch').setAttribute('aria-expanded','false');
 $('saleSelectedProduct').textContent=`Seçilen: ${p.name} · ${p.sku||'Kodsuz'} · ${stockText(p)}`;
 syncSalePrice();
 $('sQty').focus();
}
function saleSearchKeydown(e){
 const panel=$('saleProductResults');
 if(e.key==='Escape'){panel.hidden=true;return;}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  e.preventDefault();if(panel.hidden){searchSaleProducts();return;}
  saleSearchActive=(saleSearchActive+(e.key==='ArrowDown'?1:-1)+saleSearchMatches.length)%Math.max(1,saleSearchMatches.length);
  panel.querySelectorAll('[data-sale-index]').forEach((b,i)=>{b.classList.toggle('active',i===saleSearchActive);b.setAttribute('aria-selected',String(i===saleSearchActive));});
  panel.querySelector('.active')?.scrollIntoView({block:'nearest'});
 }
 if(e.key==='Enter'&&!panel.hidden){e.preventDefault();selectSaleProduct(saleSearchActive);}
}
document.addEventListener('click',e=>{if(!e.target.closest('.sale-product-picker')){$('saleProductResults').hidden=true;$('saleProductSearch').setAttribute('aria-expanded','false');}});
function syncSalePrice(){
 let p=product($('sProduct').value);if(!p){$('sPrice').value='';$('saleInfo').textContent='';return}
 let type=$('sType').value, unit=$('sUnit').value, price=type==='wholesale'?p.whole:p.retail;
 $('sPrice').value=unit==='case'?price*(p.caseQty||1):price;
 $('saleInfo').textContent=`Mevcut stok: ${stockText(p)} | Koli içi: ${p.caseQty} adet | Alış maliyeti/adet: ${money(p.buy)}`;
}
const PAYMENT_LABELS={cash:'Nakit',card:'Kredi Kartı',iban:'IBAN',deferred:'İleri Tarihli (Borç)',unknown:'Belirtilmemiş'};
function paymentLabel(s){return PAYMENT_LABELS[s.paymentType]||'Belirtilmemiş';}
function renderSales(){
 let f=$('sf').value,t=$('st').value,type=$('stypeFilter').value;
 let a=db.sales.filter(s=>(!f||s.date>=f)&&(!t||s.date<=t)&&(!type||s.type===type)).slice().sort((a,b)=>b.date.localeCompare(a.date));
 $('salesRows').innerHTML=a.length?a.map(s=>{let p=product(s.productId);return `<tr><td>${s.date}</td><td>${esc(p?.name||'Silinmiş ürün')}</td><td><span class="badge ${s.type}">${s.type==='wholesale'?'Toptan':'Perakende'}</span></td><td>${esc(paymentLabel(s))}</td><td>${num(s.qty)} ${s.unit==='case'?'koli':'adet'} / ${num(s.units)} adet</td><td>${money(s.price)}</td><td>${money(s.total)}</td><td>${money(s.cost)}</td><td class="ok">${money(s.profit)}</td><td><button class="danger" onclick="deleteSale('${s.id}')">Sil</button></td></tr>`}).join(''):`<tr><td colspan="10" class="empty">Kayıt yok.</td></tr>`;
}
function newExpense(){$('eDate').value=today();$('eCat').value='';$('eAmount').value='';$('eNote').value='';$('expenseForm').style.display='block'}
function cancelExpense(){$('expenseForm').style.display='none'}
function renderExpenses(){$('expenseRows').innerHTML=db.expenses.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<tr><td>${e.date}</td><td>${esc(e.cat||'Diğer')}</td><td>${esc(e.note||'')}</td><td class="num">${money(e.amount)}</td><td><button class="danger" onclick="deleteExpense('${e.id}')">Sil</button></td></tr>`).join('')||`<tr><td colspan="5" class="empty">Gider yok.</td></tr>`}
function setPeriod(type){
 let d=new Date(), f='',t=today();
 if(type==='today')f=t;
 if(type==='week'){let day=d.getDay()||7;d.setDate(d.getDate()-day+1);f=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(d)}
 if(type==='month')f=today().slice(0,8)+'01';
 if(type==='all'){f='';t=''}
 $('rf').value=f;$('rt').value=t;renderReport()
}
function reportData(){
 let f=$('rf').value,t=$('rt').value;
 let sales=db.sales.filter(s=>(!f||s.date>=f)&&(!t||s.date<=t));
 let expenses=db.expenses.filter(e=>(!f||e.date>=f)&&(!t||e.date<=t));
 return {sales,expenses}
}
function renderReport(){
 renderCashReport();renderCustomerReport();
 let {sales,expenses}=reportData(), total=sales.reduce((a,s)=>a+s.total,0), wh=sales.filter(s=>s.type==='wholesale').reduce((a,s)=>a+s.total,0), re=sales.filter(s=>s.type==='retail').reduce((a,s)=>a+s.total,0), profit=sales.reduce((a,s)=>a+s.profit,0), exp=expenses.reduce((a,e)=>a+e.amount,0);
 $('rSales').textContent=money(total);$('rWholesale').textContent=money(wh);$('rRetail').textContent=money(re);$('rProfit').textContent=money(profit);$('rExpense').textContent=money(exp);
 let wp=sales.filter(s=>s.type==='wholesale').reduce((a,s)=>a+s.profit,0),rp=sales.filter(s=>s.type==='retail').reduce((a,s)=>a+s.profit,0);
 $('profitSummary').innerHTML=`<table><tr><td>Toptan satış</td><td class="num">${money(wh)}</td></tr><tr><td>Toptan brüt kâr</td><td class="num">${money(wp)}</td></tr><tr><td>Perakende satış</td><td class="num">${money(re)}</td></tr><tr><td>Perakende brüt kâr</td><td class="num">${money(rp)}</td></tr></table>`;
 $('periodSummary').innerHTML=`<table><tr><td>Satış maliyeti</td><td class="num">${money(sales.reduce((a,s)=>a+s.cost,0))}</td></tr><tr><td>Brüt kâr</td><td class="num">${money(profit)}</td></tr><tr><td>Gider</td><td class="num">${money(exp)}</td></tr><tr><td><b>Net sonuç</b></td><td class="num"><b>${money(profit-exp)}</b></td></tr></table>`;
 const payments=['cash','card','iban','deferred','unknown'].map(key=>({key,label:PAYMENT_LABELS[key],items:sales.filter(s=>(s.paymentType||'unknown')===key)}));
 $('paymentSummary').innerHTML=`<div class="tablewrap"><table><thead><tr><th>Ödeme türü</th><th>İşlem</th><th class="num">Satış tutarı</th></tr></thead><tbody>${payments.map(g=>`<tr><td>${esc(g.label)}</td><td>${num(g.items.length)}</td><td class="num">${money(g.items.reduce((a,s)=>a+s.total,0))}</td></tr>`).join('')}</tbody></table></div><p class="muted">Tahsil edildiği varsayılan (Nakit + Kredi Kartı + IBAN): ${money(payments.filter(g=>['cash','card','iban'].includes(g.key)).reduce((a,g)=>a+g.items.reduce((b,s)=>b+s.total,0),0))}. Borç olarak kaydedilen: ${money(payments.find(g=>g.key==='deferred').items.reduce((a,s)=>a+s.total,0))}. Geçmiş kayıtların tahsilat durumu bilinmeyebilir.</p>`;
 $('reportRows').innerHTML=sales.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>{let p=product(s.productId);return `<tr><td>${s.date}</td><td>${esc(p?.name||'Silinmiş')}</td><td>${s.type==='wholesale'?'Toptan':'Perakende'}</td><td>${esc(paymentLabel(s))}</td><td>${num(s.units)} adet</td><td>${money(s.total)}</td><td>${money(s.cost)}</td><td>${money(s.profit)}</td></tr>`}).join('')||`<tr><td colspan="8" class="empty">Seçilen dönemde satış yok.</td></tr>`;
}
function backup(){let blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='stok-satis-yedek-'+today()+'.json';a.click();URL.revokeObjectURL(a.href)}
function renderDashboard(){
 const products=db.products,sales=db.sales,expenses=db.expenses;
 const stock=products.reduce((a,p)=>a+(p.stock??0),0);
 const cost=products.reduce((a,p)=>a+(p.stock??0)*p.buy,0);
 const totalSales=sales.reduce((a,s)=>a+s.total,0);
 const profit=sales.reduce((a,s)=>a+s.profit,0);
 const expenseTotal=expenses.reduce((a,e)=>a+e.amount,0);
 $('kStock').textContent=num(stock);$('kCost').textContent=money(cost);$('kSales').textContent=money(totalSales);$('kProfit').textContent=money(profit);
 const retailValue=products.reduce((a,p)=>a+(p.stock??0)*p.retail,0);
 const wholeValue=products.reduce((a,p)=>a+(p.stock??0)*p.whole,0);
 const unknown=products.filter(p=>p.stock===null).length;
 const zero=products.filter(p=>p.stock===0).length;
 const low=products.filter(p=>p.stock!==null&&p.stock>0&&p.stock<=p.min).length;
 const stats=[
 ['Kayıtlı ürün',num(products.length)],['Stoku bilinmeyen',num(unknown)],['Stokta olmayan',num(zero)],['Kritik stok',num(low)],
 ['Toptan stok değeri',money(wholeValue)],['Perakende stok değeri',money(retailValue)],
 ['Satış işlemi',num(sales.length)],['Satılan toplam adet',num(sales.reduce((a,s)=>a+s.units,0))],
 ['Toplam satış maliyeti',money(sales.reduce((a,s)=>a+s.cost,0))],['Toplam gider',money(expenseTotal)],
 ['Net sonuç (kâr − gider)',money(profit-expenseTotal)],['Kategori sayısı',num(new Set(products.map(p=>p.cat||'Kategorisiz')).size)]
 ];
 $('dashboardStats').innerHTML=stats.map(([label,value])=>`<div class="card kpi"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join('');
 function grouped(items,key,value){const map=new Map();items.forEach(x=>{const k=key(x)||'Diğer';map.set(k,(map.get(k)||0)+value(x));});return [...map].sort((a,b)=>b[1]-a[1]);}
 function groupTable(id,items,format){$(id).innerHTML=items.length?`<div class="tablewrap"><table><tbody>${items.map(([name,value])=>`<tr><td>${esc(name)}</td><td class="num"><b>${format(value)}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Kayıt yok.</div>';}
 groupTable('dashCategories',grouped(products,p=>p.cat||'Kategorisiz',p=>p.stock??0),num);
 groupTable('dashTopProducts',grouped(sales,s=>product(s.productId)?.name||s.productName||'Silinmiş ürün',s=>s.units).slice(0,10),num);
 groupTable('dashSaleTypes',grouped(sales,s=>s.type==='wholesale'?'Toptan':'Perakende',s=>s.total),money);
 groupTable('dashExpenseCategories',grouped(expenses,e=>e.cat||'Diğer',e=>e.amount),money);
 const recent=sales.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
 $('dashSales').innerHTML=recent.length?recent.map(s=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)">${esc(s.date)} — ${esc(product(s.productId)?.name||s.productName||'Ürün bulunamadı')} <b style="float:right">${money(s.total)}</b></div>`).join(''):'<div class="empty">Satış yok.</div>';
 const critical=products.filter(p=>p.stock!==null&&p.stock<=p.min).slice(0,30);
 $('dashStock').innerHTML=critical.length?critical.map(p=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)">${esc(p.name)} <b style="float:right">${stockText(p)}</b></div>`).join(''):'<div class="empty">Kritik stok yok.</div>';
}
function dataInfo(){$('dataInfo').innerHTML=`Ürün: <b>${db.products.length}</b> | Satış: <b>${db.sales.length}</b> | Gider: <b>${db.expenses.length}</b> | Manuel kasa: <b>${db.cashEntries.length}</b><br><span class="muted">Son yerel kayıt: ${new Date().toLocaleString('tr-TR')}</span>`}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderQuickPrices(){
 const input=$('quickPriceSearch'),out=$('quickPriceResults'),count=$('quickPriceCount');if(!input||!out)return;
 const q=input.value.trim().toLocaleLowerCase('tr-TR');
 const products=[...db.products].filter(p=>!q||`${p.name||''} ${p.sku||''}`.toLocaleLowerCase('tr-TR').includes(q)).sort((a,b)=>(a.name||'').localeCompare(b.name||'','tr'));
 const shown=products.slice(0,100);
 count.textContent=products.length?`${products.length} ürün bulundu${products.length>100?' · İlk 100 ürün gösteriliyor':''}`:'Ürün bulunamadı';
 out.innerHTML=shown.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 2px;border-bottom:1px solid #e5e7eb"><div style="min-width:0"><strong style="font-size:17px">${esc(p.name||'')}</strong></div><strong style="font-size:21px;white-space:nowrap">${money(p.retail)}</strong></div>`).join('');
}
function renderAll(){renderQuickPrices();renderCustomers();fillCustomerSelect();renderCash();renderStockReport();renderProducts();fillProducts();renderSales();renderExpenses();renderReport();renderCashReport();renderDashboard();dataInfo()}
$('sDate').value=today();$('sf').value=new Date(Date.now()-30*86400000).toISOString().slice(0,10);$('st').value=today();$('rf').value=today().slice(0,8)+'01';$('rt').value=today();
$('debtDate').value=today();$('reconcileDate').value=today();

function toggleSaleDebtFields(){const show=$('sPayment').value==='deferred';$('saleCustomerWrap').style.display=show?'block':'none';$('saleDueWrap').style.display=show?'block':'none';}
