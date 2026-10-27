import { firebaseConfig } from './firebase-config.js';
let auth,store,currentUser=null,ready=false,pending=false,subscriptions=[];
const loaded=new Set();
function status(text){document.getElementById('syncStatus').textContent=text;}
function reportError(e){console.error(e);status('İşlem tamamlanamadı.');alert(e.message||'İşlem başarısız oldu.');}
async function action(fn){if(pending)return;if(!currentUser||!ready){alert('Verilerin yüklenmesini ve bağlantıyı bekleyin.');return;}pending=true;const buttons=[...document.querySelectorAll('button')].filter(b=>!b.disabled);buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){reportError(e);}finally{pending=false;buttons.forEach(b=>b.disabled=false);}}
let api;
function ref(kind,id){return api.doc(store,'users',currentUser.uid,kind,id);}
function withoutId(obj){const {id,...data}=obj;return data;}
function ensureNumber(id,integer=false,min=0){const value=Number(document.getElementById(id).value);if(!Number.isFinite(value)||value<min||(integer&&!Number.isInteger(value)))throw Error('Miktar ve fiyat alanlarını kontrol edin.');return value;}
function safeId(id){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Error('Kayıt kimliği geçersiz.');return id;}
function normalizeProduct(p){return {...p,name:p.name||'',sku:p.sku||'',cat:p.cat??p.category??'',supplier:p.supplier||'',note:p.note||'',buy:Number(p.buy??p.buy_price??0),buyCase:Number(p.buyCase??p.buy_case_price??0),whole:Number(p.whole??p.wholesale_price??0),retail:Number(p.retail??p.retail_price??0),caseQty:Number(p.caseQty??p.case_qty??1),stock:(p.stock===null||p.stock_units===null)?null:Number(p.stock??p.stock_units??0),min:Number(p.min??p.min_stock??0),image:validImage(p.image)?p.image:''};}
function normalizeSale(s){return {...s,date:s.date??s.sale_date??'',productId:s.productId??s.product_id,type:s.type??s.sale_type??'retail',unit:s.unit||'unit',qty:Number(s.qty??s.quantity_units??0),units:Number(s.units??s.quantity_units??0),price:Number(s.price??0),total:Number(s.total??s.total_amount??0),cost:Number(s.cost??s.cost_amount??0),profit:Number(s.profit??s.profit_amount??0),note:s.note||'',paymentType:['cash','card','iban','deferred'].includes(s.paymentType)?s.paymentType:'unknown'};}
function normalizeExpense(e){return {...e,date:e.date??e.expense_date??'',cat:e.cat??e.category??'',amount:Number(e.amount||0),note:e.note||''};}
async function saveProduct(){return action(async()=>{
 if(imageLoading)throw Error('Görselin hazırlanmasını bekleyin.');const id=safeId($('pId').value||crypto.randomUUID()),old=product(id);
 const p={...old,id,name:$('pName').value.trim(),sku:$('pSku').value.trim(),cat:$('pCat').value.trim(),supplier:$('pSupplier').value.trim(),note:$('pNote').value.trim(),buy:ensureNumber('pBuy'),buyCase:ensureNumber('pBuyCase'),whole:ensureNumber('pWhole'),retail:ensureNumber('pRetail'),caseQty:ensureNumber('pCaseQty',true,1),stock:$('pStock').value.trim()===''?null:ensureNumber('pStock',true),min:ensureNumber('pMin',true),image:productImage};
 if(!p.name)throw Error('Ürün adı zorunlu.');if($('pBuyCase').value==='')p.buyCase=p.buy*p.caseQty;
 await api.runTransaction(store,async tx=>{const target=ref('products',id),snap=await tx.get(target);if(old&&(!snap.exists()||normalizeProduct(snap.data()).stock!==editingStock))throw Error('Stok başka bir işlemle değişti. Ürünü yeniden açın.');if(!old&&snap.exists())throw Error('Kayıt kimliği çakıştı.');tx.set(target,withoutId(p));});cancelProduct();clearImage();status('Ürün kaydedildi.');
 });}
