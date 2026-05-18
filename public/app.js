let loveMap = null;
let markerLayer = null;
let footprintCache = [];
let bucketCache = [];
let treeHoleCache = [];
let dailyCheckinCache = [];
let wishPoolCache = [];

let activeBucketTab = 'todo';
let loveDays = 0;
let selectedCheckinDate = '';

let meshAnimationId = null;
let lightboxImages = [];
let lightboxIndex = 0;

let anniversarySlides = [];
let anniversaryIndex = 0;
let anniversaryMusicUrl = '';

let siteMusicUrl = '';
let mediaLibrary = { music: [], pictures: [] };

const startDate = new Date('2023-05-02T12:28:00');

function escapeHtml(value) {
    const text = String(value || '');
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function padDatePart(value) {
    return String(value).padStart(2, '0');
}

function readDateParts(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return {
            year: value.getFullYear(),
            month: value.getMonth() + 1,
            day: value.getDate(),
            hour: value.getHours(),
            minute: value.getMinutes()
        };
    }

    const text = String(value).trim();
    const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
    if (hasExplicitTimezone) {
        const date = new Date(text);
        if (!Number.isNaN(date.getTime())) {
            return {
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate(),
                hour: date.getHours(),
                minute: date.getMinutes()
            };
        }
    }

    const matched = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (matched) {
        return {
            year: Number(matched[1]),
            month: Number(matched[2]),
            day: Number(matched[3]),
            hour: matched[4] === undefined ? null : Number(matched[4]),
            minute: matched[5] === undefined ? null : Number(matched[5])
        };
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes()
    };
}

function formatDate(value, options = {}) {
    if (!value) return '未设置日期';

    const parts = readDateParts(value);
    if (!parts) return String(value);

    const dateText = `${parts.year}年${padDatePart(parts.month)}月${padDatePart(parts.day)}日`;
    const showTime = options.showTime !== false && parts.hour !== null && parts.minute !== null;

    if (!showTime) return dateText;
    return `${dateText} ${padDatePart(parts.hour)}:${padDatePart(parts.minute)}`;
}

function formatDateOnly(value) {
    return formatDate(value, { showTime: false });
}

function getTodayDateText() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getAnniversaryAudio() {
    return document.getElementById('anniversary-audio');
}

function getSiteAudio() {
    return document.getElementById('site-audio');
}

function formatAudioError(err) {
    if (!err) return '未知错误';
    const name = err.name || 'Error';
    const message = err.message || '无详细信息';
    return `${name}: ${message}`;
}

function normalizeMediaUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url, window.location.origin);
        return decodeURIComponent(parsed.pathname || '');
    } catch (_e) {
        return String(url);
    }
}

function formatMusicDisplayName(name) {
    return String(name || '')
        .replace(/\.[^/.]+$/, '')
        .replace(/^[^-]+-\s*/, '')
        .trim();
}

function recoverSilentAudio(audio, storageKey, fallbackVolume) {
    if (!audio) return;

    if (audio.muted) audio.muted = false;

    if (!Number.isFinite(audio.volume) || audio.volume <= 0.01) {
        audio.volume = fallbackVolume;
    }

    if (storageKey) {
        localStorage.setItem(storageKey, String(audio.volume));
    }
}

async function refreshMediaLibraryIfNeeded() {
    if (mediaLibrary.music.length || mediaLibrary.pictures.length) return;
    try {
        const res = await fetch('/api/media/library');
        const json = await res.json();
        mediaLibrary = json.data || { music: [], pictures: [] };
        renderPicturePicker();
    } catch (e) {
        console.error('读取媒体库失败', e);
    }
}

async function ensureAnniversaryAudioSource(forceLocalFallback = false) {
    const audio = getAnniversaryAudio();
    if (!audio) return false;

    if (!forceLocalFallback && audio.src) return true;

    if (!forceLocalFallback && anniversaryMusicUrl) {
        audio.src = anniversaryMusicUrl;
        audio.load();
        return true;
    }

    await refreshMediaLibraryIfNeeded();
    const annTrack = mediaLibrary.music.find((m) => m.name.includes('一次就好')) || mediaLibrary.music[0];
    if (!annTrack) return false;

    anniversaryMusicUrl = annTrack.url;
    audio.src = anniversaryMusicUrl;
    audio.load();

    fetch('/api/anniversary/settings/music', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ music_url: anniversaryMusicUrl })
    }).catch(() => {});

    const input = document.getElementById('music-url');
    if (input) input.value = anniversaryMusicUrl;

    return true;
}

async function ensureSiteAudioSource(forceLocalFallback = false) {
    const audio = getSiteAudio();
    if (!audio) return false;

    if (!forceLocalFallback && audio.src) return true;
    if (!forceLocalFallback && siteMusicUrl) {
        audio.src = siteMusicUrl;
        audio.load();
        return true;
    }

    await refreshMediaLibraryIfNeeded();
    const siteTrack = mediaLibrary.music.find((m) => m.name.includes('樱花泪')) || mediaLibrary.music[0];
    if (!siteTrack) return false;

    siteMusicUrl = siteTrack.url;
    audio.src = siteMusicUrl;
    audio.load();
    return true;
}

function startSakuraEffect() {
    const container = document.getElementById('sakura-container');
    if (!container) return;

    setInterval(() => {
        const petal = document.createElement('div');
        petal.className = 'sakura-petal';
        petal.style.left = `${Math.random() * 100}vw`;
        petal.style.animationDuration = `${Math.random() * 4 + 4}s`;

        const size = Math.random() * 6 + 8;
        petal.style.width = `${size}px`;
        petal.style.height = `${size * 1.2}px`;

        container.appendChild(petal);
        setTimeout(() => petal.remove(), 8500);
    }, 600);
}

function updateMusicButtons() {
    const audio = getAnniversaryAudio();
    const toggleBtn = document.getElementById('music-toggle-btn');
    const muteBtn = document.getElementById('music-mute-btn');
    if (!audio) return;

    if (toggleBtn) toggleBtn.textContent = audio.paused ? '播放音乐' : '暂停音乐';
    if (muteBtn) muteBtn.textContent = audio.muted ? '取消静音' : '静音';
}

function updateSiteMusicButton() {
    const audio = getSiteAudio();
    const btn = document.getElementById('site-music-toggle-btn');
    const current = document.getElementById('site-music-current');

    if (btn && audio) {
        btn.textContent = audio.paused ? '播放' : '暂停播放';
    }

    if (current) {
        const activePath = normalizeMediaUrl(siteMusicUrl || (audio ? audio.src : ''));
        const activeTrack = mediaLibrary.music.find((item) => normalizeMediaUrl(item.url) === activePath);
        if (activeTrack) {
            current.textContent = `当前：${formatMusicDisplayName(activeTrack.name)}`;
        } else {
            current.textContent = '当前：未选择';
        }
    }
}

