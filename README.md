# Stok & Satış Yönetimi (Firebase + GitHub)

Tarayıcıda çalışan HTML/CSS/JS uygulaması. Giriş: **e-posta + şifre**, **şifremi unuttum** ve **GitHub ile giriş** (Firebase Authentication). Veri: **Firestore** (hesaba özel, gerçek zamanlı; telefon ve bilgisayar aynı anda güncel kalır, internet kesilirse yerel önbellekle çalışır ve bağlantı gelince eşitler). Kod: GitHub deposu.

## Dosyalar
- `index.html`, `css/style.css`, `js/app.js` — uygulama
- `js/firebase-config.js` — **sizin dolduracağınız** Firebase bağlantı bilgileri
- `firestore.rules` — veri güvenlik kuralları (her kullanıcı yalnızca kendi verisine erişir)
- `firebase.json` — Firebase Hosting ayarı
- `.github/workflows/firebase-hosting.yml` — GitHub'a push edince otomatik yayın (isteğe bağlı)

## 1) Firebase kurulumu (bir kez)
1. https://console.firebase.google.com → **Proje ekle** (ücretsiz Spark planı yeterlidir).
2. Proje ana ekranında **Web (</>)** simgesiyle bir web uygulaması ekleyin. Gösterilen `firebaseConfig` değerlerini `js/firebase-config.js` içine yapıştırın.
3. **Authentication → Sign-in method**: **E-posta/Şifre** ve **GitHub** sağlayıcılarını etkinleştirin.
4. **GitHub girişi için:** GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**.
   - Homepage URL: yayın adresiniz (örn. `https://PROJE_ID.web.app`)
   - Authorization callback URL: Firebase'deki GitHub sağlayıcı ekranında gösterilen adres (genelde `https://PROJE_ID.firebaseapp.com/__/auth/handler`)
   - Oluşan **Client ID** ve **Client secret** değerlerini **sadece Firebase konsoluna** yapıştırın. Koda/depoya asla yazmayın.
5. **Authentication → Users → Add user**: kendi e-posta ve şifrenizle bir kullanıcı oluşturun. (Uygulamada kayıt sayfası yoktur.)
6. **Firestore Database → Create database** (production mode). **Rules** sekmesine `firestore.rules` dosyasının içeriğini yapıştırıp **Publish** edin.
7. **Authentication → Settings → Authorized domains**: yayın alan adınızın listede olduğundan emin olun (Firebase Hosting alan adları otomatik eklenir; Cloudflare gibi başka bir yer kullanırsanız elle ekleyin).

## 2) Yayınlama
**A) Firebase Hosting (önerilen, en az sorun çıkaran):**
```
npm install -g firebase-tools
firebase login
firebase deploy --project PROJE_ID
```
`firebase.json` hazır olduğu için `firebase init` gerekmez. Kuralları ayrıca yayınlamak isterseniz: `firebase deploy --only firestore:rules --project PROJE_ID`.

**B) GitHub'dan otomatik yayın:** Kodu GitHub deposuna yükleyin, depo klasöründe `firebase init hosting:github` komutunu çalıştırın (gerekli servis hesabını ve `FIREBASE_SERVICE_ACCOUNT` secret'ını kendisi oluşturur). `.github/workflows/firebase-hosting.yml` içindeki `PROJE_ID` değerini kendi proje kimliğinizle değiştirin. Otomatik yayın istemiyorsanız `.github` klasörünü silin; aksi halde secret yokken her push'ta başarısız bir iş görünür.

**C) Cloudflare Pages:** GitHub deposunu bağlayın; Framework: None, Build command: boş, Output directory: `/`. Alan adını Firebase Authorized domains listesine ekleyin. (GitHub Pages ticari uygulama barındırmak için uygun değildir.)

Depo herkese açık olursa kaynak kod ve `firebaseConfig` görünür. Bu değerler gizli değildir; veriyi koruyan `firestore.rules` kurallarıdır. Servis hesabı anahtarını (JSON) veya GitHub Client secret'ını depoya **koymayın**.

## 3) Güvenlik önerisi
GitHub girişi açıkken herhangi bir GitHub kullanıcısı kendine boş bir hesap oluşturabilir (sizin verinizi göremez; kurallar buna izin vermez). İsterseniz hem e-posta/şifre hem GitHub ile giriş yapıp çalıştığını gördükten sonra **Authentication → Settings → User actions** altından yeni kullanıcı kaydını kapatın.

Aynı e-postayla hem şifreyle hem GitHub'la giriş yaparsanız ikisi tek hesapta birleşir. Uygulama GitHub girişinde "bu e-posta zaten kayıtlı" derse önce şifrenizle girin; GitHub kimliği otomatik bağlanır.

## 4) Eski veriyi taşıma
- Eski (Supabase) sürümde **Yedek Al** ile JSON indirin, bu sürümde **Yedekleme → Yedeği Yükle** deyin.
- Aynı tarayıcıda eski yerel veri varsa, ilk girişte ve bulut boşsa aktarma önerilir.

## 5) Veri yapısı ve sınırlar
Veri `users/{uid}/products|sales|expenses` altında kayıt kayıt tutulur (tek büyük belge değil). Satış ve iptal işlemlerinde stok `increment` ile güncellenir; iki cihazdan aynı anda işlem yapılsa da diğerinin değişikliği ezilmez.
- Ürün formundan elle girilen stok, o ürünün stokunu doğrudan **üzerine yazar**.
- Yedeği geri yüklemek buluttaki mevcut tüm veriyi yedekle **değiştirir**; önce güncel yedek alın.
- Ücretsiz Firebase kotaları ve koşulları değişebilir; düzenli JSON yedeği alın.
- Kullanılan Firebase JS sürümü `js/app.js` başındaki `FB_VERSION` ile sabittir.
