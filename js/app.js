import { firebaseConfig } from './firebase-config.js';

const FB_VERSION = '10.14.1';
const CDN = 'https://www.gstatic.com/firebasejs/' + FB_VERSION;
const KEY = 'stok_satis_app_v1'; // eski sürümlerin yerel verisi (yalnızca içe aktarma için okunur)
const COLLECTIONS = ['products', 'sales', 'expenses'];

let db = { products: [], sales: [], expenses: [] };
let APP, AUTH, FS, auth, fs, currentUser = null;
let unsubs = [], listenerState = {}, syncError = '', pendingCred = null, pendingEmail = '';

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);
const num = n => new Intl.NumberFormat('tr-TR').format(Number(n) || 0);
const p2 = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); // yerel tarih (UTC kayması yok)
const today = () => ymd(new Date());
const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const product = id => db.products.find(x => x.id === id);
const stockText = p => { const q = Math.max(0, Number(p.stock) || 0), c = Number(p.caseQty) || 1; return `${Math.floor(q / c)} koli + ${q % c} adet (${q} adet)`; };

/* ---------- Veri doğrulama / normalleştirme ---------- */
const N = (v, d = 0) => { v = Number(v); return Number.isFinite(v) ? v : d; };
const S = v => (v == null ? '' : String(v));
const idOk = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
const dateOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
function normProduct(x) {
  if (!x || !idOk(x.id)) return null;
  return { id: x.id, name: S(x.name), sku: S(x.sku), cat: S(x.cat), supplier: S(x.supplier), buy: N(x.buy), buyCase: N(x.buyCase), whole: N(x.whole), retail: N(x.retail), caseQty: Math.max(1, N(x.caseQty, 1)), stock: N(x.stock), min: N(x.min), note: S(x.note) };
}
function normSale(x) {
  if (!x || !idOk(x.id) || !dateOk(x.date)) return null;
  const type = x.type === 'wholesale' ? 'wholesale' : x.type === 'retail' ? 'retail' : null;
  if (!type) return null;
  return { id: x.id, date: x.date, productId: S(x.productId), type, unit: x.unit === 'case' ? 'case' : 'unit', qty: N(x.qty), units: N(x.units), price: N(x.price), total: N(x.total), cost: N(x.cost), profit: N(x.profit), note: S(x.note) };
}
function normExpense(x) {
  if (!x || !idOk(x.id) || !dateOk(x.date)) return null;
  return { id: x.id, date: x.date, cat: S(x.cat), amount: N(x.amount), note: S(x.note) };
}
const NORM = { products: normProduct, sales: normSale, expenses: normExpense };

/* ---------- Mesajlar ---------- */
function authMsg(s, good = false) { const el = $('authMessage'); if (el) { el.style.color = good ? '#087f5b' : '#b42318'; el.textContent = s; } }
function setSync(s, kind) { const st = $('syncStatus'); if (st) { st.textContent = s; st.style.color = kind === 'ok' ? '#bbf7d0' : kind === 'err' ? '#fecaca' : '#dbeafe'; } }
function authError(err) {
  const m = {
    'auth/invalid-credential': 'E-posta veya şifre hatalı.', 'auth/wrong-password': 'E-posta veya şifre hatalı.', 'auth/user-not-found': 'E-posta veya şifre hatalı.', 'auth/invalid-login-credentials': 'E-posta veya şifre hatalı.',
    'auth/invalid-email': 'Geçersiz e-posta adresi.', 'auth/missing-password': 'Şifre girin.', 'auth/user-disabled': 'Bu hesap devre dışı bırakılmış.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin ya da şifrenizi sıfırlayın.',
    'auth/network-request-failed': 'İnternet bağlantısı yok ya da Firebase\'e ulaşılamıyor.',
    'auth/operation-not-allowed': 'Bu giriş yöntemi Firebase konsolunda etkin değil (Authentication > Sign-in method).',
    'auth/unauthorized-domain': 'Bu alan adı Firebase\'de yetkili değil (Authentication > Settings > Authorized domains bölümüne ekleyin).',
    'auth/popup-closed-by-user': 'Giriş penceresi kapatıldı.', 'auth/cancelled-popup-request': 'Giriş penceresi kapatıldı.',
    'auth/invalid-api-key': 'Firebase API anahtarı geçersiz. js/firebase-config.js dosyasını kontrol edin.',
    'auth/web-storage-unsupported': 'Tarayıcı çerez/depolama izni kapalı; giriş için açın.'
  };
  return m[err && err.code] || ('Giriş yapılamadı: ' + ((err && (err.code || err.message)) || 'bilinmeyen hata'));
}
function dbError(err) {
  const c = err && err.code;
  if (c === 'permission-denied') return 'Yetki reddedildi (firestore.rules yayınlanmamış olabilir).';
  if (c === 'unavailable') return 'Sunucuya ulaşılamıyor.';
  if (c === 'failed-precondition' || c === 'not-found') return 'Kayıt bulunamadı ya da başka cihazda silindi.';
  return (c || (err && err.message) || 'bilinmeyen hata');
}