function renderSiteMusicList() {
    const list = document.getElementById('site-music-list');
    const audio = getSiteAudio();
    if (!list) return;

    if (!mediaLibrary.music.length) {
        list.innerHTML = '<div class="empty-state">music 文件夹里还没有可播放的歌曲。</div>';
        return;
    }

    const activePath = normalizeMediaUrl(siteMusicUrl || (audio ? audio.src : ''));

    list.innerHTML = mediaLibrary.music.map((track) => {
        const selected = normalizeMediaUrl(track.url) === activePath;
        return `
            <button type="button" class="site-music-item ${selected ? 'active' : ''}" data-url="${escapeHtml(track.url)}" aria-pressed="${selected ? 'true' : 'false'}">
                <div class="site-music-meta">
                    <p class="site-music-name">${escapeHtml(formatMusicDisplayName(track.name))}</p>
                    <p class="site-music-note">${escapeHtml(track.name)}</p>
                </div>
                <span class="site-music-tag">${selected ? '播放中' : '选择'}</span>
            </button>
        `;
    }).join('');

    list.querySelectorAll('.site-music-item').forEach((item) => {
        item.addEventListener('click', () => selectSiteMusic(item.dataset.url || ''));
    });
}

async function openSiteMusicSheet() {
    await refreshMediaLibraryIfNeeded();
    renderSiteMusicList();

    const sheet = document.getElementById('site-music-sheet');
    const overlay = document.getElementById('site-music-overlay');
    if (!sheet || !overlay) return;

    sheet.classList.add('open');
    overlay.style.display = 'block';
    setTimeout(() => { overlay.style.opacity = '1'; }, 10);
}

function closeSiteMusicSheet() {
    const sheet = document.getElementById('site-music-sheet');
    const overlay = document.getElementById('site-music-overlay');
    if (sheet) sheet.classList.remove('open');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

async function selectSiteMusic(url) {
    const audio = getSiteAudio();
    if (!audio) return;

    const nextUrl = String(url || '').trim();
    if (!nextUrl) return;

    siteMusicUrl = nextUrl;
    localStorage.setItem('siteMusicSelectedUrl', siteMusicUrl);
    audio.src = siteMusicUrl;
    audio.load();

    recoverSilentAudio(audio, 'siteMusicVolume', 0.42);
    try {
        await audio.play();
    } catch (err) {
        if (err && err.name !== 'AbortError') {
            alert(`选歌后播放失败\n${formatAudioError(err)}`);
        }
    }

    updateSiteMusicButton();
    renderSiteMusicList();
}

function setAnniversaryVolume(value) {
    const audio = getAnniversaryAudio();
    if (!audio) return;

    const volume = Math.max(0, Math.min(1, Number(value)));
    audio.volume = volume;
    localStorage.setItem('anniversaryMusicVolume', String(volume));
}

function playAnniversaryMusic() {
    const audio = getAnniversaryAudio();
    if (!audio || !audio.src) return;

    recoverSilentAudio(audio, 'anniversaryMusicVolume', 0.6);

    audio.play().catch(() => {
        console.warn('自动播放被浏览器拦截，请手动点击播放。');
    }).finally(updateMusicButtons);
}

async function toggleAnniversaryMusic() {
    const audio = getAnniversaryAudio();
    if (!audio) return;

    const ok = await ensureAnniversaryAudioSource();
    if (!ok) {
        alert('没有可用的三周年音乐，请检查 music 文件夹是否存在音频。');
        return;
    }

    recoverSilentAudio(audio, 'anniversaryMusicVolume', 0.6);

    if (audio.paused) {
        audio.play().catch(async (err) => {
            const fallbackReady = await ensureAnniversaryAudioSource(true);
            if (fallbackReady) {
                recoverSilentAudio(audio, 'anniversaryMusicVolume', 0.6);
                try {
                    await audio.play();
                    return;
                } catch (retryErr) {
                    alert(`播放失败（已尝试回退本地音乐）\n${formatAudioError(retryErr)}`);
                    return;
                }
            }

            alert(`播放失败\n${formatAudioError(err)}`);
        }).finally(updateMusicButtons);
    } else {
        audio.pause();
        updateMusicButtons();
    }
}

function toggleAnniversaryMute() {
    const audio = getAnniversaryAudio();
    if (!audio) return;

    audio.muted = !audio.muted;
    localStorage.setItem('anniversaryMusicMuted', String(audio.muted));
    updateMusicButtons();
}

async function toggleSiteMusic() {
    const audio = getSiteAudio();
    if (!audio) return;

    const ok = await ensureSiteAudioSource();
    if (!ok) {
        alert('没有可用的全站音乐，请检查 music 文件夹是否存在音频。');
        return;
    }

    recoverSilentAudio(audio, 'siteMusicVolume', 0.42);

    if (audio.paused) {
        audio.play().catch(async (err) => {
            const fallbackReady = await ensureSiteAudioSource(true);
            if (fallbackReady) {
                recoverSilentAudio(audio, 'siteMusicVolume', 0.42);
                try {
                    await audio.play();
                    return;
                } catch (retryErr) {
                    alert(`全站音乐播放失败（已尝试回退本地音乐）\n${formatAudioError(retryErr)}`);
                    return;
                }
            }

            alert(`全站音乐播放失败\n${formatAudioError(err)}`);
        }).finally(updateSiteMusicButton);
    } else {
        audio.pause();
        updateSiteMusicButton();
    }
}

function updateTimer() {
    const now = new Date();
    const diff = Math.max(0, now - startDate);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    loveDays = days;

    const timer = document.getElementById('timer');
    if (!timer) return;

    timer.innerHTML = `
        <div class="timer-unit"><span class="timer-num">${days}</span><span class="timer-label">天</span></div>
        <div class="timer-unit"><span class="timer-num">${hours}</span><span class="timer-label">时</span></div>
        <div class="timer-unit"><span class="timer-num">${minutes}</span><span class="timer-label">分</span></div>
        <div class="timer-unit"><span class="timer-num">${seconds}</span><span class="timer-label">秒</span></div>
    `;

    updateOverviewPanel();
}

function updateOverviewPanel() {
    const daysEl = document.getElementById('overview-days');
    const cityEl = document.getElementById('overview-cities');
    const bucketEl = document.getElementById('overview-bucket');
    const letterEl = document.getElementById('overview-letters');

    if (daysEl) daysEl.textContent = String(loveDays);

    const cities = new Set(footprintCache.map((item) => item.city).filter(Boolean));
    if (cityEl) cityEl.textContent = String(cities.size);

    const totalBucket = bucketCache.length;
    const doneBucket = bucketCache.filter((item) => Number(item.is_completed) === 1).length;
    const ratio = totalBucket ? Math.round((doneBucket / totalBucket) * 100) : 0;
    if (bucketEl) bucketEl.textContent = `${ratio}%`;

    if (letterEl) letterEl.textContent = String(treeHoleCache.length);
}

function switchTab(tabId, element) {
    document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));

    const page = document.getElementById(tabId);
    if (page) page.classList.add('active');

    if (element) {
        element.classList.add('active');
    } else {
        const navMap = {
            hub: 0,
            map: 1,
            list: 2,
            hole: 3,
            daily: 4,
            wish: 5
        };
        const index = navMap[tabId];
        if (index !== undefined) {
            const navItems = document.querySelectorAll('.nav-item');
            if (navItems[index]) navItems[index].classList.add('active');
        }
    }

    document.body.setAttribute('data-scene', tabId);

    if (tabId === 'map') {
        setTimeout(initOrRefreshMap, 120);
        loadFootprintMarkers();
    }
    if (tabId === 'list') loadBucketList();
    if (tabId === 'hole') loadTreeHole();
    if (tabId === 'daily') loadDailyCheckins();
    if (tabId === 'wish') loadWishPool();
    if (tabId === 'anniversary') {
        loadAnniversarySlides();
        loadAnniversarySettings();
    }
}

