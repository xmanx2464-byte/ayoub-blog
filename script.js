/* يقرأ هذا الملف بيانات الموقع (content/settings.json) والمقالات
   (content/posts.json) ويعرضها في الصفحات. أي تعديل يتم من لوحة
   التحكم /admin ينعكس هنا تلقائياً بعد إعادة تحميل الصفحة. */

async function loadJSON(path){
  try{
    const res = await fetch(path + '?t=' + Date.now());
    if(!res.ok) throw new Error('تعذر تحميل ' + path);
    return await res.json();
  }catch(err){
    console.error(err);
    return null;
  }
}

function formatDate(dateStr){
  try{
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' });
  }catch(e){ return dateStr || ''; }
}

function readingTime(text){
  const words = (text || '').trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 180));
}

/* ===== تطبيق الإعدادات العامة على أي صفحة ===== */
function applySettings(settings){
  if(!settings) return;
  document.querySelectorAll('[data-site-title]').forEach(el => el.textContent = settings.site_title || '');
  document.querySelectorAll('[data-site-tagline]').forEach(el => el.textContent = settings.site_tagline || '');
  document.querySelectorAll('[data-hero-eyebrow]').forEach(el => el.textContent = settings.hero_eyebrow || '');
  document.querySelectorAll('[data-hero-title]').forEach(el => el.textContent = settings.hero_title || '');
  document.querySelectorAll('[data-hero-subtitle]').forEach(el => el.textContent = settings.hero_subtitle || '');
  document.querySelectorAll('[data-about-text]').forEach(el => {
    el.innerHTML = (settings.about_text || '').split('\n\n').map(p => `<p>${p}</p>`).join('');
  });
  document.querySelectorAll('[data-support-intro]').forEach(el => el.textContent = settings.support_intro || '');
  document.querySelectorAll('[data-footer-text]').forEach(el => el.textContent = settings.footer_text || '');

  // روابط الدعم المالي
  const linkMap = { paypal: settings.paypal_url, kofi: settings.kofi_url, buymeacoffee: settings.buymeacoffee_url };
  Object.entries(linkMap).forEach(([key, url]) => {
    document.querySelectorAll(`[data-link="${key}"]`).forEach(el => {
      if(url){ el.href = url; el.style.display = ''; }
      else{ el.style.display = 'none'; }
    });
  });
}

/* ===== الصفحة الرئيسية: مقال مميز + شبكة المقالات ===== */
async function renderHome(){
  const grid = document.getElementById('posts-grid');
  if(!grid) return;
  const data = await loadJSON('content/posts.json');
  const posts = (data && data.posts) ? [...data.posts] : [];
  posts.sort((a,b) => new Date(b.date) - new Date(a.date));

  const statsEl = document.getElementById('hero-stats');
  if(statsEl){
    const tags = new Set(posts.map(p => p.tag).filter(Boolean));
    statsEl.innerHTML = `
      <div class="stat"><b>${posts.length}</b><span>مقال منشور</span></div>
      <div class="stat"><b>${tags.size || 0}</b><span>تصنيف</span></div>
      <div class="stat"><b>مجاني</b><span>100% دائماً</span></div>
    `;
  }

  if(posts.length === 0){
    grid.innerHTML = `<div class="empty-state">لا توجد مقالات بعد. أضف أول مقال من <a href="/admin" style="text-decoration:underline">لوحة التحكم</a>.</div>`;
    return;
  }

  const featuredEl = document.getElementById('featured-post');
  const [featured, ...rest] = posts;

  if(featuredEl && featured){
    featuredEl.innerHTML = `
      <a class="featured-post reveal" href="post.html?slug=${encodeURIComponent(featured.slug)}">
        <div class="fp-media"><span class="fp-mark">${(featured.tag || 'جديد').slice(0,1)}</span></div>
        <div class="fp-content">
          <span class="badge">✦ أحدث مقال</span>
          <h3>${featured.title}</h3>
          <p>${featured.excerpt || ''}</p>
          <div class="post-meta" style="border:none; padding:0; justify-content:flex-start; gap:16px;">
            <span>${formatDate(featured.date)}</span>
            <span class="read">اقرأ المقال ←</span>
          </div>
        </div>
      </a>
    `;
  }

  grid.innerHTML = rest.map(p => `
    <a class="post-card reveal" href="post.html?slug=${encodeURIComponent(p.slug)}">
      ${p.tag ? `<span class="post-tag">${p.tag}</span>` : ''}
      <h3>${p.title}</h3>
      <p>${p.excerpt || ''}</p>
      <div class="post-meta">
        <span>${formatDate(p.date)}</span>
        <span class="read">اقرأ المزيد ←</span>
      </div>
    </a>
  `).join('');

  setupReveal();
}

/* ===== صفحة المقال المفرد ===== */
async function renderPost(){
  const container = document.getElementById('post-container');
  if(!container) return;
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const data = await loadJSON('content/posts.json');
  const posts = (data && data.posts) ? data.posts : [];
  const post = posts.find(p => p.slug === slug);

  if(!post){
    container.innerHTML = `<div class="empty-state">لم يتم العثور على هذا المقال.</div>`;
    return;
  }

  document.title = post.title + ' — ' + (document.title.split('—').pop().trim());

  const bodyHtml = (typeof marked !== 'undefined') ? marked.parse(post.body || '') : (post.body || '');

  container.innerHTML = `
    <div class="post-header">
      <a class="back-link" href="index.html">→ العودة للمدونة</a>
      ${post.tag ? `<span class="post-tag">${post.tag}</span>` : ''}
      <h1>${post.title}</h1>
      <div class="post-meta">
        <span>${formatDate(post.date)}</span>
        <span>قراءة ${readingTime(post.body)} دقائق</span>
      </div>
    </div>
    <article class="post-body">${bodyHtml}</article>
  `;
}

/* ===== قائمة الجوال ===== */
function setupNav(){
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if(toggle && links){
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
}

/* ===== ظل شريط التنقل عند التمرير ===== */
function setupHeaderShadow(){
  const header = document.querySelector('.site-header');
  if(!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive:true });
}

/* ===== كشف العناصر عند التمرير ===== */
function setupReveal(){
  const items = document.querySelectorAll('.reveal:not(.in-view)');
  if(!('IntersectionObserver' in window)){
    items.forEach(el => el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach(el => io.observe(el));
}

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupHeaderShadow();
  const settings = await loadJSON('content/settings.json');
  applySettings(settings);
  await renderHome();
  await renderPost();
  setupReveal();
});