/* ---------- Eşitleme durumu ---------- */
function refreshSyncStatus() {
  if (syncError) { setSync(syncError, 'err'); return; }
  const st = Object.values(listenerState);
  if (st.length < COLLECTIONS.length) { setSync('Bulutla bağlantı kuruluyor…', 'info'); return; }
  if (st.some(x => x.pending)) { setSync(navigator.onLine ? 'Kaydediliyor…' : 'Çevrimdışı — bağlantı gelince kaydedilecek.', 'info'); return; }
  if (st.some(x => x.cache)) { setSync(navigator.onLine ? 'Bulutla eşitleniyor…' : 'Çevrimdışı — son kaydedilen veri gösteriliyor.', 'info'); return; }
  setSync('Buluta kaydedildi.', 'ok');
}
function track(promise) {
  syncError = '';
  setSync('Kaydediliyor…', 'info');
  return Promise.resolve(promise).then(() => { refreshSyncStatus(); }, e => {
    syncError = 'Buluta kaydedilemedi: ' + dbError(e) + ' — yedek almayı deneyin.';
    refreshSyncStatus();
  });
}

/* ---------- Firebase başlatma ---------- */
function configReady() {
  const c = firebaseConfig || {};
  return ['apiKey', 'projectId', 'appId'].every(k => c[k] && !/^BURAYA_|^PROJE_ID$/.test(String(c[k])));
}
function showAuthScreen(which) {
  $('authScreen').style.display = 'flex'; $('appShell').style.display = 'none';
  $('setupBox').style.display = which === 'setup' ? 'block' : 'none';
  $('loginBox').style.display = which === 'login' ? 'block' : 'none';
}
async function init() {
  showAuthScreen('none');
  if (!configReady()) { showAuthScreen('setup'); return; }
  authMsg('Yükleniyor…', true);
  try {
    [APP, AUTH, FS] = await Promise.all([import(CDN + '/firebase-app.js'), import(CDN + '/firebase-auth.js'), import(CDN + '/firebase-firestore.js')]);
  } catch (e) {
    authMsg('Firebase kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
    return;
  }
  try {
    const app = APP.initializeApp(firebaseConfig);
    auth = AUTH.getAuth(app);
    auth.languageCode = 'tr';
    try {
      fs = FS.initializeFirestore(app, { localCache: FS.persistentLocalCache({ tabManager: FS.persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
    } catch (e) {
      fs = FS.getFirestore(app); // çevrimdışı önbellek desteklenmiyorsa normal moda düş
    }
  } catch (e) {
    authMsg('Firebase başlatılamadı: ' + ((e && e.message) || e)); return;
  }
  AUTH.getRedirectResult(auth).catch(handleGithubError);
  AUTH.onAuthStateChanged(auth, user => { onUser(user).catch(e => authMsg('Beklenmeyen hata: ' + ((e && e.message) || e))); });
  window.addEventListener('online', refreshSyncStatus);
  window.addEventListener('offline', refreshSyncStatus);
}

/* ---------- Giriş / çıkış ---------- */
function setBusy(b) { ['loginBtn', 'githubBtn'].forEach(id => { const el = $(id); if (el) el.disabled = b; }); }
async function login(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!auth) return;
  const email = $('loginEmail').value.trim(), password = $('loginPassword').value;
  if (!email || !password) { authMsg('E-posta ve şifre girin.'); return; }
  authMsg('Giriş yapılıyor…', true); setBusy(true);
  try { await AUTH.signInWithEmailAndPassword(auth, email, password); $('loginPassword').value = ''; }
  catch (err) { authMsg(authError(err)); }
  finally { setBusy(false); }
}
function handleGithubError(err) {
  if (!err) return false;
  if (err.code === 'auth/account-exists-with-different-credential') {
    pendingCred = AUTH.GithubAuthProvider.credentialFromError(err);
    pendingEmail = (err.customData && err.customData.email) || '';
    if (pendingEmail) $('loginEmail').value = pendingEmail;
    authMsg('Bu e-posta ile daha önce e-posta/şifre hesabı açılmış. Önce o e-posta ve şifrenizle giriş yapın; GitHub hesabınız otomatik olarak aynı hesaba bağlanacak.');
    return true;
  }
  authMsg(authError(err));
  return true;
}
async function loginGithub() {
  if (!auth) return;
  authMsg('GitHub ile giriş yapılıyor…', true); setBusy(true);
  const provider = new AUTH.GithubAuthProvider();
  provider.addScope('user:email');
  try { await AUTH.signInWithPopup(auth, provider); }
  catch (err) {
    if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
      try { await AUTH.signInWithRedirect(auth, provider); return; } catch (e2) { handleGithubError(e2); }
    } else handleGithubError(err);
  } finally { setBusy(false); }
}
async function resetPassword() {
  if (!auth) return;
  const email = $('loginEmail').value.trim();
  if (!email) { authMsg('Önce e-posta adresinizi yazın, sonra "Şifremi unuttum"a basın.'); return; }
  try {
    await AUTH.sendPasswordResetEmail(auth, email);
    authMsg('Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutusunu ve spam klasörünü kontrol edin.', true);
  } catch (err) { authMsg(authError(err)); }
}
async function logout() {
  if (!auth) return;
  await AUTH.signOut(auth);
  authMsg('Çıkış yapıldı.', true);
}
async function onUser(user) {
  if (!user) { leaveApp(); showAuthScreen('login'); return; }
  if (currentUser && currentUser.uid === user.uid) return;
  if (pendingCred && pendingEmail && user.email && user.email.toLowerCase() === pendingEmail.toLowerCase()) {
    try { await AUTH.linkWithCredential(user, pendingCred); } catch (e) { /* bağlama olmadı; e-posta/şifre ile devam */ }
  }
  pendingCred = null; pendingEmail = '';
  enterApp(user);
}

/* ---------- Uygulamaya giriş + gerçek zamanlı veri ---------- */
const col = name => FS.collection(fs, 'users', currentUser.uid, name);
const ref = (name, id) => FS.doc(fs, 'users', currentUser.uid, name, id);

function leaveApp() {
  unsubs.forEach(u => { try { u(); } catch (e) { } }); unsubs = [];
  listenerState = {}; syncError = ''; currentUser = null;
  db = { products: [], sales: [], expenses: [] };
  ['productForm', 'expenseForm'].forEach(id => { if ($(id)) $(id).style.display = 'none'; });
  if ($('loginPassword')) $('loginPassword').value = '';
}
function enterApp(user) {
  currentUser = user;
  $('authScreen').style.display = 'none'; $('appShell').style.display = 'block';
  $('userInfo').textContent = user.email || user.displayName || '';
  authMsg('');
  listenerState = {}; syncError = '';
  refreshSyncStatus();
  let firstRender = false;
  COLLECTIONS.forEach(name => {
    const un = FS.onSnapshot(col(name), { includeMetadataChanges: true }, snap => {
      const first = !listenerState[name];
      listenerState[name] = { pending: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache };
      if (first || snap.docChanges().length) {
        db[name] = snap.docs.map(d => NORM[name]({ ...d.data(), id: d.id })).filter(Boolean);
        if (Object.keys(listenerState).length === COLLECTIONS.length) {
          renderAll();
          if (!firstRender) { firstRender = true; maybeImportLegacy(user); }
        }
      }
      refreshSyncStatus();
    }, err => {
      syncError = 'Veriler alınamadı: ' + dbError(err);
      refreshSyncStatus();
    });
    unsubs.push(un);
  });
}

/* ---------- Eski yerel veriyi bir kez buluta aktarma ---------- */
function legacyLocal() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!x) return null;
    const out = {};
    COLLECTIONS.forEach(n => { out[n] = (Array.isArray(x[n]) ? x[n] : []).map(NORM[n]).filter(Boolean); });
    return out.products.length || out.sales.length || out.expenses.length ? out : null;
  } catch (e) { return null; }
}
async function maybeImportLegacy(user) {
  const flag = KEY + '_imported_' + user.uid;
  try {
    if (localStorage.getItem(flag)) return;
    const local = legacyLocal();
    if (!local) return;
    const checks = await Promise.all(COLLECTIONS.map(n => FS.getDocsFromServer(FS.query(col(n), FS.limit(1)))));
    if (checks.some(c => !c.empty)) { localStorage.setItem(flag, '1'); return; } // bulutta zaten veri var
    if (!currentUser || currentUser.uid !== user.uid) return;
    const ok = confirm('Bu cihazda eski yerel kayıtlar bulundu (' + local.products.length + ' ürün, ' + local.sales.length + ' satış, ' + local.expenses.length + ' gider). Bunları bu hesabın bulut verisine aktarmak ister misiniz?');
    localStorage.setItem(flag, '1');
    if (ok) await track(replaceAll(local));
  } catch (e) { /* çevrimdışı olabilir; bir sonraki girişte tekrar denenir */ }
}