function initRevealAnimation() {
    const revealNodes = document.querySelectorAll('.reveal');
    if (!revealNodes.length) return;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        },
        { threshold: 0.18 }
    );

    revealNodes.forEach((node, index) => {
        node.style.transitionDelay = `${index * 40}ms`;
        observer.observe(node);
    });
}

function initScrollProgress() {
    const progress = document.getElementById('scroll-progress');
    if (!progress) return;

    const render = () => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0;
        progress.style.width = `${ratio * 100}%`;
    };

    window.addEventListener('scroll', render, { passive: true });
    render();
}

function initCursorGlow() {
    if (window.matchMedia('(max-width: 680px)').matches) return;

    const glow = document.getElementById('cursor-glow');
    if (!glow) return;

    document.body.classList.add('fx-ready');
    window.addEventListener('mousemove', (event) => {
        glow.style.left = `${event.clientX}px`;
        glow.style.top = `${event.clientY}px`;
    });
}

function initCardTilt() {
    if (window.matchMedia('(max-width: 900px)').matches) return;

    const tiltTargets = document.querySelectorAll('.hero, .card, .overview-card');
    tiltTargets.forEach((card) => {
        card.addEventListener('mousemove', (event) => {
            const rect = card.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width;
            const py = (event.clientY - rect.top) / rect.height;
            const rotateY = (px - 0.5) * 5;
            const rotateX = (0.5 - py) * 5;
            card.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg)';
        });
    });
}