async function deleteProduct(id){if(db.sales.some(s=>s.productId===id)){alert('Satış kaydı bulunan ürün silinemez.');return;}if(!confirm('Ürün silinsin mi?'))return;return action(async()=>{await api.runTransaction(store,async tx=>{const target=ref('products',safeId(id)),snap=await tx.get(target);if(!snap.exists())return;if(snap.data().saleCount>0)throw Error('Bu ürünün satış kayıtları var.');tx.delete(target);});});}
function updateBulkDeleteButton(){
 const count=db.products.length;
 const hasSales=db.sales.length>0||db.products.some(p=>Number(p.saleCount||0)>0);
 const info=document.getElementById('bulkDeleteInfo'),button=document.getElementById('bulkDeleteButton');
 if(!info||!button)return;
 info.textContent=`Kayıtlı ürün: ${count}. ${hasSales?'Satış geçmişi bulundu: toplu silme engellendi.':'Satış bağlantısı kontrolü: engel görünmüyor.'}`;
 button.disabled=!ready||pending||!count||hasSales||!document.getElementById('bulkDeleteBackup').checked||document.getElementById('bulkDeleteConfirm').value.trim()!=='TÜM ÜRÜNLERİ SİL';
}
async function deleteAllProducts(){
 if(!ready||!currentUser||pending)return;
 if(!db.products.length){alert('Silinecek ürün bulunmuyor.');return;}
 if(!document.getElementById('bulkDeleteBackup').checked){alert('Önce güncel JSON yedeğini indirin.');return;}
 if(document.getElementById('bulkDeleteConfirm').value.trim()!=='TÜM ÜRÜNLERİ SİL'){alert('Onay metnini eksiksiz yazın.');return;}
 if(db.sales.length||db.products.some(p=>Number(p.saleCount||0)>0)){alert('Satış geçmişiyle ilişkili ürünler bulunduğu için toplu silme engellendi.');return;}
 const count=db.products.length;
 if(count>450){alert('450 üründen fazlası tek seferde silinemez.');return;}
 if(!confirm(`${count} ürün kalıcı olarak silinecek. Satış ve gider kayıtları korunacak. İşlemi onaylıyor musunuz?`))return;
 return action(async()=>{
  // Silme öncesi sunucudaki güncel satış ve ürün kayıtlarını kontrol et.
  const uid=currentUser.uid;
  const [salesSnapshot,productsSnapshot]=await Promise.all([
   api.getDocsFromServer(api.collection(store,'users',uid,'sales')),
   api.getDocsFromServer(api.collection(store,'users',uid,'products'))
  ]);
  if(salesSnapshot.size>0)throw Error('Satış kaydı bulundu. Ürünlerin toplu silinmesi engellendi.');
  if(productsSnapshot.size!==count)throw Error('Ürün sayısı değişti. Sayfayı yenileyip yeniden kontrol edin.');
  for(const doc of productsSnapshot.docs){if(Number(doc.data().saleCount||0)>0)throw Error('Satış geçmişi olan ürün bulundu. Silme engellendi.');}
  const batch=api.writeBatch(store);
  for(const doc of productsSnapshot.docs)batch.delete(doc.ref);
  await batch.commit();
  document.getElementById('bulkDeleteBackup').checked=false;
  document.getElementById('bulkDeleteConfirm').value='';
  status(`${count} ürün silindi. Excel'den yeniden aktarabilirsiniz.`);
  alert(`${count} ürün silindi. Şimdi düzeltilmiş Excel dosyanızı içeri aktarabilirsiniz.`);
 });
}
async function saveSale(){return action(async()=>{
 const p=product($('sProduct').value);if(!p)throw Error('Ürün seçin.');const qty=ensureNumber('sQty',true,1),price=ensureNumber('sPrice'),date=$('sDate').value;if(!date)throw Error('Tarih seçin.');const unit=$('sUnit').value,type=$('sType').value,paymentType=$('sPayment').value;if(!['cash','card','iban','deferred'].includes(paymentType))throw Error('Geçerli bir ödeme türü seçin.');const note=$('sNote').value.trim(),saleId=crypto.randomUUID();
 await api.runTransaction(store,async tx=>{const pr=ref('products',p.id),snap=await tx.get(pr);if(!snap.exists())throw Error('Ürün bulunamadı.');const fresh=normalizeProduct(snap.data()),units=qty*(unit==='case'?fresh.caseQty:1);if(fresh.stock===null)throw Error('Bu ürünün stok miktarı bilinmiyor. Önce stok sayımı girin.');if(units>fresh.stock)throw Error('Yetersiz stok. Mevcut: '+fresh.stock+' adet.');const total=qty*price,cost=units*fresh.buy;tx.update(pr,{stock:fresh.stock-units,saleCount:Number(snap.data().saleCount||0)+1});tx.set(ref('sales',saleId),{date,productId:p.id,productName:fresh.name,type,paymentType,unit,qty,units,price,total,cost,profit:total-cost,note});});$('sQty').value=1;$('sNote').value='';status('Satış kaydedildi, stok güncellendi.');
 });}