/* ---------- Yazma işlemleri ---------- */
async function replaceAll(data) {
  const ops = [];
  COLLECTIONS.forEach(name => {
    const keep = new Set(data[name].map(x => x.id));
    db[name].forEach(x => { if (!keep.has(x.id)) ops.push(b => b.delete(ref(name, x.id))); });
    data[name].forEach(x => ops.push(b => b.set(ref(name, x.id), x)));
  });
  for (let i = 0; i < ops.length; i += 400) {
    const batch = FS.writeBatch(fs);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

/* ---------- Sekmeler ---------- */
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#nav button').forEach(x => x.classList.remove('active')); b.classList.add('active');
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); $(b.dataset.tab).classList.add('active');
  if (b.dataset.tab === 'reports') renderReport();
});

/* ---------- Ürünler ---------- */
function newProduct() { ['pName', 'pSku', 'pCat', 'pSupplier', 'pBuy', 'pBuyCase', 'pWhole', 'pRetail', 'pCaseQty', 'pStock', 'pMin', 'pNote'].forEach(id => $(id).value = ''); $('pCaseQty').value = 1; $('pStock').value = 0; $('pMin').value = 0; $('pId').value = ''; $('productForm').style.display = 'block'; scrollTo(0, 0); }
function cancelProduct() { $('productForm').style.display = 'none'; }
function saveProduct() {
  if (!currentUser) return;
  const id = $('pId').value || uid();
  const p = { id, name: $('pName').value.trim(), sku: $('pSku').value.trim(), cat: $('pCat').value.trim(), supplier: $('pSupplier').value.trim(), buy: +$('pBuy').value || 0, buyCase: +$('pBuyCase').value || 0, whole: +$('pWhole').value || 0, retail: +$('pRetail').value || 0, caseQty: Math.max(1, +$('pCaseQty').value || 1), stock: Math.max(0, +$('pStock').value || 0), min: Math.max(0, +$('pMin').value || 0), note: $('pNote').value.trim() };
  if (!p.name) { alert('Ürün adı zorunlu.'); return; }
  if (!p.buyCase) p.buyCase = round2(p.buy * p.caseQty);
  $('productForm').style.display = 'none';
  track(FS.setDoc(ref('products', id), p));
}
function editProduct(id) {
  const p = product(id); if (!p) return;
  $('pId').value = p.id; $('pName').value = p.name; $('pSku').value = p.sku; $('pCat').value = p.cat; $('pSupplier').value = p.supplier; $('pBuy').value = p.buy; $('pBuyCase').value = p.buyCase; $('pWhole').value = p.whole; $('pRetail').value = p.retail; $('pCaseQty').value = p.caseQty; $('pStock').value = p.stock; $('pMin').value = p.min; $('pNote').value = p.note || '';
  $('productForm').style.display = 'block'; scrollTo(0, 0);
}
function deleteProduct(id) {
  if (db.sales.some(s => s.productId === id)) { alert('Bu ürünün satış kayıtları var; silmek yerine düzenleyin.'); return; }
  if (confirm('Ürün silinsin mi?')) track(FS.deleteDoc(ref('products', id)));
}
function renderProducts() {
  const q = ($('productSearch').value || '').toLowerCase();
  const rows = db.products.filter(p => (p.name + ' ' + p.sku + ' ' + p.cat).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  $('productRows').innerHTML = rows.length ? rows.map(p => `<tr>
 <td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.cat || '')}</span></td><td>${esc(p.sku || '')}</td>
 <td>${money(p.buy)}</td><td>${money(p.buyCase)}</td><td>${money(p.whole)}</td><td>${money(p.retail)}</td><td>${num(p.caseQty)} adet</td>
 <td class="${p.stock <= p.min ? 'danger' : ''}">${stockText(p)}</td><td>${money(p.stock * p.buy)}</td>
 <td class="actions"><button onclick="editProduct('${p.id}')">Düzenle</button><button class="danger" onclick="deleteProduct('${p.id}')">Sil</button></td></tr>`).join('') : `<tr><td colspan="10" class="empty">Henüz ürün yok.</td></tr>`;
}
function fillProducts() {
  const cur = $('sProduct').value;
  $('sProduct').innerHTML = '<option value="">Ürün seçin</option>' + db.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(p => `<option value="${p.id}">${esc(p.name)} — stok: ${p.stock}</option>`).join('');
  if (cur && product(cur)) $('sProduct').value = cur;
  refreshSaleInfo();
}
function refreshSaleInfo() {
  const p = product($('sProduct').value);
  $('saleInfo').textContent = p ? `Mevcut stok: ${stockText(p)} | Koli içi: ${p.caseQty} adet | Alış maliyeti/adet: ${money(p.buy)}` : '';
}
function syncSalePrice() {
  const p = product($('sProduct').value);
  if (!p) { $('sPrice').value = ''; $('saleInfo').textContent = ''; return; }
  const type = $('sType').value, unit = $('sUnit').value, price = type === 'wholesale' ? p.whole : p.retail;
  $('sPrice').value = unit === 'case' ? round2(price * (p.caseQty || 1)) : price;
  refreshSaleInfo();
}

/* ---------- Satışlar ---------- */
function saveSale() {
  if (!currentUser) return;
  const p = product($('sProduct').value), qty = +$('sQty').value || 0, unit = $('sUnit').value, price = +$('sPrice').value || 0;
  if (!p || qty <= 0) { alert('Ürün ve miktar girin.'); return; }
  if (!Number.isInteger(qty)) { alert('Miktar tam sayı olmalı.'); return; }
  const units = unit === 'case' ? qty * p.caseQty : qty;
  if (units > p.stock) { alert('Yetersiz stok. Mevcut: ' + p.stock + ' adet.'); return; }
  const total = round2(qty * price), cost = round2(units * p.buy);
  const sale = { id: uid(), date: $('sDate').value || today(), productId: p.id, type: $('sType').value, unit, qty, units, price, total, cost, profit: round2(total - cost), note: $('sNote').value.trim() };
  const batch = FS.writeBatch(fs);
  batch.set(ref('sales', sale.id), sale);
  batch.update(ref('products', p.id), { stock: FS.increment(-units) });
  $('sQty').value = 1; $('sNote').value = '';
  track(batch.commit());
  alert('Satış kaydedildi.');
}
function renderSales() {
  const f = $('sf').value, t = $('st').value, type = $('stypeFilter').value;
  const a = db.sales.filter(s => (!f || s.date >= f) && (!t || s.date <= t) && (!type || s.type === type)).sort((a, b) => b.date.localeCompare(a.date));
  $('salesRows').innerHTML = a.length ? a.map(s => { const p = product(s.productId); return `<tr><td>${esc(s.date)}</td><td>${esc(p?.name || 'Silinmiş ürün')}</td><td><span class="badge ${s.type}">${s.type === 'wholesale' ? 'Toptan' : 'Perakende'}</span></td><td>${num(s.qty)} ${s.unit === 'case' ? 'koli' : 'adet'} / ${num(s.units)} adet</td><td>${money(s.price)}</td><td>${money(s.total)}</td><td>${money(s.cost)}</td><td class="ok">${money(s.profit)}</td><td><button class="danger" onclick="deleteSale('${s.id}')">Sil</button></td></tr>`; }).join('') : `<tr><td colspan="9" class="empty">Kayıt yok.</td></tr>`;
}
function deleteSale(id) {
  const s = db.sales.find(x => x.id === id); if (!s) return;
  if (!confirm('Satış silinsin ve stok geri eklensin mi?')) return;
  const batch = FS.writeBatch(fs);
  batch.delete(ref('sales', id));
  if (product(s.productId)) batch.update(ref('products', s.productId), { stock: FS.increment(s.units) });
  track(batch.commit());
}

/* ---------- Giderler ---------- */
function newExpense() { $('eDate').value = today(); $('eCat').value = ''; $('eAmount').value = ''; $('eNote').value = ''; $('expenseForm').style.display = 'block'; }
function cancelExpense() { $('expenseForm').style.display = 'none'; }
function saveExpense() {
  if (!currentUser) return;
  const amount = +$('eAmount').value || 0;
  if (amount <= 0) { alert('Tutar girin.'); return; }
  const e = { id: uid(), date: $('eDate').value || today(), cat: $('eCat').value.trim(), amount, note: $('eNote').value.trim() };
  $('expenseForm').style.display = 'none';
  track(FS.setDoc(ref('expenses', e.id), e));
}
function renderExpenses() { $('expenseRows').innerHTML = db.expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.cat || 'Diğer')}</td><td>${esc(e.note || '')}</td><td class="num">${money(e.amount)}</td><td><button class="danger" onclick="deleteExpense('${e.id}')">Sil</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty">Gider yok.</td></tr>`; }
function deleteExpense(id) { if (confirm('Gider silinsin mi?')) track(FS.deleteDoc(ref('expenses', id))); }

