let editingStock=null;
let db={products:[],sales:[],expenses:[]};
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat('tr-TR').format(Number(n)||0);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date());
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function product(id){return db.products.find(x=>x.id===id)}
function stockText(p){let q=Math.max(0,Number(p.stock)||0), c=Number(p.caseQty)||1; return `${Math.floor(q/c)} koli + ${q%c} adet (${q} adet)`}

document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));$(b.dataset.tab).classList.add('active'); if(b.dataset.tab==='reports')renderReport();});

function newProduct(){editingStock=null;clearImage();['pName','pSku','pCat','pSupplier','pBuy','pBuyCase','pWhole','pRetail','pCaseQty','pStock','pMin','pNote'].forEach(id=>$(id).value='');$('pCaseQty').value=1;$('pStock').value=0;$('pMin').value=0;$('pId').value='';$('productForm').style.display='block';scrollTo(0,0)}
function cancelProduct(){$('productForm').style.display='none'}
function editProduct(id){
 let p=product(id); if(!p)return;editingStock=p.stock;clearImage();setImage(p.image||'');
 $('pId').value=p.id;$('pName').value=p.name;$('pSku').value=p.sku;$('pCat').value=p.cat;$('pSupplier').value=p.supplier;$('pBuy').value=p.buy;$('pBuyCase').value=p.buyCase;$('pWhole').value=p.whole;$('pRetail').value=p.retail;$('pCaseQty').value=p.caseQty;$('pStock').value=p.stock;$('pMin').value=p.min;$('pNote').value=p.note||'';$('productForm').style.display='block';scrollTo(0,0)
}
function renderProducts(){
 let rows=filteredProducts();
 $('productRows').innerHTML=rows.length?rows.map(p=>`<tr>
 <td>${imageTag(p,'product-thumb')}<b>${esc(p.name)}</b><br><span class="muted">${esc(p.cat||'')}</span></td><td>${esc(p.sku||'')}</td>
 <td>${money(p.buy)}</td><td>${money(p.buyCase)}</td><td>${money(p.whole)}</td><td>${money(p.retail)}</td><td>${num(p.caseQty)} adet</td>
 <td class="${p.stock<=p.min?'danger':''}">${stockText(p)}</td><td>${money(p.stock*p.buy)}</td>
 <td class="actions"><button onclick="editProduct('${p.id}')">Düzenle</button><button class="danger" onclick="deleteProduct('${p.id}')">Sil</button></td></tr>`).join(''):`<tr><td colspan="10" class="empty">Henüz ürün yok.</td></tr>`;
}
function fillProducts(){let opts='<option value="">Ürün seçin</option>'+db.products.map(p=>`<option value="${p.id}">${esc(p.name)} — stok: ${p.stock}</option>`).join('');$('sProduct').innerHTML=opts}
function syncSalePrice(){
 let p=product($('sProduct').value);if(!p){$('sPrice').value='';$('saleInfo').textContent='';return}
 let type=$('sType').value, unit=$('sUnit').value, price=type==='wholesale'?p.whole:p.retail;
 $('sPrice').value=unit==='case'?price*(p.caseQty||1):price;
 $('saleInfo').textContent=`Mevcut stok: ${stockText(p)} | Koli içi: ${p.caseQty} adet | Alış maliyeti/adet: ${money(p.buy)}`;
}
function renderSales(){
 let f=$('sf').value,t=$('st').value,type=$('stypeFilter').value;
 let a=db.sales.filter(s=>(!f||s.date>=f)&&(!t||s.date<=t)&&(!type||s.type===type)).slice().sort((a,b)=>b.date.localeCompare(a.date));
 $('salesRows').innerHTML=a.length?a.map(s=>{let p=product(s.productId);return `<tr><td>${s.date}</td><td>${esc(p?.name||'Silinmiş ürün')}</td><td><span class="badge ${s.type}">${s.type==='wholesale'?'Toptan':'Perakende'}</span></td><td>${num(s.qty)} ${s.unit==='case'?'koli':'adet'} / ${num(s.units)} adet</td><td>${money(s.price)}</td><td>${money(s.total)}</td><td>${money(s.cost)}</td><td class="ok">${money(s.profit)}</td><td><button class="danger" onclick="deleteSale('${s.id}')">Sil</button></td></tr>`}).join(''):`<tr><td colspan="9" class="empty">Kayıt yok.</td></tr>`;
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
 let {sales,expenses}=reportData(), total=sales.reduce((a,s)=>a+s.total,0), wh=sales.filter(s=>s.type==='wholesale').reduce((a,s)=>a+s.total,0), re=sales.filter(s=>s.type==='retail').reduce((a,s)=>a+s.total,0), profit=sales.reduce((a,s)=>a+s.profit,0), exp=expenses.reduce((a,e)=>a+e.amount,0);
 $('rSales').textContent=money(total);$('rWholesale').textContent=money(wh);$('rRetail').textContent=money(re);$('rProfit').textContent=money(profit);$('rExpense').textContent=money(exp);
 let wp=sales.filter(s=>s.type==='wholesale').reduce((a,s)=>a+s.profit,0),rp=sales.filter(s=>s.type==='retail').reduce((a,s)=>a+s.profit,0);
 $('profitSummary').innerHTML=`<table><tr><td>Toptan satış</td><td class="num">${money(wh)}</td></tr><tr><td>Toptan brüt kâr</td><td class="num">${money(wp)}</td></tr><tr><td>Perakende satış</td><td class="num">${money(re)}</td></tr><tr><td>Perakende brüt kâr</td><td class="num">${money(rp)}</td></tr></table>`;
 $('periodSummary').innerHTML=`<table><tr><td>Satış maliyeti</td><td class="num">${money(sales.reduce((a,s)=>a+s.cost,0))}</td></tr><tr><td>Brüt kâr</td><td class="num">${money(profit)}</td></tr><tr><td>Gider</td><td class="num">${money(exp)}</td></tr><tr><td><b>Net sonuç</b></td><td class="num"><b>${money(profit-exp)}</b></td></tr></table>`;
 $('reportRows').innerHTML=sales.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>{let p=product(s.productId);return `<tr><td>${s.date}</td><td>${esc(p?.name||'Silinmiş')}</td><td>${s.type==='wholesale'?'Toptan':'Perakende'}</td><td>${num(s.units)} adet</td><td>${money(s.total)}</td><td>${money(s.cost)}</td><td>${money(s.profit)}</td></tr>`}).join('')||`<tr><td colspan="7" class="empty">Seçilen dönemde satış yok.</td></tr>`;
}
function backup(){let blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='stok-satis-yedek-'+today()+'.json';a.click();URL.revokeObjectURL(a.href)}
function renderDashboard(){let stock=db.products.reduce((a,p)=>a+p.stock,0),cost=db.products.reduce((a,p)=>a+p.stock*p.buy,0),sales=db.sales.reduce((a,s)=>a+s.total,0),profit=db.sales.reduce((a,s)=>a+s.profit,0);$('kStock').textContent=num(stock);$('kCost').textContent=money(cost);$('kSales').textContent=money(sales);$('kProfit').textContent=money(profit);let ss=db.sales.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);$('dashSales').innerHTML=ss.length?ss.map(s=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)">${s.date} — ${esc(product(s.productId)?.name||'')} <b style="float:right">${money(s.total)}</b></div>`).join(''):'<div class="empty">Satış yok.</div>';let low=db.products.filter(p=>p.stock<=p.min);$('dashStock').innerHTML=low.length?low.map(p=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)">${esc(p.name)} <b style="float:right">${stockText(p)}</b></div>`).join(''):'<div class="empty">Kritik stok yok.</div>'}
function dataInfo(){$('dataInfo').innerHTML=`Ürün: <b>${db.products.length}</b> | Satış: <b>${db.sales.length}</b> | Gider: <b>${db.expenses.length}</b><br><span class="muted">Son yerel kayıt: ${new Date().toLocaleString('tr-TR')}</span>`}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderAll(){renderStockReport();renderProducts();fillProducts();renderSales();renderExpenses();renderReport();renderDashboard();dataInfo()}
$('sDate').value=today();$('sf').value=new Date(Date.now()-30*86400000).toISOString().slice(0,10);$('st').value=today();$('rf').value=today().slice(0,8)+'01';$('rt').value=today();
renderAll();