async function deleteSale(id){if(!confirm('Satış silinsin ve stok geri eklensin mi?'))return;return action(async()=>{await api.runTransaction(store,async tx=>{const sr=ref('sales',safeId(id)),snap=await tx.get(sr);if(!snap.exists())return;const s=normalizeSale(snap.data()),pr=ref('products',s.productId),ps=await tx.get(pr);if(!ps.exists())throw Error('Ürün bulunamadı; stok iadesi yapılamadı.');if(normalizeProduct(ps.data()).stock===null)throw Error('Stok miktarı bilinmeyen ürüne iade yapılamaz.');tx.update(pr,{stock:normalizeProduct(ps.data()).stock+s.units,saleCount:Math.max(0,Number(ps.data().saleCount||0)-1)});tx.delete(sr);});});}
async function saveExpense(){return action(async()=>{const amount=ensureNumber('eAmount');if(amount<=0||!$('eDate').value)throw Error('Tarih ve pozitif tutar girin.');await api.setDoc(ref('expenses',crypto.randomUUID()),{date:$('eDate').value,cat:$('eCat').value.trim(),amount,note:$('eNote').value.trim()});cancelExpense();});}
async function deleteExpense(id){if(confirm('Gider silinsin mi?'))return action(()=>api.deleteDoc(ref('expenses',safeId(id))));}
function validateBackup(data){
 if(!data||!['products','sales','expenses'].every(k=>Array.isArray(data[k])))throw Error('Yedek biçimi geçersiz.');const result={products:data.products.map(normalizeProduct),sales:data.sales.map(normalizeSale),expenses:data.expenses.map(normalizeExpense)};
 for(const kind of ['products','sales','expenses']){const ids=new Set();for(const row of result[kind]){safeId(row.id);if(ids.has(row.id))throw Error('Yedekte yinelenen kimlik var.');ids.add(row.id);}}
 for(const p of result.products){if(!p.name||['buy','buyCase','whole','retail','caseQty','stock','min'].some(k=>(k==='stock'&&p[k]===null?false:!Number.isFinite(p[k])||p[k]<0))||!Number.isInteger(p.caseQty)||p.caseQty<1||(p.stock!==null&&!Number.isInteger(p.stock))||!Number.isInteger(p.min))throw Error('Yedekte geçersiz ürün var.');}
 for(const s of result.sales){if(!result.products.some(p=>p.id===s.productId)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!['wholesale','retail'].includes(s.type)||['qty','units','price','total','cost','profit'].some(k=>!Number.isFinite(s[k]))||s.units<0)throw Error('Yedekte geçersiz satış var.');}
 for(const e of result.expenses){if(!Number.isFinite(e.amount)||e.amount<0||!/^\d{4}-\d{2}-\d{2}$/.test(e.date))throw Error('Yedekte geçersiz gider var.');}
 for(const p of result.products)p.saleCount=result.sales.filter(s=>s.productId===p.id).length;return result;
}
async function restore(){const file=$('restoreFile').files[0];if(!file){alert('JSON yedek dosyası seçin.');return;}return action(async()=>{const restored=validateBackup(JSON.parse(await file.text()));const operations=[];for(const k of ['products','sales','expenses']){const targetIds=new Set(restored[k].map(x=>x.id));for(const row of db[k])if(!targetIds.has(row.id))operations.push(['delete',k,row.id]);for(const row of restored[k])operations.push(['set',k,row.id,withoutId(row)]);}if(operations.length>450)throw Error('Yedek tek işlem sınırını aşıyor. Veriler değiştirilmedi.');if(!confirm('Mevcut veriler yedekle değiştirilecek. Güncel yedeğinizi aldıysanız devam edin.'))return;const batch=api.writeBatch(store);for(const [op,k,id,data] of operations)if(op==='delete')batch.delete(ref(k,id));else batch.set(ref(k,id),data);await batch.commit();status('Yedek geri yüklendi.');});}
async function deleteSelectedProducts(){
 const ids=[...selectedProductIds];
 if(!ids.length){alert('Önce ürün seçin.');return;}
 if(!confirm(`${ids.length} seçili ürün kalıcı olarak silinecek. Diğer ürünler korunacak. Devam edilsin mi?`))return;
 return action(async()=>{
  if(ids.length>400)throw Error('Tek işlemde en fazla 400 ürün silinebilir. Daha az ürün seçin.');
  const uid=currentUser.uid;
  const [salesSnap,productSnaps]=await Promise.all([
   api.getDocsFromServer(api.collection(store,'users',uid,'sales')),
   Promise.all(ids.map(id=>api.getDocFromServer(ref('products',safeId(id)))))
  ]);
  const linked=new Set(salesSnap.docs.map(d=>d.data().productId??d.data().product_id));
  for(let i=0;i<ids.length;i++){
   if(!productSnaps[i].exists())throw Error('Ürün listesi değişmiş. Sayfayı yenileyin.');
   if(linked.has(ids[i])||Number(productSnaps[i].data().saleCount||0)>0)throw Error('Seçilen ürünlerden birinin satış geçmişi var. Hiçbir ürün silinmedi.');
  }
  const batch=api.writeBatch(store);for(const id of ids)batch.delete(ref('products',id));
  await batch.commit();selectedProductIds.clear();updateSelectedProductsUI();
  alert(`${ids.length} seçili ürün silindi. Diğer ürünler korundu.`);
 });
}
let bulkPending=null;
async function loadExcelParser(){
 if(window.XLSX)return window.XLSX;
 if(!window._xlsxLoader){
  window._xlsxLoader=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
   script.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('Excel okuyucu yüklenemedi.'));
   script.onerror=()=>reject(Error('Excel okuyucu internetten yüklenemedi. Bağlantınızı kontrol edin.'));
   document.head.appendChild(script);
  }).catch(e=>{window._xlsxLoader=null;throw e;});
 }
 return window._xlsxLoader;
}
function parseMoneyCell(value,label,row){
 if(value===null||value===undefined||String(value).trim()==='')return 0;
 if(typeof value==='number')return value;
 let v=String(value).trim().replace(/\s/g,'').replace(/₺|TL|TRY/gi,'');
 if(v.includes(',')&&v.includes('.'))v=v.lastIndexOf(',')>v.lastIndexOf('.')?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,'');
 else if(v.includes(','))v=v.replace(',','.');
 const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error(`${row}. satır: ${label} geçersiz.`);return n;
}
function parseWholeCell(value,label,row,blank=null){
 if(value===null||value===undefined||String(value).trim()==='')return blank;
 const n=Number(value);if(!Number.isInteger(n)||n<0)throw Error(`${row}. satır: ${label} geçersiz.`);return n;
}
async function previewBulkImport(){
 bulkPending=null;$('bulkImportButton').disabled=true;$('bulkImportButton').textContent='Excel dosyası seçin';
 const f=$('bulkFile').files[0];if(!f){$('bulkPreview').textContent='Excel dosyası seçilmedi.';return;}
 $('bulkPreview').textContent='Excel dosyası okunuyor…';
 try{
  const XLSX=await loadExcelParser();
  const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw Error('Excel çalışma sayfası bulunamadı.');
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true,blankrows:false});
  const norm=v=>String(v??'').trim().toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]/g,'');
  const aliases={sku:['ürünkodu','stokkodu','sku','kod'],cat:['kategori','grup','sınıf'],name:['ürünadı','ürünismi','ürün','malzemeadı'],stock:['stok','stokadedi','stokmiktarı','miktar','adet'],buy:['alışfiyatı','alış','maliyet','alışbirimfiyatı'],retail:['satışfiyatı','satış','perakendefiyatı'],whole:['toptanfiyatı','toptan'],caseQty:['koliiçiadet','kolimiktarı','koliadedi'],note:['not','açıklama']};
  let headerIndex=-1,indices={};
  for(let i=0;i<Math.min(rows.length,15);i++){
   const cols=rows[i].map(norm);const ix={};
   for(const [key,names] of Object.entries(aliases))ix[key]=cols.findIndex(c=>names.includes(c));
   if(ix.name>=0&&ix.sku>=0){headerIndex=i;indices=ix;break;}
  }
  if(headerIndex<0)throw Error('Başlık satırında Ürün Kodu ve Ürün Adı bulunamadı. Excel başlıklarını kontrol edin.');
  const result=[],seen=new Set();const provided=Object.fromEntries(Object.keys(aliases).map(k=>[k,indices[k]>=0]));
  for(let i=headerIndex+1;i<rows.length;i++){
   const row=rows[i],get=key=>indices[key]<0?null:row[indices[key]],line=i+1;
   if(row.every(v=>v===null||String(v).trim()===''))continue;
   const name=String(get('name')??'').trim(),sku=String(get('sku')??'').trim();
   if(!name||!sku)throw Error(`${line}. satır: ürün adı veya stok kodu boş.`);
   if(seen.has(sku))throw Error(`${line}. satır: tekrarlanan stok kodu: ${sku}`);seen.add(sku);
   const stock=parseWholeCell(get('stock'),'Stok',line,null),caseQty=parseWholeCell(get('caseQty'),'Koli içi adet',line,1);
   if(caseQty<1)throw Error(`${line}. satır: koli içi adet en az 1 olmalı.`);
   const buy=parseMoneyCell(get('buy'),'Alış fiyatı',line),retail=parseMoneyCell(get('retail'),'Satış fiyatı',line),whole=indices.whole>=0?parseMoneyCell(get('whole'),'Toptan fiyatı',line):retail;
   result.push({name,sku,cat:String(get('cat')??'').trim(),note:String(get('note')??'').trim(),buy,buyCase:buy*caseQty,whole,retail,caseQty,stock,_provided:provided});
  }
  if(!result.length||result.length>400)throw Error('Excel dosyasında 1–400 arasında ürün olmalı.');
  bulkPending=result;
  const matched=result.filter(p=>db.products.some(e=>e.sku===p.sku)).length;$('bulkPreview').textContent=`${result.length} ürün okundu. ${matched} mevcut ürün güncellenecek, ${result.length-matched} yeni ürün eklenecek. ${result.filter(p=>p.stock===null).length} boş stok hücresi mevcut ürünlerin stoklarını değiştirmeyecek. İşlemden önce JSON yedeği alın.`;
  $('bulkImportButton').textContent='Excel değişikliklerini uygula';$('bulkImportButton').disabled=false;
 }catch(e){$('bulkPreview').textContent='Excel hatası: '+e.message;}
}
async function importProducts(){return action(async()=>{
 if(!bulkPending)throw Error('Önce Excel dosyasını seçin.');
 const uid=currentUser.uid;
 // Sunucudaki stok kodlarını yeniden oku: ekranın eski verisine güvenme.
 const snap=await api.getDocsFromServer(api.collection(store,'users',uid,'products'));
 const bySku=new Map();
 for(const d of snap.docs){const sku=String(d.data().sku??'').trim();if(!sku)continue;if(bySku.has(sku))throw Error('Veritabanında tekrarlanan stok kodu var: '+sku);bySku.set(sku,d);}
 const updates=bulkPending.filter(p=>bySku.has(p.sku)).length;
 const additions=bulkPending.length-updates;
 if(!confirm(`${updates} ürün güncellenecek, ${additions} yeni ürün eklenecek. Mevcut stok hücresi Excel'de boşsa stok değişmeyecek. Onaylıyor musunuz?`))return;
 if(bulkPending.length>400)throw Error('Tek işlem sınırı 400 ürün.');
 const batch=api.writeBatch(store);
 for(const p of bulkPending){
  const existing=bySku.get(p.sku),v=p._provided;
  if(existing){
   const patch={};
   if(v.name)patch.name=p.name;
   if(v.cat)patch.cat=p.cat;
   if(v.note)patch.note=p.note;
   if(v.buy){patch.buy=p.buy;patch.buyCase=p.buy*(v.caseQty?p.caseQty:Number(existing.data().caseQty??1));}
   if(v.retail)patch.retail=p.retail;
   if(v.whole)patch.whole=p.whole;
   if(v.caseQty){patch.caseQty=p.caseQty;if(!v.buy)patch.buyCase=Number(existing.data().buy??0)*p.caseQty;}
   if(v.stock&&p.stock!==null)patch.stock=p.stock;
   batch.update(existing.ref,patch);
  }else{
   const id=safeId('import_'+p.sku.replace(/[^A-Za-z0-9_-]/g,'_'));
   if(snap.docs.some(d=>d.id===id))throw Error('Ürün kimliği çakışması: '+id);
   batch.set(ref('products',id),{name:p.name,sku:p.sku,cat:p.cat,supplier:'',note:p.note,buy:p.buy,buyCase:p.buyCase,whole:p.whole,retail:p.retail,caseQty:p.caseQty,stock:p.stock,min:0,image:'',saleCount:0});
  }
 }
 await batch.commit();
 $('bulkPreview').textContent=`${updates} ürün güncellendi, ${additions} ürün eklendi.`;
 bulkPending=null;$('bulkFile').value='';$('bulkImportButton').disabled=true;
 $('bulkImportButton').textContent='Excel dosyası seçin';status('Excel senkronizasyonu tamamlandı.');
 });}