function initMeshBackground() {
    const canvas = document.getElementById('mesh-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let pointerX = 0.5;
    let pointerY = 0.5;

    const blobs = [
        { x: 0.2, y: 0.26, r: 220, hue: 340, speed: 0.0006 },
        { x: 0.78, y: 0.2, r: 180, hue: 210, speed: 0.00045 },
        { x: 0.56, y: 0.72, r: 210, hue: 28, speed: 0.00052 }
    ];

    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    window.addEventListener('mousemove', (event) => {
        pointerX = event.clientX / width;
        pointerY = event.clientY / height;
    });

    const draw = (time) => {
        ctx.clearRect(0, 0, width, height);

        blobs.forEach((blob, index) => {
            const t = time * blob.speed + index * 2.2;
            const offsetX = Math.sin(t) * 42 + (pointerX - 0.5) * 34;
            const offsetY = Math.cos(t * 1.15) * 34 + (pointerY - 0.5) * 26;

            const x = blob.x * width + offsetX;
            const y = blob.y * height + offsetY;
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, blob.r);

            gradient.addColorStop(0, `hsla(${blob.hue}, 85%, 72%, 0.22)`);
            gradient.addColorStop(1, `hsla(${blob.hue}, 85%, 72%, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, blob.r, 0, Math.PI * 2);
            ctx.fill();
        });

        meshAnimationId = requestAnimationFrame(draw);
    };

    if (meshAnimationId) cancelAnimationFrame(meshAnimationId);
    meshAnimationId = requestAnimationFrame(draw);
}

function openSheet(sheetId) {
    const sheet = document.getElementById(sheetId);
    const overlay = document.getElementById('sheet-overlay');
    if (!sheet || !overlay) return;

    sheet.classList.add('open');
    overlay.style.display = 'block';
    setTimeout(() => { overlay.style.opacity = '1'; }, 10);
}

function closeSheet(sheetId) {
    const sheet = document.getElementById(sheetId);
    if (sheet) sheet.classList.remove('open');
    closeOverlay();
}

function closeAllSheets() {
    document.querySelectorAll('.bottom-sheet').forEach((sheet) => sheet.classList.remove('open'));
    closeOverlay();
}

function closeOverlay() {
    const overlay = document.getElementById('sheet-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function initOrRefreshMap() {
    if (!loveMap) {
        loveMap = L.map('interactive-map').setView([35.86166, 104.195397], 4);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(loveMap);

        markerLayer = L.layerGroup().addTo(loveMap);

        loveMap.on('click', async (e) => {
            await promptAddFromMap(e.latlng.lat, e.latlng.lng);
        });
    }

    loveMap.invalidateSize();
}

async function loadFootprintMarkers() {
    if (!loveMap || !markerLayer) return;

    try {
        const res = await fetch('/api/footprints');
        const json = await res.json();
        footprintCache = Array.isArray(json.data) ? json.data : [];

        markerLayer.clearLayers();
        footprintCache.forEach((item) => {
            if (!item.lat || !item.lng) return;
            const marker = L.marker([item.lat, item.lng]).addTo(markerLayer);
            marker.on('click', () => viewFootprint(item.id));
        });

        renderFootprintList();
        updateOverviewPanel();
    } catch (e) {
        console.error('加载地图图钉失败', e);
    }
}

function renderFootprintList() {
    const container = document.getElementById('footprint-list');
    if (!container) return;

    if (!footprintCache.length) {
        container.innerHTML = '<div class="empty-state">还没有足迹，点击右下角 + 开始记录第一站吧。</div>';
        return;
    }

    container.innerHTML = footprintCache.slice(0, 8).map((item) => {
        const photoCount = Array.isArray(item.photo_urls) ? item.photo_urls.length : 0;
        return `
            <div class="footprint-item story-card" onclick="viewFootprint(${item.id})">
                <div>
                    <h4>${escapeHtml(item.city)}</h4>
                    <p>${escapeHtml((item.memory || '').slice(0, 45))}${(item.memory || '').length > 45 ? '...' : ''}</p>
                </div>
                <span>${photoCount}图</span>
            </div>
        `;
    }).join('');
}

function viewFootprint(id) {
    const item = footprintCache.find((entry) => entry.id === id);
    if (!item) return;

    const title = document.getElementById('sheet-title');
    const date = document.getElementById('sheet-date');
    const desc = document.getElementById('sheet-desc');
    const photos = document.getElementById('sheet-photos');
    const editBtn = document.getElementById('edit-footprint-btn');
    const deleteBtn = document.getElementById('delete-footprint-btn');

    if (title) title.textContent = `📍 ${item.city}`;
    if (date) date.textContent = `记录时间：${formatDate(item.date)}`;
    if (desc) desc.textContent = item.memory || '这段回忆还没有文字描述。';

    const urls = Array.isArray(item.photo_urls) ? item.photo_urls : [];
    lightboxImages = urls;

    if (photos) {
        if (!urls.length) {
            photos.innerHTML = '<div class="empty-album">这座城市还没有上传照片</div>';
        } else {
            photos.innerHTML = urls.map((url, index) =>
                `<img src="${escapeHtml(url)}" alt="城市回忆照片" class="album-photo" onclick="openLightbox(${index})">`
            ).join('');
        }
    }

    if (editBtn) editBtn.onclick = () => editFootprint(id);
    if (deleteBtn) deleteBtn.onclick = () => deleteFootprint(id);

    openSheet('bottom-sheet');
}

function openLightbox(index) {
    if (!lightboxImages.length) return;
    lightboxIndex = Math.max(0, Math.min(index, lightboxImages.length - 1));

    const lightbox = document.getElementById('photo-lightbox');
    if (!lightbox) return;

    lightbox.classList.add('open');
    updateLightbox();
}

function updateLightbox() {
    const image = document.getElementById('lightbox-image');
    const caption = document.getElementById('lightbox-caption');
    if (!image || !caption || !lightboxImages.length) return;

    image.src = lightboxImages[lightboxIndex];
    caption.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
}

function closeLightbox(event) {
    const lightbox = document.getElementById('photo-lightbox');
    if (!lightbox) return;

    if (event) {
        event.stopPropagation();
        const target = event.target;
        const closeButton = target.classList && target.classList.contains('lightbox-close');
        const overlay = target.id === 'photo-lightbox';
        if (!closeButton && !overlay) return;
    }

    lightbox.classList.remove('open');
}

function navigateLightbox(step, event) {
    if (event) event.stopPropagation();
    if (!lightboxImages.length) return;

    lightboxIndex = (lightboxIndex + step + lightboxImages.length) % lightboxImages.length;
    updateLightbox();
}

function resetFootprintForm() {
    const idInput = document.getElementById('editing-footprint-id');
    const city = document.getElementById('new-city');
    const memory = document.getElementById('new-memory');
    const lat = document.getElementById('new-lat');
    const lng = document.getElementById('new-lng');
    const photos = document.getElementById('new-photos');
    const photoPreview = document.getElementById('new-photos-preview');
    const title = document.getElementById('add-modal-title');

    if (idInput) idInput.value = '';
    if (city) city.value = '';
    if (memory) memory.value = '';
    if (lat) lat.value = '';
    if (lng) lng.value = '';
    if (photos) {
        photos.value = '';
        photos.dataset.existing = '[]';
    }
    if (photoPreview) photoPreview.textContent = '未选择新图片，编辑时将保留原照片。';
    if (title) title.textContent = '添加新足迹';
}

function showAddFootprint() {
    resetFootprintForm();
    openSheet('add-modal');
}

function editFootprint(id) {
    const item = footprintCache.find((entry) => entry.id === id);
    if (!item) return;

    closeSheet('bottom-sheet');

    document.getElementById('editing-footprint-id').value = String(item.id);
    document.getElementById('new-city').value = item.city || '';
    document.getElementById('new-memory').value = item.memory || '';
    document.getElementById('new-lat').value = item.lat || '';
    document.getElementById('new-lng').value = item.lng || '';
    const photosInput = document.getElementById('new-photos');
    const photoPreview = document.getElementById('new-photos-preview');
    if (photosInput) {
        photosInput.value = '';
        photosInput.dataset.existing = JSON.stringify(item.photo_urls || []);
    }
    if (photoPreview) {
        const count = Array.isArray(item.photo_urls) ? item.photo_urls.length : 0;
        photoPreview.textContent = count ? `已存在 ${count} 张图片，不上传新图则继续保留。` : '当前没有历史图片，可上传新图。';
    }

    const title = document.getElementById('add-modal-title');
    if (title) title.textContent = '编辑足迹';

    openSheet('add-modal');
}

async function promptAddFromMap(lat, lng) {
    resetFootprintForm();

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`);
        const data = await res.json();
        let cityName = '';
        if (data && data.address) {
            cityName = data.address.city || data.address.town || data.address.village || data.address.state || '神秘地点';
        }

        document.getElementById('new-city').value = cityName;
    } catch (e) {
        console.error('地址解析失败', e);
    }

    document.getElementById('new-lat').value = String(lat);
    document.getElementById('new-lng').value = String(lng);

    openSheet('add-modal');
}

async function submitFootprint() {
    const id = document.getElementById('editing-footprint-id').value;
    const city = document.getElementById('new-city').value.trim();
    const memory = document.getElementById('new-memory').value.trim();
    const lat = document.getElementById('new-lat').value.trim();
    const lng = document.getElementById('new-lng').value.trim();
    const photosInput = document.getElementById('new-photos');

    if (!city || !memory) {
        alert('城市和回忆都不能留白哦！');
        return;
    }

    if (!lat || !lng) {
        alert('请先在地图上点击准确位置后再保存，避免图钉偏移。');
        return;
    }

    const btn = document.getElementById('save-btn');
    btn.textContent = id ? '更新中...' : '保存中...';
    btn.disabled = true;

    try {
        const url = id ? `/api/footprints/${id}` : '/api/footprints';
        const method = id ? 'PUT' : 'POST';
        const formData = new FormData();

        formData.append('city', city);
        formData.append('memory', memory);
        formData.append('date', new Date().toISOString());
        formData.append('lat', lat);
        formData.append('lng', lng);

        if (photosInput && photosInput.dataset.existing) {
            formData.append('photo_urls', photosInput.dataset.existing);
        }
        if (photosInput && photosInput.files) {
            Array.from(photosInput.files).forEach((file) => {
                formData.append('photos', file);
            });
        }

        const res = await fetch(url, {
            method,
            body: formData
        });

        if (!res.ok) throw new Error('保存失败');

        closeAllSheets();
        await loadFootprintMarkers();
        if (loveMap && lat && lng) {
            loveMap.flyTo([Number(lat), Number(lng)], 7);
        }
    } catch (e) {
        console.error('保存失败', e);
        alert('保存失败，请稍后再试。');
    } finally {
        btn.textContent = '保存记忆';
        btn.disabled = false;
    }
}

async function deleteFootprint(id) {
    const item = footprintCache.find((entry) => entry.id === id);
    if (!item) return;
    if (!confirm(`确定删除 ${item.city} 的这条足迹吗？`)) return;

    try {
        const res = await fetch(`/api/footprints/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');

        closeAllSheets();
        await loadFootprintMarkers();
    } catch (e) {
        console.error('删除失败', e);
        alert('删除失败，请稍后再试。');
    }
}

function switchBucketTab(tab, element) {
    activeBucketTab = tab;
    document.querySelectorAll('#list .tab-btn').forEach((btn) => btn.classList.remove('active'));
    if (element) element.classList.add('active');
    renderBucketList();
}

async function loadBucketList() {
    try {
        const res = await fetch('/api/bucket_list');
        const json = await res.json();
        bucketCache = Array.isArray(json.data) ? json.data : [];
        renderBucketList();
        updateOverviewPanel();
    } catch (e) {
        console.error('加载清单失败', e);
    }
}

function renderBucketList() {
    const container = document.getElementById('bucket-content');
    if (!container) return;

    const total = bucketCache.length;
    const doneCount = bucketCache.filter((item) => Number(item.is_completed) === 1).length;
    const progressText = document.getElementById('list-progress-text');
    const progressFill = document.getElementById('list-progress-fill');
    const progressNote = document.getElementById('list-progress-note');
    const percent = total ? Math.round((doneCount / total) * 100) : 0;

    if (progressText) progressText.textContent = `${doneCount}/${total}`;
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressNote) {
        progressNote.textContent = total
            ? `已经完成 ${doneCount} 件小事，继续把日子拍成电影。`
            : '先写下第一件想一起做的小事。';
    }

    const list = bucketCache.filter((item) => {
        const completed = Number(item.is_completed) === 1;
        return activeBucketTab === 'done' ? completed : !completed;
    });

    if (!list.length) {
        container.innerHTML = `<div class="empty-state">${activeBucketTab === 'done' ? '还没有已完成的小事，继续加油。' : '清单是空的，快添加第一条吧。'}</div>`;
        return;
    }

    container.innerHTML = list.map((item) => {
        const completed = Number(item.is_completed) === 1;
        return `
            <div class="bucket-card story-card ${completed ? 'bucket-done' : ''}">
                <div class="bucket-info">
                    <h4>${escapeHtml(item.title)}</h4>
                    <p>${escapeHtml(item.note || (completed ? `完成于 ${formatDate(item.completed_date)}` : '等待完成'))}</p>
                </div>
                <div class="bucket-actions">
                    <button class="mini-btn" onclick="toggleBucket(${item.id})">${completed ? '回退' : '完成'}</button>
                    <button class="mini-btn" onclick="editBucket(${item.id})">编辑</button>
                    <button class="mini-btn danger" onclick="deleteBucket(${item.id})">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

async function addBucketItem() {
    const titleInput = document.getElementById('bucket-title');
    const noteInput = document.getElementById('bucket-note');

    const title = titleInput.value.trim();
    const note = noteInput.value.trim();

    if (!title) {
        alert('请先输入清单内容。');
        return;
    }

    try {
        const res = await fetch('/api/bucket_list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, note })
        });

        if (!res.ok) throw new Error('创建失败');

        titleInput.value = '';
        noteInput.value = '';
        await loadBucketList();
    } catch (e) {
        console.error('添加清单失败', e);
        alert('添加失败，请稍后再试。');
    }
}

async function toggleBucket(id) {
    try {
        const res = await fetch(`/api/bucket_list/${id}/toggle`, { method: 'PATCH' });
        if (!res.ok) throw new Error('切换失败');
        await loadBucketList();
    } catch (e) {
        console.error('切换失败', e);
        alert('切换状态失败。');
    }
}

async function editBucket(id) {
    const item = bucketCache.find((entry) => entry.id === id);
    if (!item) return;

    const title = prompt('编辑清单标题：', item.title || '');
    if (title === null) return;

    const note = prompt('编辑补充说明：', item.note || '');
    if (note === null) return;

    try {
        const res = await fetch(`/api/bucket_list/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title.trim(),
                note: note.trim(),
                is_completed: Number(item.is_completed) === 1
            })
        });

        if (!res.ok) throw new Error('更新失败');
        await loadBucketList();
    } catch (e) {
        console.error('更新失败', e);
        alert('编辑失败，请稍后再试。');
    }
}

async function deleteBucket(id) {
    if (!confirm('确定删除这条清单吗？')) return;

    try {
        const res = await fetch(`/api/bucket_list/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        await loadBucketList();
    } catch (e) {
        console.error('删除失败', e);
        alert('删除失败，请稍后再试。');
    }
}

async function submitTreeHole() {
    const msg = document.getElementById('hole-msg').value.trim();
    const date = document.getElementById('hole-date').value;
    if (!msg) {
        alert('不能寄送空信件哦！');
        return;
    }

    try {
        const res = await fetch('/api/tree_hole', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, unlock_date: date || null })
        });

        if (!res.ok) throw new Error('投递失败');

        document.getElementById('hole-msg').value = '';
        document.getElementById('hole-date').value = '';
        await loadTreeHole();
    } catch (e) {
        console.error('投递失败', e);
        alert('投递失败，请稍后再试。');
    }
}

async function loadTreeHole() {
    try {
        const res = await fetch('/api/tree_hole');
        const json = await res.json();
        const container = document.getElementById('letters-container');

        const data = Array.isArray(json.data) ? json.data : [];
        treeHoleCache = data;
        updateOverviewPanel();

        const now = new Date();
        if (!container) return;

        if (!data.length) {
            container.innerHTML = '<div class="empty-state">邮局里还没有信件哦。</div>';
            return;
        }

        container.innerHTML = data.map((letter) => {
            const locked = letter.unlock_date && new Date(letter.unlock_date) > now;

            if (locked) {
                return `
                    <div class="letter letter-locked story-card">
                        <div>🔒 待解封</div>
                        <small>解封日期：${escapeHtml(formatDateOnly(letter.unlock_date))}</small>
                    </div>
                `;
            }

            return `
                <div class="letter story-card">
                    <p>${escapeHtml(letter.message)}</p>
                    <small>${escapeHtml(formatDate(letter.created_at))}</small>
                    <div class="letter-actions">
                        <button class="mini-btn" onclick="editLetter(${letter.id})">编辑</button>
                        <button class="mini-btn danger" onclick="deleteLetter(${letter.id})">删除</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('读取信件失败', e);
    }
}

async function editLetter(id) {
    const letter = treeHoleCache.find((item) => item.id === id);
    if (!letter) return;

    const newMessage = prompt('编辑信件内容：', letter.message || '');
    if (newMessage === null) return;

    const newUnlockDate = prompt('编辑解封日期(YYYY-MM-DD，可留空)：', letter.unlock_date || '');
    if (newUnlockDate === null) return;

    try {
        const res = await fetch(`/api/tree_hole/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: newMessage.trim(),
                unlock_date: newUnlockDate.trim() || null
            })
        });

        if (!res.ok) throw new Error('更新失败');
        await loadTreeHole();
    } catch (e) {
        console.error('更新失败', e);
        alert('编辑失败，请稍后再试。');
    }
}