/* ---------- Raporlar ---------- */
function setPeriod(type) {
  const d = new Date(); let f = '', t = today();
  if (type === 'today') f = t;
  if (type === 'week') { const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); f = ymd(d); }
  if (type === 'month') f = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  if (type === 'all') { f = ''; t = ''; }
  $('rf').value = f; $('rt').value = t; renderReport();
}
function reportData() {
  const f = $('rf').value, t = $('rt').value;
  return { sales: db.sales.filter(s => (!f || s.date >= f) && (!t || s.date <= t)), expenses: db.expenses.filter(e => (!f || e.date >= f) && (!t || e.date <= t)) };
}
function renderReport() {
  const { sales, expenses } = reportData(), sum = (a, k) => a.reduce((x, s) => x + s[k], 0);
  const whs = sales.filter(s => s.type === 'wholesale'), res = sales.filter(s => s.type === 'retail');
  const total = sum(sales, 'total'), wh = sum(whs, 'total'), re = sum(res, 'total'), profit = sum(sales, 'profit'), exp = sum(expenses, 'amount');
  $('rSales').textContent = money(total); $('rWholesale').textContent = money(wh); $('rRetail').textContent = money(re); $('rProfit').textContent = money(profit); $('rExpense').textContent = money(exp);
  $('profitSummary').innerHTML = `<table><tr><td>Toptan satış</td><td class="num">${money(wh)}</td></tr><tr><td>Toptan brüt kâr</td><td class="num">${money(sum(whs, 'profit'))}</td></tr><tr><td>Perakende satış</td><td class="num">${money(re)}</td></tr><tr><td>Perakende brüt kâr</td><td class="num">${money(sum(res, 'profit'))}</td></tr></table>`;
  $('periodSummary').innerHTML = `<table><tr><td>Satış maliyeti</td><td class="num">${money(sum(sales, 'cost'))}</td></tr><tr><td>Brüt kâr</td><td class="num">${money(profit)}</td></tr><tr><td>Gider</td><td class="num">${money(exp)}</td></tr><tr><td><b>Net sonuç</b></td><td class="num"><b>${money(profit - exp)}</b></td></tr></table>`;
  $('reportRows').innerHTML = sales.slice().sort((a, b) => b.date.localeCompare(a.date)).map(s => { const p = product(s.productId); return `<tr><td>${esc(s.date)}</td><td>${esc(p?.name || 'Silinmiş')}</td><td>${s.type === 'wholesale' ? 'Toptan' : 'Perakende'}</td><td>${num(s.units)} adet</td><td>${money(s.total)}</td><td>${money(s.cost)}</td><td>${money(s.profit)}</td></tr>`; }).join('') || `<tr><td colspan="7" class="empty">Seçilen dönemde satış yok.</td></tr>`;
}
function printReport() { document.querySelectorAll('.tab').forEach(x => x.classList.remove('printable')); $('reports').classList.add('printable'); window.print(); setTimeout(() => $('reports').classList.remove('printable'), 500); }
function csvCell(v) {
  // Türkçe Excel: ondalık ayracı virgül; formül enjeksiyonuna karşı =,+,-,@ ile başlayan metinlere ' eklenir
  let s = typeof v === 'number' ? String(v).replace('.', ',') : S(v);
  if (typeof v !== 'number' && /^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
function exportExcel() {
  const { sales, expenses } = reportData();
  const rows = [['STOK VE SATIŞ RAPORU'], [], ['Satışlar'], ['Tarih', 'Ürün', 'Tür', 'Miktar (adet)', 'Birim Fiyat', 'Satış', 'Maliyet', 'Brüt Kâr']];
  sales.forEach(s => rows.push([s.date, product(s.productId)?.name || '', s.type === 'wholesale' ? 'Toptan' : 'Perakende', s.units, s.price, s.total, s.cost, s.profit]));
  rows.push([], ['Giderler'], ['Tarih', 'Tür', 'Açıklama', 'Tutar']); expenses.forEach(e => rows.push([e.date, e.cat, e.note, e.amount]));
  rows.push([], ['Ürün Stokları'], ['Ürün', 'Stok Kodu', 'Alış/Adet', 'Alış/Koli', 'Toptan/Adet', 'Perakende/Adet', 'Koli İçi Adet', 'Stok Adet', 'Stok Maliyeti']);
  db.products.forEach(p => rows.push([p.name, p.sku, p.buy, p.buyCase, p.whole, p.retail, p.caseQty, p.stock, round2(p.stock * p.buy)]));
  const csv = '\ufeff' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'stok-satis-raporu-' + today() + '.csv');
}

/* ---------- Yedek ---------- */
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function backup() { download(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), 'stok-satis-yedek-' + today() + '.json'); }
function restore() {
  if (!currentUser) return;
  const file = $('restoreFile').files[0];
  if (!file) { alert('JSON yedek dosyası seçin.'); return; }
  const r = new FileReader();
  r.onload = () => {
    let data;
    try {
      const x = JSON.parse(r.result);
      data = {};
      for (const n of COLLECTIONS) {
        if (!Array.isArray(x[n])) throw Error('Eksik bölüm: ' + n);
        const list = x[n].map(NORM[n]);
        if (list.some(v => !v)) throw Error('Geçersiz kayıt var (' + n + ')');
        if (new Set(list.map(v => v.id)).size !== list.length) throw Error('Tekrarlanan kayıt kimliği (' + n + ')');
        data[n] = list;
      }
    } catch (e) { alert('Geçersiz yedek dosyası. ' + (e.message || '')); return; }
    if (confirm('Buluttaki mevcut veriler yedeğin içeriğiyle DEĞİŞTİRİLECEK (' + data.products.length + ' ürün, ' + data.sales.length + ' satış, ' + data.expenses.length + ' gider). Devam edilsin mi?')) {
      track(replaceAll(data)); alert('Yedek yükleme işlemi başlatıldı. Durumu ekranın üstünden izleyin.');
      $('restoreFile').value = '';
    }
  };
  r.readAsText(file);
}