async function login(event){event.preventDefault();$('authMessage').textContent='Giriş yapılıyor…';try{await api.signInWithEmailAndPassword(auth,$('loginEmail').value.trim(),$('loginPassword').value);$('authMessage').textContent='';}catch(e){$('authMessage').textContent='Giriş başarısız: '+e.code;}}
async function loginGithub(){try{await api.signInWithPopup(auth,new api.GithubAuthProvider());}catch(e){$('authMessage').textContent='GitHub girişi başarısız: '+e.code;}}
async function resetPassword(){const email=$('loginEmail').value.trim();if(!email){$('authMessage').textContent='Önce e-posta adresinizi girin.';return;}try{await api.sendPasswordResetEmail(auth,email);$('authMessage').textContent='Şifre sıfırlama isteği alındı. E-postanızı kontrol edin.';}catch(e){$('authMessage').textContent='İşlem başarısız: '+e.code;}}
async function logout(){if(pending)return;await api.signOut(auth);}
Object.assign(window,{deleteSelectedProducts,updateBulkDeleteButton,deleteAllProducts,previewBulkImport,importProducts,saveProduct,deleteProduct,saveSale,deleteSale,saveExpense,deleteExpense,restore,login,loginGithub,resetPassword,logout});
async function start(){
 if(!firebaseConfig.apiKey||!firebaseConfig.projectId){$('setupBox').style.display='block';return;}
 try{
 const version='12.19.0',base=`https://www.gstatic.com/firebasejs/${version}/`,[app,authentication,firestore]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);api={...authentication,...firestore};const instance=app.initializeApp(firebaseConfig);auth=api.getAuth(instance);store=api.getFirestore(instance);$('loginBox').style.display='block';
 api.onAuthStateChanged(auth,user=>{subscriptions.forEach(fn=>fn());subscriptions=[];ready=false;loaded.clear();currentUser=user;db={products:[],sales:[],expenses:[]};renderAll();$('authScreen').style.display=user?'none':'grid';$('appShell').style.display=user?'block':'none';if(!user)return;$('userInfo').textContent=user.email||'Kullanıcı';status('Veriler yükleniyor…');const uid=user.uid;
 for(const [kind,normalize] of [['products',normalizeProduct],['sales',normalizeSale],['expenses',normalizeExpense]]){const col=api.collection(store,'users',uid,kind);subscriptions.push(api.onSnapshot(col,snapshot=>{if(currentUser?.uid!==uid)return;db[kind]=snapshot.docs.map(d=>normalize({...d.data(),id:d.id}));loaded.add(kind);ready=loaded.size===3;renderAll();updateBulkDeleteButton();if(ready)status(snapshot.metadata.hasPendingWrites?'Kaydediliyor…':snapshot.metadata.fromCache?'Önbellek verileri gösteriliyor.':'Bulut verileri güncel.');},e=>{ready=false;loaded.delete(kind);status('Veriler yüklenemedi: '+e.code);}));}
 });
 }catch(e){$('authMessage').textContent='Firebase yüklenemedi: '+e.message;}
}
start();