async function deleteLetter(id) {
    if (!confirm('确定删除这封信吗？')) return;

    try {
        const res = await fetch(`/api/tree_hole/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        await loadTreeHole();
    } catch (e) {
        console.error('删除失败', e);
        alert('删除失败，请稍后再试。');
    }
}

function renderDailyCheckins() {
    const container = document.getElementById('daily-list');
    if (!container) return;

    if (!dailyCheckinCache.length) {
        container.innerHTML = '<div class="empty-state">这一天还没有记录，写下第一条吧。</div>';
        return;
    }

    container.innerHTML = dailyCheckinCache.map((item) => `
        <div class="bucket-card story-card daily-entry-card">
            <div class="bucket-info">
                <h4>${escapeHtml(item.checkin_date)}</h4>
                <p>${escapeHtml(item.content)}</p>
            </div>
            <div class="bucket-actions">
                <button class="mini-btn" onclick="editDailyCheckin(${item.id})">编辑</button>
                <button class="mini-btn danger" onclick="deleteDailyCheckin(${item.id})">删除</button>
            </div>
        </div>
    `).join('');
}

async function loadDailyCheckins() {
    const dateInput = document.getElementById('daily-date');
    if (!selectedCheckinDate) selectedCheckinDate = getTodayDateText();

    const date = dateInput && dateInput.value ? dateInput.value : selectedCheckinDate;
    selectedCheckinDate = date;
    if (dateInput && dateInput.value !== date) dateInput.value = date;

    try {
        const res = await fetch(`/api/daily_checkins?date=${encodeURIComponent(date)}`);
        const json = await res.json();
        dailyCheckinCache = Array.isArray(json.data) ? json.data : [];
        renderDailyCheckins();
    } catch (e) {
        console.error('加载每日打卡失败', e);
    }
}

async function addDailyCheckin() {
    const dateInput = document.getElementById('daily-date');
    const contentInput = document.getElementById('daily-content');
    const date = dateInput ? dateInput.value : selectedCheckinDate;
    const content = contentInput ? contentInput.value.trim() : '';

    if (!date) {
        alert('请选择打卡日期。');
        return;
    }
    if (!content) {
        alert('请输入打卡内容。');
        return;
    }

    try {
        const res = await fetch('/api/daily_checkins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkin_date: date, content })
        });
        if (!res.ok) throw new Error('保存失败');

        if (contentInput) contentInput.value = '';
        selectedCheckinDate = date;
        await loadDailyCheckins();
    } catch (e) {
        console.error('保存打卡失败', e);
        alert('保存打卡失败，请稍后再试。');
    }
}

async function editDailyCheckin(id) {
    const item = dailyCheckinCache.find((entry) => entry.id === id);
    if (!item) return;

    const content = prompt('编辑打卡内容：', item.content || '');
    if (content === null) return;

    try {
        const res = await fetch(`/api/daily_checkins/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                checkin_date: item.checkin_date,
                content: content.trim()
            })
        });
        if (!res.ok) throw new Error('更新失败');
        await loadDailyCheckins();
    } catch (e) {
        console.error('编辑打卡失败', e);
        alert('编辑打卡失败，请稍后再试。');
    }
}