/* ---------- Özet ---------- */
function renderDashboard() {
  const stock = db.products.reduce((a, p) => a + p.stock, 0), cost = db.products.reduce((a, p) => a + p.stock * p.buy, 0), sales = db.sales.reduce((a, s) => a + s.total, 0), profit = db.sales.reduce((a, s) => a + s.profit, 0);
  $('kStock').textContent = num(stock); $('kCost').textContent = money(cost); $('kSales').textContent = money(sales); $('kProfit').textContent = money(profit);
  const ss = db.sales.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  $('dashSales').innerHTML = ss.length ? ss.map(s => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${esc(s.date)} — ${esc(product(s.productId)?.name || '')} <b style="float:right">${money(s.total)}</b></div>`).join('') : '<div class="empty">Satış yok.</div>';
  const low = db.products.filter(p => p.stock <= p.min);
  $('dashStock').innerHTML = low.length ? low.map(p => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${esc(p.name)} <b style="float:right">${stockText(p)}</b></div>`).join('') : '<div class="empty">Kritik stok yok.</div>';
}
function dataInfo() { $('dataInfo').innerHTML = `Ürün: <b>${db.products.length}</b> | Satış: <b>${db.sales.length}</b> | Gider: <b>${db.expenses.length}</b><br><span class="muted">Veriler Firebase Firestore'da, ${esc(currentUser?.email || 'hesabınıza')} adına saklanıyor.</span>`; }
function renderAll() { renderProducts(); fillProducts(); renderSales(); renderExpenses(); renderReport(); renderDashboard(); dataInfo(); }

/* ---------- Başlangıç ---------- */
$('sDate').value = today();
$('sf').value = ymd(new Date(Date.now() - 30 * 86400000)); $('st').value = today();
$('rf').value = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); $('rt').value = today();

// HTML içindeki onclick/onchange işleyicileri için (modül kapsamı global değildir)
Object.assign(window, { login, loginGithub, resetPassword, logout, backup, restore, newProduct, saveProduct, cancelProduct, editProduct, deleteProduct, renderProducts, syncSalePrice, saveSale, renderSales, deleteSale, newExpense, saveExpense, cancelExpense, deleteExpense, setPeriod, renderReport, printReport, exportExcel });

init();
