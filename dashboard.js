/* ============================================================
   لوحة تحكم أيوب إعزة — تتصل مباشرة بـ GitHub عبر Git Gateway
   (نفس الآلية اللي تستخدمها Decap CMS، بدون واجهتها الافتراضية)
   ============================================================ */

// ⚠️ عدّل هذين السطرين إذا كان اسم حسابك أو المستودع مختلف على GitHub
const GH_OWNER = 'xmanx2464-byte';
const GH_REPO  = 'ayoub-blog';
const GH_BRANCH = 'main';

const API_BASE = `/.netlify/git/github/repos/${GH_OWNER}/${GH_REPO}`;

let settingsState = null, settingsSha = null;
let postsState = null, postsSha = null;
let currentUser = null;

/* ================= أدوات مساعدة ================= */

function b64EncodeUnicode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(str){
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

async function getToken(){
  const user = window.netlifyIdentity.currentUser();
  if(!user) throw new Error('غير مسجل الدخول');
  return await user.jwt();
}

async function ghGetFile(path){
  const token = await getToken();
  const res = await fetch(`${API_BASE}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${GH_BRANCH}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if(!res.ok) throw new Error('تعذر تحميل ' + path + ' (' + res.status + ')');
  const data = await res.json();
  return { json: JSON.parse(b64DecodeUnicode(data.content)), sha: data.sha };
}

async function ghPutJSON(path, obj, sha, message){
  const token = await getToken();
  const body = {
    message,
    content: b64EncodeUnicode(JSON.stringify(obj, null, 2)),
    branch: GH_BRANCH
  };
  if(sha) body.sha = sha;
  const res = await fetch(`${API_BASE}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('فشل الحفظ (' + res.status + '): ' + t.slice(0,200));
  }
  return await res.json();
}

async function ghPutImage(path, base64DataOnly, message){
  const token = await getToken();
  let existingSha = null;
  try{
    const check = await fetch(`${API_BASE}/contents/${path}?ref=${GH_BRANCH}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if(check.ok){ existingSha = (await check.json()).sha; }
  }catch(e){ /* الملف غير موجود، طبيعي لملف جديد */ }

  const body = { message, content: base64DataOnly, branch: GH_BRANCH };
  if(existingSha) body.sha = existingSha;
  const res = await fetch(`${API_BASE}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('فشل رفع الصورة (' + res.status + '): ' + t.slice(0,200));
  }
  return await res.json();
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setStatus(msg, type){
  const el = document.getElementById('save-status');
  el.textContent = msg;
  el.className = 'save-status ' + (type || '');
  if(type === 'ok'){ setTimeout(() => { el.textContent=''; el.className='save-status'; }, 3000); }
}

function formatDate(dateStr){
  try{
    return new Date(dateStr).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' });
  }catch(e){ return dateStr || ''; }
}

function uid(){ return Math.random().toString(36).slice(2,8); }

/* ================= تحميل البيانات ================= */

async function loadAllData(){
  document.getElementById('loading').classList.remove('hidden');
  try{
    const [s, p] = await Promise.all([
      ghGetFile('content/settings.json'),
      ghGetFile('content/posts.json')
    ]);
    settingsState = s.json; settingsSha = s.sha;
    postsState = p.json; postsSha = p.sha;
    renderAvatar();
    renderStats();
    renderRecentPosts();
    renderPostsEditor();
    renderSettingsForm();
    renderSupportForm();
    renderBrandingPreview();
  }catch(err){
    console.error(err);
    setStatus('تعذر تحميل البيانات: تأكد من اسم المستودع في dashboard.js', 'err');
  }finally{
    document.getElementById('loading').classList.add('hidden');
  }
}

/* ================= نظرة عامة / إحصائيات ================= */

function renderStats(){
  const posts = postsState.posts || [];
  const tags = new Set(posts.map(p => p.tag).filter(Boolean));
  const sorted = [...posts].sort((a,b) => new Date(b.date) - new Date(a.date));
  const latest = sorted[0];
  const withMedia = posts.filter(p => p.cover_image || p.video_url).length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><b>${posts.length}</b><span>إجمالي المقالات</span></div>
    <div class="stat-card"><b>${tags.size}</b><span>عدد التصنيفات</span></div>
    <div class="stat-card"><b>${withMedia}</b><span>مقالات فيها صور/فيديو</span></div>
    <div class="stat-card"><b>${latest ? formatDate(latest.date) : '—'}</b><span>آخر نشر</span></div>
  `;
}

function renderRecentPosts(){
  const posts = [...(postsState.posts || [])].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,5);
  const list = document.getElementById('recent-posts-list');
  if(posts.length === 0){
    list.innerHTML = `<p class="hint">لا توجد مقالات بعد.</p>`;
    return;
  }
  list.innerHTML = posts.map(p => `
    <div class="recent-item">
      <div>
        <div class="ri-title">${p.title}</div>
        <div class="ri-meta">${p.tag || 'بدون تصنيف'} · ${formatDate(p.date)}</div>
      </div>
      <button class="btn-outline-sm" data-goto-post="${p.slug}">تعديل</button>
    </div>
  `).join('');
}

/* ================= إعدادات الموقع ================= */

const SETTINGS_FIELDS = [
  { key:'site_title', label:'اسم الموقع', type:'text' },
  { key:'site_tagline', label:'الوصف القصير للموقع', type:'text' },
  { key:'hero_eyebrow', label:'شارة أعلى العنوان الرئيسي', type:'text' },
  { key:'hero_title', label:'العنوان الرئيسي', type:'text' },
  { key:'hero_subtitle', label:'الوصف تحت العنوان الرئيسي', type:'textarea' },
  { key:'about_text', label:'نص صفحة "حول" (افصل الفقرات بسطر فارغ)', type:'textarea' },
  { key:'footer_text', label:'نص التذييل', type:'text' },
];

function renderSettingsForm(){
  document.getElementById('settings-form').innerHTML = SETTINGS_FIELDS.map(f => `
    <div class="field">
      <label>${f.label}</label>
      ${f.type === 'textarea'
        ? `<textarea data-settings-key="${f.key}">${settingsState[f.key] || ''}</textarea>`
        : `<input type="text" data-settings-key="${f.key}" value="${(settingsState[f.key]||'').replace(/"/g,'&quot;')}">`}
    </div>
  `).join('');
}

async function saveSettings(){
  SETTINGS_FIELDS.forEach(f => {
    const el = document.querySelector(`[data-settings-key="${f.key}"]`);
    if(el) settingsState[f.key] = el.value;
  });
  setStatus('جاري الحفظ...', 'busy');
  try{
    const result = await ghPutJSON('content/settings.json', settingsState, settingsSha, 'تحديث إعدادات الموقع من لوحة التحكم');
    settingsSha = result.content.sha;
    setStatus('تم الحفظ بنجاح ✓ (سينشر الموقع خلال دقيقة)', 'ok');
  }catch(err){
    console.error(err);
    setStatus('فشل الحفظ: ' + err.message, 'err');
  }
}

/* ================= الدعم المالي ================= */

const SUPPORT_FIELDS = [
  { key:'support_intro', label:'مقدمة صفحة الدعم', type:'textarea' },
  { key:'paypal_url', label:'رابط PayPal (مثال: https://paypal.me/username)', type:'text' },
  { key:'kofi_url', label:'رابط Ko-fi', type:'text' },
  { key:'buymeacoffee_url', label:'رابط Buy Me a Coffee', type:'text' },
  { key:'telegram_url', label:'رابط محفظة تيليغرام (مثال: https://t.me/username أو رابط Wallet)', type:'text' },
];

function renderSupportForm(){
  document.getElementById('support-form').innerHTML = SUPPORT_FIELDS.map(f => `
    <div class="field">
      <label>${f.label}</label>
      ${f.type === 'textarea'
        ? `<textarea data-support-key="${f.key}">${settingsState[f.key] || ''}</textarea>`
        : `<input type="text" data-support-key="${f.key}" value="${(settingsState[f.key]||'').replace(/"/g,'&quot;')}">`}
    </div>
  `).join('');
}

async function saveSupport(){
  SUPPORT_FIELDS.forEach(f => {
    const el = document.querySelector(`[data-support-key="${f.key}"]`);
    if(el) settingsState[f.key] = el.value;
  });
  setStatus('جاري الحفظ...', 'busy');
  try{
    const result = await ghPutJSON('content/settings.json', settingsState, settingsSha, 'تحديث روابط الدعم المالي من لوحة التحكم');
    settingsSha = result.content.sha;
    setStatus('تم حفظ روابط الدعم ✓', 'ok');
  }catch(err){
    console.error(err);
    setStatus('فشل الحفظ: ' + err.message, 'err');
  }
}

/* ================= المقالات ================= */

function renderPostsEditor(){
  const posts = postsState.posts || [];
  const container = document.getElementById('posts-editor-list');
  if(posts.length === 0){
    container.innerHTML = `<p class="hint">لا توجد مقالات بعد. اضغط "+ مقال جديد" للبدء.</p>`;
    return;
  }
  container.innerHTML = posts.map((p, i) => `
    <div class="post-card" id="post-card-${i}" data-index="${i}">
      <div class="post-card-head" data-toggle="${i}">
        <div>
          <h4>${p.title || '(بدون عنوان)'}</h4>
          <div class="ph-meta">${p.tag || 'بدون تصنيف'} · ${formatDate(p.date)}</div>
        </div>
        <span>▾</span>
      </div>
      <div class="post-card-body">
        ${p.cover_image ? `<div class="cover-preview" style="background-image:url('${p.cover_image}')"></div>` : `<div class="cover-preview">لا توجد صورة غلاف</div>`}
        <div class="form-grid">
          <div class="field"><label>العنوان</label><input type="text" data-p="${i}" data-k="title" value="${(p.title||'').replace(/"/g,'&quot;')}"></div>
          <div class="field"><label>الرابط المختصر (slug - إنجليزي بدون فراغات)</label><input type="text" data-p="${i}" data-k="slug" value="${(p.slug||'').replace(/"/g,'&quot;')}"></div>
          <div class="field"><label>التصنيف</label><input type="text" data-p="${i}" data-k="tag" value="${(p.tag||'').replace(/"/g,'&quot;')}"></div>
          <div class="field"><label>ملخص قصير</label><textarea data-p="${i}" data-k="excerpt">${p.excerpt||''}</textarea></div>
          <div class="field"><label>تاريخ النشر</label><input type="date" data-p="${i}" data-k="date" value="${(p.date||'').slice(0,10)}"></div>
          <div class="field"><label>رفع صورة غلاف جديدة</label><input type="file" accept="image/*" data-cover-upload="${i}"></div>
          <div class="field"><label>رابط فيديو يوتيوب (اختياري)</label><input type="text" data-p="${i}" data-k="video_url" value="${(p.video_url||'').replace(/"/g,'&quot;')}"></div>
          <div class="field"><label>محتوى المقال (Markdown)</label><textarea data-p="${i}" data-k="body" style="min-height:200px;">${p.body||''}</textarea></div>
        </div>
        <div class="post-card-actions">
          <button class="btn-gold small" data-save-post="${i}">💾 حفظ المقال</button>
          <button class="btn-outline-sm danger" data-delete-post="${i}">🗑️ حذف المقال</button>
        </div>
      </div>
    </div>
  `).join('');
}

function addNewPost(){
  postsState.posts = postsState.posts || [];
  postsState.posts.unshift({
    slug: 'مقال-' + uid(),
    title: 'مقال جديد',
    tag: '',
    excerpt: '',
    date: new Date().toISOString().slice(0,10),
    cover_image: '',
    video_url: '',
    body: '## عنوان فرعي\n\nابدأ الكتابة هنا...'
  });
  renderPostsEditor();
  const firstCard = document.getElementById('post-card-0');
  if(firstCard) firstCard.classList.add('open');
  switchSection('posts');
}

async function savePostsToGitHub(message){
  setStatus('جاري الحفظ...', 'busy');
  try{
    const result = await ghPutJSON('content/posts.json', postsState, postsSha, message || 'تحديث المقالات من لوحة التحكم');
    postsSha = result.content.sha;
    setStatus('تم النشر بنجاح ✓ (سيظهر على الموقع خلال دقيقة)', 'ok');
    renderStats();
    renderRecentPosts();
  }catch(err){
    console.error(err);
    setStatus('فشل النشر: ' + err.message, 'err');
  }
}

async function saveSinglePost(index){
  const card = document.querySelector(`.post-card[data-index="${index}"]`);
  card.querySelectorAll('[data-p]').forEach(el => {
    postsState.posts[index][el.dataset.k] = el.value;
  });
  await savePostsToGitHub('تحديث مقال: ' + (postsState.posts[index].title || ''));
  renderPostsEditor();
  document.getElementById(`post-card-${index}`)?.classList.add('open');
}

async function deletePost(index){
  if(!confirm('متأكد إنك تبي تحذف هذا المقال نهائياً؟')) return;
  postsState.posts.splice(index, 1);
  await savePostsToGitHub('حذف مقال من لوحة التحكم');
  renderPostsEditor();
  renderRecentPosts();
}

async function uploadCoverForPost(index, file){
  setStatus('جاري رفع الصورة...', 'busy');
  try{
    const base64 = await fileToBase64(file);
    const ext = file.name.split('.').pop();
    const path = `images/cover-${Date.now()}-${uid()}.${ext}`;
    await ghPutImage(path, base64, 'رفع صورة غلاف من لوحة التحكم');
    postsState.posts[index].cover_image = '/' + path;
    await savePostsToGitHub('تحديث صورة غلاف مقال');
    renderPostsEditor();
    document.getElementById(`post-card-${index}`)?.classList.add('open');
  }catch(err){
    console.error(err);
    setStatus('فشل رفع الصورة: ' + err.message, 'err');
  }
}

/* ================= الشعار / الصورة الشخصية ================= */

function renderAvatar(){
  const url = settingsState.site_logo;
  if(!url) return;
  document.querySelectorAll('#sidebar-avatar').forEach(el => {
    el.innerHTML = `<img src="${url}" alt="">`;
  });
}
function renderBrandingPreview(){
  const url = settingsState.site_logo;
  const el = document.getElementById('branding-preview');
  el.innerHTML = url ? `<img src="${url}" alt="">` : 'ع';
}

async function saveLogo(){
  const input = document.getElementById('logo-upload');
  const file = input.files[0];
  if(!file){ setStatus('اختر صورة أولاً', 'err'); return; }
  setStatus('جاري رفع الصورة...', 'busy');
  try{
    const base64 = await fileToBase64(file);
    const ext = file.name.split('.').pop();
    const path = `images/avatar-${Date.now()}.${ext}`;
    await ghPutImage(path, base64, 'تحديث شعار/صورة الموقع من لوحة التحكم');
    settingsState.site_logo = '/' + path;
    const result = await ghPutJSON('content/settings.json', settingsState, settingsSha, 'ربط الصورة الجديدة بإعدادات الموقع');
    settingsSha = result.content.sha;
    renderAvatar();
    renderBrandingPreview();
    setStatus('تم تحديث الصورة بنجاح ✓', 'ok');
  }catch(err){
    console.error(err);
    setStatus('فشل رفع الصورة: ' + err.message, 'err');
  }
}

/* ================= التنقل بين الأقسام ================= */

function switchSection(target){
  document.querySelectorAll('.dash-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('section-' + target)?.classList.remove('hidden');
  document.querySelectorAll('.dash-nav-link').forEach(l => l.classList.toggle('active', l.dataset.target === target));
  const titles = {
    overview:['نظرة عامة','مرحباً بك من جديد 👋'],
    posts:['إدارة المقالات','أضف، عدّل، أو احذف أي مقال'],
    settings:['إعدادات الموقع','تحكم في كل نصوص الموقع الرئيسية'],
    support:['الدعم المالي','روابط الدعم الظاهرة في الموقع'],
    branding:['الشعار والصورة','غيّر صورة موقعك في أي وقت'],
  };
  const t = titles[target] || ['',''];
  document.getElementById('topbar-title').textContent = t[0];
  document.getElementById('topbar-sub').textContent = t[1];
}

/* ================= ربط الأحداث ================= */

function wireEvents(){
  document.querySelectorAll('.dash-nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchSection(link.dataset.target);
    });
  });
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.nav));
  });

  document.getElementById('add-post-btn').addEventListener('click', addNewPost);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('save-support-btn').addEventListener('click', saveSupport);
  document.getElementById('save-logo-btn').addEventListener('click', saveLogo);

  document.getElementById('logout-btn').addEventListener('click', () => {
    window.netlifyIdentity.logout();
  });

  // تفويض الأحداث للعناصر المتغيرة ديناميكياً
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if(toggle){
      document.getElementById('post-card-' + toggle.dataset.toggle).classList.toggle('open');
      return;
    }
    const saveBtn = e.target.closest('[data-save-post]');
    if(saveBtn){ saveSinglePost(Number(saveBtn.dataset.savePost)); return; }

    const delBtn = e.target.closest('[data-delete-post]');
    if(delBtn){ deletePost(Number(delBtn.dataset.deletePost)); return; }

    const gotoBtn = e.target.closest('[data-goto-post]');
    if(gotoBtn){
      switchSection('posts');
      const idx = postsState.posts.findIndex(p => p.slug === gotoBtn.dataset.gotoPost);
      if(idx > -1){
        setTimeout(() => {
          document.getElementById('post-card-' + idx)?.classList.add('open');
          document.getElementById('post-card-' + idx)?.scrollIntoView({behavior:'smooth', block:'center'});
        }, 50);
      }
      return;
    }
  });

  document.addEventListener('change', (e) => {
    if(e.target.matches('[data-cover-upload]')){
      const idx = Number(e.target.dataset.coverUpload);
      const file = e.target.files[0];
      if(file) uploadCoverForPost(idx, file);
    }
  });
}

/* ================= المصادقة (Netlify Identity) ================= */

function showApp(){
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadAllData();
}
function showGate(){
  document.getElementById('gate').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  wireEvents();

  const identity = window.netlifyIdentity;
  if(!identity){
    setStatus('تعذر تحميل نظام الدخول، تأكد من الاتصال بالإنترنت', 'err');
    return;
  }

  identity.on('init', user => {
    currentUser = user;
    if(user) showApp(); else showGate();
  });
  identity.on('login', user => {
    currentUser = user;
    identity.close();
    showApp();
  });
  identity.on('logout', () => {
    currentUser = null;
    showGate();
  });

  document.getElementById('gate-login-btn').addEventListener('click', () => identity.open('login'));

  identity.init();
});