async function deleteDailyCheckin(id) {
    if (!confirm('确定删除这条打卡吗？')) return;

    try {
        const res = await fetch(`/api/daily_checkins/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        await loadDailyCheckins();
    } catch (e) {
        console.error('删除打卡失败', e);
        alert('删除打卡失败，请稍后再试。');
    }
}

function renderWishPool() {
    const container = document.getElementById('wish-list');
    if (!container) return;

    if (!wishPoolCache.length) {
        container.innerHTML = '<div class="empty-state">许愿池还空着，写下第一个愿望吧。</div>';
        return;
    }

    container.innerHTML = wishPoolCache.map((item) => {
        const fulfilled = item.status === 'fulfilled';
        return `
            <div class="bucket-card story-card wish-entry-card ${fulfilled ? 'bucket-done' : ''}">
                <div class="bucket-info">
                    <h4>${escapeHtml(item.title)} <span class="wish-status ${fulfilled ? 'done' : 'active'}">${fulfilled ? '已实现' : '进行中'}</span></h4>
                    <p>${escapeHtml(item.content || '写下愿望，等它实现。')}</p>
                </div>
                <div class="bucket-actions">
                    <button class="mini-btn" onclick="toggleWish(${item.id})">${fulfilled ? '设为进行中' : '标记实现'}</button>
                    <button class="mini-btn" onclick="editWish(${item.id})">编辑</button>
                    <button class="mini-btn danger" onclick="deleteWish(${item.id})">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadWishPool() {
    try {
        const res = await fetch('/api/wish_pool');
        const json = await res.json();
        wishPoolCache = Array.isArray(json.data) ? json.data : [];
        renderWishPool();
    } catch (e) {
        console.error('加载许愿池失败', e);
    }
}

async function addWish() {
    const titleInput = document.getElementById('wish-title');
    const contentInput = document.getElementById('wish-content');
    const title = titleInput ? titleInput.value.trim() : '';
    const content = contentInput ? contentInput.value.trim() : '';

    if (!title) {
        alert('请先输入愿望标题。');
        return;
    }

    try {
        const res = await fetch('/api/wish_pool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });
        if (!res.ok) throw new Error('创建失败');

        if (titleInput) titleInput.value = '';
        if (contentInput) contentInput.value = '';
        await loadWishPool();
    } catch (e) {
        console.error('添加愿望失败', e);
        alert('添加愿望失败，请稍后再试。');
    }
}

async function editWish(id) {
    const item = wishPoolCache.find((entry) => entry.id === id);
    if (!item) return;

    const title = prompt('编辑愿望标题：', item.title || '');
    if (title === null) return;

    const content = prompt('编辑愿望内容：', item.content || '');
    if (content === null) return;

    try {
        const res = await fetch(`/api/wish_pool/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title.trim(),
                content: content.trim(),
                status: item.status
            })
        });
        if (!res.ok) throw new Error('更新失败');
        await loadWishPool();
    } catch (e) {
        console.error('编辑愿望失败', e);
        alert('编辑愿望失败，请稍后再试。');
    }
}

async function toggleWish(id) {
    try {
        const res = await fetch(`/api/wish_pool/${id}/toggle`, { method: 'PATCH' });
        if (!res.ok) throw new Error('状态切换失败');
        await loadWishPool();
    } catch (e) {
        console.error('切换愿望状态失败', e);
        alert('切换愿望状态失败，请稍后再试。');
    }
}

async function deleteWish(id) {
    if (!confirm('确定删除这个愿望吗？')) return;

    try {
        const res = await fetch(`/api/wish_pool/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        await loadWishPool();
    } catch (e) {
        console.error('删除愿望失败', e);
        alert('删除愿望失败，请稍后再试。');
    }
}

function openAnniversaryOpening() {
    const overlay = document.getElementById('anniversary-opening');
    if (!overlay) return;

    overlay.classList.add('open');
    document.body.classList.add('opening-active');
}

function closeAnniversaryOpening() {
    const overlay = document.getElementById('anniversary-opening');
    if (!overlay) return;

    overlay.classList.remove('open', 'playing');
    document.body.classList.remove('opening-active');
}

async function startOpeningSequence() {
    const overlay = document.getElementById('anniversary-opening');
    if (!overlay) return;

    // Play inside direct click gesture to avoid autoplay policy blocking.
    const annAudio = getAnniversaryAudio();
    if (annAudio) {
        await ensureAnniversaryAudioSource();

        if (annAudio.src && annAudio.paused) {
            annAudio.play().then(() => {
                updateMusicButtons();
            }).catch((err) => {
                console.warn('开场自动播放失败', formatAudioError(err));
            });
        }
    }

    overlay.classList.add('playing');

    setTimeout(() => {
        closeAnniversaryOpening();
        switchTab('anniversary', null);

        const siteAudio = getSiteAudio();
        if (siteAudio && !siteAudio.paused) siteAudio.pause();
    }, 1800);
}

function renderAnniversarySlide() {
    const container = document.getElementById('anniversary-slide');
    const indicator = document.getElementById('anniversary-page-indicator');
    if (!container || !indicator) return;

    if (!anniversarySlides.length) {
        container.innerHTML = `
            <div class="anniversary-slide-content" style="height: 100%; justify-content: center; text-align: center;">
                <h3>三周年主片待创作</h3>
                <p>先在下方添加第一页内容吧。</p>
            </div>
        `;
        indicator.textContent = '0 / 0';
        return;
    }

    anniversaryIndex = Math.max(0, Math.min(anniversaryIndex, anniversarySlides.length - 1));
    const slide = anniversarySlides[anniversaryIndex];

    const imagePart = slide.image_url
        ? `<div class="anniversary-slide-image" style="background-image: url('${escapeHtml(slide.image_url)}');"></div>`
        : '<div class="anniversary-slide-image"></div>';

    container.innerHTML = `
        ${imagePart}
        <div class="anniversary-slide-content">
            <h3>${escapeHtml(slide.title)}</h3>
            <p>${escapeHtml(slide.content)}</p>
        </div>
    `;

    indicator.textContent = `${anniversaryIndex + 1} / ${anniversarySlides.length}`;
}

function renderAnniversaryList() {
    const list = document.getElementById('anniversary-list');
    if (!list) return;

    if (!anniversarySlides.length) {
        list.innerHTML = '<div class="empty-state">还没有回顾页面，先添加第一张吧。</div>';
        return;
    }

    list.innerHTML = anniversarySlides.map((slide, index) => `
        <div class="ann-item story-card">
            <div>
                <h4>${index + 1}. ${escapeHtml(slide.title)}</h4>
                <small>排序: ${slide.sort_order} · ${slide.image_url ? '含图片' : '无图片'}</small>
            </div>
            <div class="ann-item-actions">
                <button class="mini-btn" onclick="previewAnniversarySlide(${index})">预览</button>
                <button class="mini-btn" onclick="editAnniversarySlide(${slide.id})">编辑</button>
                <button class="mini-btn danger" onclick="deleteAnniversarySlide(${slide.id})">删除</button>
            </div>
        </div>
    `).join('');
}

function renderPicturePicker() {
    const container = document.getElementById('picture-picker');
    if (!container) return;

    if (!mediaLibrary.pictures.length) {
        container.innerHTML = '<div class="empty-state">未读取到 pictures 中的图片。</div>';
        return;
    }

    container.innerHTML = mediaLibrary.pictures.map((item) => `
        <div class="picture-thumb" data-url="${escapeHtml(item.url)}" style="background-image: url('${escapeHtml(item.url)}');" onclick="selectPicture(this.dataset.url)"></div>
    `).join('');
}

function selectPicture(url) {
    const imageInput = document.getElementById('ann-slide-image');
    if (imageInput) imageInput.value = url || '';
}

async function loadMediaLibrary() {
    try {
        const res = await fetch('/api/media/library');
        const json = await res.json();
        mediaLibrary = json.data || { music: [], pictures: [] };

        const savedSiteTrackUrl = localStorage.getItem('siteMusicSelectedUrl') || '';
        const siteTrack = mediaLibrary.music.find((m) => normalizeMediaUrl(m.url) === normalizeMediaUrl(savedSiteTrackUrl))
            || mediaLibrary.music.find((m) => m.name.includes('樱花泪'))
            || mediaLibrary.music[0];
        const anniversaryTrack = mediaLibrary.music.find((m) => m.name.includes('一次就好'));

        if (siteTrack) {
            siteMusicUrl = siteTrack.url;
            localStorage.setItem('siteMusicSelectedUrl', siteMusicUrl);
            const siteAudio = getSiteAudio();
            if (siteAudio && !siteAudio.src) siteAudio.src = siteMusicUrl;
        }

        if (anniversaryTrack) {
            const fallback = anniversaryTrack.url;
            if (!anniversaryMusicUrl || anniversaryMusicUrl.includes('example.com')) {
                anniversaryMusicUrl = fallback;

                const musicInput = document.getElementById('music-url');
                if (musicInput) musicInput.value = fallback;

                const annAudio = getAnniversaryAudio();
                if (annAudio) annAudio.src = fallback;

                await fetch('/api/anniversary/settings/music', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ music_url: fallback })
                });
            }
        }

        renderPicturePicker();
        renderSiteMusicList();
        updateSiteMusicButton();
    } catch (e) {
        console.error('加载媒体库失败', e);
    }
}

async function loadAnniversarySlides() {
    try {
        const res = await fetch('/api/anniversary/slides');
        const json = await res.json();
        anniversarySlides = Array.isArray(json.data) ? json.data : [];

        renderAnniversarySlide();
        renderAnniversaryList();
    } catch (e) {
        console.error('加载三周年回顾失败', e);
    }
}

async function loadAnniversarySettings() {
    try {
        const res = await fetch('/api/anniversary/settings');
        const json = await res.json();

        anniversaryMusicUrl = (json.data && json.data.music_url) || '';

        const input = document.getElementById('music-url');
        if (input) input.value = anniversaryMusicUrl;

        const audio = getAnniversaryAudio();
        if (audio && anniversaryMusicUrl) {
            audio.src = anniversaryMusicUrl;
        }

        updateMusicButtons();
    } catch (e) {
        console.error('加载三周年设置失败', e);
    }
}

async function saveMusicSettings() {
    const input = document.getElementById('music-url');
    const musicUrl = input ? input.value.trim() : '';

    try {
        const res = await fetch('/api/anniversary/settings/music', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ music_url: musicUrl })
        });

        if (!res.ok) throw new Error('保存失败');

        anniversaryMusicUrl = musicUrl;

        const audio = getAnniversaryAudio();
        if (audio) {
            audio.src = anniversaryMusicUrl;
            audio.load();
        }

        alert('背景音乐已保存。');
        updateMusicButtons();
    } catch (e) {
        console.error('保存背景音乐失败', e);
        alert('保存失败，请稍后再试。');
    }
}

function previewAnniversarySlide(index) {
    anniversaryIndex = index;
    renderAnniversarySlide();
}

function changeAnniversarySlide(step) {
    if (!anniversarySlides.length) return;
    anniversaryIndex = (anniversaryIndex + step + anniversarySlides.length) % anniversarySlides.length;
    renderAnniversarySlide();
}

function resetAnniversaryForm() {
    const id = document.getElementById('ann-slide-id');
    const title = document.getElementById('ann-slide-title');
    const content = document.getElementById('ann-slide-content');
    const image = document.getElementById('ann-slide-image');
    const order = document.getElementById('ann-slide-order');
    const saveBtn = document.getElementById('ann-save-btn');

    if (id) id.value = '';
    if (title) title.value = '';
    if (content) content.value = '';
    if (image) image.value = '';
    if (order) order.value = '0';
    if (saveBtn) saveBtn.textContent = '保存页面';
}

function editAnniversarySlide(id) {
    const slide = anniversarySlides.find((item) => item.id === id);
    if (!slide) return;

    document.getElementById('ann-slide-id').value = String(slide.id);
    document.getElementById('ann-slide-title').value = slide.title || '';
    document.getElementById('ann-slide-content').value = slide.content || '';
    document.getElementById('ann-slide-image').value = slide.image_url || '';
    document.getElementById('ann-slide-order').value = String(slide.sort_order || 0);

    const saveBtn = document.getElementById('ann-save-btn');
    if (saveBtn) saveBtn.textContent = '更新页面';
}

async function saveAnniversarySlide() {
    const id = document.getElementById('ann-slide-id').value;
    const title = document.getElementById('ann-slide-title').value.trim();
    const content = document.getElementById('ann-slide-content').value.trim();
    const image_url = document.getElementById('ann-slide-image').value.trim();
    const sort_order = Number(document.getElementById('ann-slide-order').value || 0);

    if (!title || !content) {
        alert('标题和正文不能为空。');
        return;
    }

    const payload = { title, content, image_url, sort_order };

    try {
        const res = await fetch(id ? `/api/anniversary/slides/${id}` : '/api/anniversary/slides', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('保存失败');
        resetAnniversaryForm();
        await loadAnniversarySlides();
    } catch (e) {
        console.error('保存三周年页面失败', e);
        alert('保存失败，请稍后再试。');
    }
}

async function deleteAnniversarySlide(id) {
    if (!confirm('确定删除这一页回顾吗？')) return;

    try {
        const res = await fetch(`/api/anniversary/slides/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        await loadAnniversarySlides();
    } catch (e) {
        console.error('删除三周年页面失败', e);
        alert('删除失败，请稍后再试。');
    }
}

function bindEvents() {
    const addBtn = document.getElementById('bucket-add-btn');
    if (addBtn) addBtn.addEventListener('click', addBucketItem);

    const photosInput = document.getElementById('new-photos');
    const photosPreview = document.getElementById('new-photos-preview');
    if (photosInput && photosPreview) {
        photosInput.addEventListener('change', () => {
            const count = photosInput.files ? photosInput.files.length : 0;
            photosPreview.textContent = count ? `已选择 ${count} 张新图片。` : '未选择新图片，编辑时将保留原照片。';
        });
    }

    const dailyAddBtn = document.getElementById('daily-add-btn');
    if (dailyAddBtn) dailyAddBtn.addEventListener('click', addDailyCheckin);

    const dailyDateInput = document.getElementById('daily-date');
    if (dailyDateInput) {
        dailyDateInput.value = getTodayDateText();
        selectedCheckinDate = dailyDateInput.value;
        dailyDateInput.addEventListener('change', () => {
            selectedCheckinDate = dailyDateInput.value || getTodayDateText();
            loadDailyCheckins();
        });
    }

    const wishAddBtn = document.getElementById('wish-add-btn');
    if (wishAddBtn) wishAddBtn.addEventListener('click', addWish);
}

function initApp() {
    startSakuraEffect();
    setInterval(updateTimer, 1000);
    updateTimer();

    initScrollProgress();
    initCursorGlow();
    initCardTilt();
    initMeshBackground();
    initRevealAnimation();

    bindEvents();

    initOrRefreshMap();
    loadFootprintMarkers();
    loadBucketList();
    loadTreeHole();
    loadDailyCheckins();
    loadWishPool();

    loadAnniversarySlides();
    loadAnniversarySettings();
    loadMediaLibrary();

    const annAudio = getAnniversaryAudio();
    const siteAudio = getSiteAudio();
    const volumeSlider = document.getElementById('music-volume');

    if (annAudio) {
        const savedVolume = Number(localStorage.getItem('anniversaryMusicVolume'));
        const savedMuted = localStorage.getItem('anniversaryMusicMuted') === 'true';

        annAudio.volume = Number.isFinite(savedVolume) ? savedVolume : 0.6;
        annAudio.muted = savedMuted;
        if (volumeSlider) volumeSlider.value = String(annAudio.volume);

        annAudio.addEventListener('play', updateMusicButtons);
        annAudio.addEventListener('pause', updateMusicButtons);
    }

    if (siteAudio) {
        const savedSiteVolume = Number(localStorage.getItem('siteMusicVolume'));
        siteAudio.volume = Number.isFinite(savedSiteVolume) ? savedSiteVolume : 0.42;

        siteAudio.addEventListener('play', updateSiteMusicButton);
        siteAudio.addEventListener('pause', updateSiteMusicButton);
        siteAudio.addEventListener('volumechange', () => {
            localStorage.setItem('siteMusicVolume', String(siteAudio.volume));
        });
    }

    document.addEventListener('keydown', (event) => {
        const isLightboxOpen = document.getElementById('photo-lightbox')?.classList.contains('open');
        if (isLightboxOpen) {
            if (event.key === 'ArrowLeft') navigateLightbox(-1);
            if (event.key === 'ArrowRight') navigateLightbox(1);
            if (event.key === 'Escape') closeLightbox();
        }
    });
}

initApp();
