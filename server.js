const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'memory.db'));
const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(DATA_DIR, 'music'));
const PICTURES_DIR = path.resolve(process.env.PICTURES_DIR || path.join(DATA_DIR, 'pictures'));
const footprintUploadDir = path.join(PICTURES_DIR, 'footprints');
const MUSIC_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
const PICTURE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(PICTURES_DIR, { recursive: true });
fs.mkdirSync(footprintUploadDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/music', express.static(MUSIC_DIR));
app.use('/pictures', express.static(PICTURES_DIR));

const footprintStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, footprintUploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safeExt = ext || '.jpg';
        cb(null, `footprint-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    }
});

const uploadFootprintPhotos = multer({
    storage: footprintStorage,
    limits: { fileSize: 8 * 1024 * 1024, files: 12 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
            return;
        }
        cb(new Error('仅支持图片文件上传'));
    }
});

// 初始化 SQLite 数据库
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error(err.message);
    console.log(`已连接到恋爱记忆数据库：${DB_PATH}`);
});

function parsePhotoUrls(photoUrlsText, fallbackPhotoUrl) {
    if (photoUrlsText) {
        try {
            const parsed = JSON.parse(photoUrlsText);
            if (Array.isArray(parsed)) {
                return parsed.filter(Boolean);
            }
        } catch (e) {
            // Ignore invalid historical data and fall back below.
        }
    }

    if (fallbackPhotoUrl) return [fallbackPhotoUrl];
    return [];
}

function normalizeFootprint(row) {
    const photo_urls = parsePhotoUrls(row.photo_urls, row.photo_url);
    return {
        ...row,
        photo_urls
    };
}

function safeReadDir(dirPath) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);
    } catch (e) {
        return [];
    }
}

function safeReadMediaFiles(dirPath, extensions) {
    return safeReadDir(dirPath)
        .filter((name) => extensions.has(path.extname(name).toLowerCase()));
}

function getFileMTimeMs(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return Number(stat.mtimeMs) || 0;
    } catch (e) {
        return 0;
    }
}

function parsePhotoUrlsInput(input) {
    if (Array.isArray(input)) {
        return input.map((item) => String(item || '').trim()).filter(Boolean);
    }

    if (typeof input !== 'string') return [];

    const raw = input.trim();
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
    } catch (e) {
        // Fall back to line-based parsing for plain text input.
    }

    return raw
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function getUploadedPhotoUrls(files) {
    if (!Array.isArray(files)) return [];
    return files.map((file) => `/pictures/footprints/${encodeURIComponent(file.filename)}`);
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

// 创建与更新数据表
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS footprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        city TEXT NOT NULL,
        date TEXT,
        memory TEXT,
        photo_url TEXT
    )`);

    db.run(`ALTER TABLE footprints ADD COLUMN lat REAL`, () => {});
    db.run(`ALTER TABLE footprints ADD COLUMN lng REAL`, () => {});
    db.run(`ALTER TABLE footprints ADD COLUMN photo_urls TEXT DEFAULT '[]'`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS bucket_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        is_completed BOOLEAN DEFAULT 0,
        completed_date TEXT,
        photo_url TEXT
    )`);

    db.run(`ALTER TABLE bucket_list ADD COLUMN note TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE bucket_list ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS tree_hole (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        unlock_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkin_date TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS wish_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS anniversary_slides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS anniversary_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    db.get(`SELECT key FROM anniversary_settings WHERE key = 'music_url'`, [], (err, row) => {
        if (!err && !row) {
            db.run(`INSERT INTO anniversary_settings (key, value) VALUES ('music_url', '')`);
        }
    });
});

// --- API 接口 ---
app.get('/api/footprints', (req, res) => {
    db.all("SELECT * FROM footprints ORDER BY date DESC, id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({data: rows.map(normalizeFootprint)});
    });
});

app.post('/api/footprints', uploadFootprintPhotos.array('photos', 12), (req, res) => {
    const { city, memory, date, photo_url, photo_urls, lat, lng } = req.body;
    if (!city || !memory) {
        return res.status(400).json({ error: 'city 和 memory 不能为空' });
    }

    const uploadedPhotoUrls = getUploadedPhotoUrls(req.files);
    const inputPhotoUrls = parsePhotoUrlsInput(photo_urls);
    const normalizedPhotoUrls = uploadedPhotoUrls.length
        ? uploadedPhotoUrls.concat(inputPhotoUrls)
        : (inputPhotoUrls.length ? inputPhotoUrls : parsePhotoUrls(null, photo_url));

    db.run(
        `INSERT INTO footprints (city, memory, date, photo_url, photo_urls, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            city,
            memory,
            date || new Date().toISOString(),
            normalizedPhotoUrls[0] || photo_url || '',
            JSON.stringify(normalizedPhotoUrls),
            toNumber(lat, 0),
            toNumber(lng, 0)
        ],
        function(err) {
        if (err) return res.status(500).json({error: err.message});
        res.json({id: this.lastID, message: '足迹已记录'});
    });
});

app.put('/api/footprints/:id', uploadFootprintPhotos.array('photos', 12), (req, res) => {
    const { id } = req.params;
    const { city, memory, date, photo_url, photo_urls, lat, lng } = req.body;
    if (!city || !memory) {
        return res.status(400).json({ error: 'city 和 memory 不能为空' });
    }

    db.get(`SELECT photo_urls, photo_url FROM footprints WHERE id = ?`, [id], (findErr, row) => {
        if (findErr) return res.status(500).json({ error: findErr.message });
        if (!row) return res.status(404).json({ error: '足迹不存在' });

        const existingPhotoUrls = parsePhotoUrls(row.photo_urls, row.photo_url);
        const uploadedPhotoUrls = getUploadedPhotoUrls(req.files);
        const inputPhotoUrls = parsePhotoUrlsInput(photo_urls);

        let normalizedPhotoUrls = [];
        if (uploadedPhotoUrls.length) {
            normalizedPhotoUrls = uploadedPhotoUrls.concat(inputPhotoUrls);
        } else if (inputPhotoUrls.length) {
            normalizedPhotoUrls = inputPhotoUrls;
        } else {
            normalizedPhotoUrls = existingPhotoUrls;
        }

        db.run(
            `UPDATE footprints SET city = ?, memory = ?, date = ?, photo_url = ?, photo_urls = ?, lat = ?, lng = ? WHERE id = ?`,
            [
                city,
                memory,
                date || new Date().toISOString(),
                normalizedPhotoUrls[0] || photo_url || '',
                JSON.stringify(normalizedPhotoUrls),
                toNumber(lat, 0),
                toNumber(lng, 0),
                id
            ],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (!this.changes) return res.status(404).json({ error: '足迹不存在' });
                res.json({ message: '足迹已更新' });
            }
        );
    });
});

app.delete('/api/footprints/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM footprints WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: '足迹不存在' });
        res.json({ message: '足迹已删除' });
    });
});

app.get('/api/bucket_list', (req, res) => {
    db.all("SELECT * FROM bucket_list ORDER BY is_completed ASC, id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({data: rows});
    });
});

app.post('/api/bucket_list', (req, res) => {
    const { title, note } = req.body;
    if (!title) return res.status(400).json({ error: 'title 不能为空' });

    db.run(
        `INSERT INTO bucket_list (title, note, is_completed) VALUES (?, ?, 0)`,
        [title, note || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: '清单项已添加' });
        }
    );
});

app.put('/api/bucket_list/:id', (req, res) => {
    const { id } = req.params;
    const { title, note, is_completed } = req.body;
    if (!title) return res.status(400).json({ error: 'title 不能为空' });

    const completed = Number(Boolean(is_completed));
    const completedDate = completed ? new Date().toISOString() : null;

    db.run(
        `UPDATE bucket_list SET title = ?, note = ?, is_completed = ?, completed_date = ? WHERE id = ?`,
        [title, note || '', completed, completedDate, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: '清单项不存在' });
            res.json({ message: '清单项已更新' });
        }
    );
});

app.patch('/api/bucket_list/:id/toggle', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT is_completed FROM bucket_list WHERE id = ?`, [id], (findErr, row) => {
        if (findErr) return res.status(500).json({ error: findErr.message });
        if (!row) return res.status(404).json({ error: '清单项不存在' });

        const nextValue = row.is_completed ? 0 : 1;
        const completedDate = nextValue ? new Date().toISOString() : null;

        db.run(
            `UPDATE bucket_list SET is_completed = ?, completed_date = ? WHERE id = ?`,
            [nextValue, completedDate, id],
            function(updateErr) {
                if (updateErr) return res.status(500).json({ error: updateErr.message });
                res.json({ message: '状态已切换', is_completed: nextValue });
            }
        );
    });
});

app.delete('/api/bucket_list/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM bucket_list WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: '清单项不存在' });
        res.json({ message: '清单项已删除' });
    });
});

app.post('/api/tree_hole', (req, res) => {
    const { message, unlock_date } = req.body;
    db.run(`INSERT INTO tree_hole (message, unlock_date) VALUES (?, ?)`, 
        [message, unlock_date], function(err) {
        if (err) return res.status(500).json({error: err.message});
        res.json({id: this.lastID, message: '信件已投递'});
    });
});

app.get('/api/tree_hole', (req, res) => {
    db.all("SELECT * FROM tree_hole ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({data: rows});
    });
});

app.put('/api/tree_hole/:id', (req, res) => {
    const { id } = req.params;
    const { message, unlock_date } = req.body;
    if (!message) return res.status(400).json({ error: 'message 不能为空' });

    db.run(
        `UPDATE tree_hole SET message = ?, unlock_date = ? WHERE id = ?`,
        [message, unlock_date || null, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: '信件不存在' });
            res.json({ message: '信件已更新' });
        }
    );
});

app.delete('/api/tree_hole/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM tree_hole WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: '信件不存在' });
        res.json({ message: '信件已删除' });
    });
});

app.get('/api/anniversary/slides', (req, res) => {
    db.all(
        `SELECT * FROM anniversary_slides ORDER BY sort_order ASC, id ASC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        }
    );
});

app.post('/api/anniversary/slides', (req, res) => {
    const { title, content, image_url, sort_order } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'title 和 content 不能为空' });
    }

    db.run(
        `INSERT INTO anniversary_slides (title, content, image_url, sort_order) VALUES (?, ?, ?, ?)`,
        [title, content, image_url || '', Number.isFinite(sort_order) ? sort_order : 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: '回顾页已添加' });
        }
    );
});

app.put('/api/anniversary/slides/:id', (req, res) => {
    const { id } = req.params;
    const { title, content, image_url, sort_order } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'title 和 content 不能为空' });
    }

    db.run(
        `UPDATE anniversary_slides SET title = ?, content = ?, image_url = ?, sort_order = ? WHERE id = ?`,
        [title, content, image_url || '', Number.isFinite(sort_order) ? sort_order : 0, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: '回顾页不存在' });
            res.json({ message: '回顾页已更新' });
        }
    );
});

app.delete('/api/anniversary/slides/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM anniversary_slides WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: '回顾页不存在' });
        res.json({ message: '回顾页已删除' });
    });
});

app.get('/api/anniversary/settings', (req, res) => {
    db.get(`SELECT value FROM anniversary_settings WHERE key = 'music_url'`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: { music_url: row ? row.value : '' } });
    });
});

app.put('/api/anniversary/settings/music', (req, res) => {
    const { music_url } = req.body;

    db.run(
        `INSERT INTO anniversary_settings (key, value) VALUES ('music_url', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [music_url || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: '背景音乐已更新' });
        }
    );
});

app.get('/api/media/library', (req, res) => {
    const musicFiles = safeReadMediaFiles(MUSIC_DIR, MUSIC_EXTENSIONS);
    const pictureFiles = safeReadMediaFiles(PICTURES_DIR, PICTURE_EXTENSIONS);

    const music = musicFiles
        .map((name) => ({
            name,
            mtime_ms: getFileMTimeMs(path.join(MUSIC_DIR, name))
        }))
        .sort((a, b) => b.mtime_ms - a.mtime_ms)
        .map((item) => ({
            name: item.name,
            url: `/music/${encodeURIComponent(item.name)}`,
            mtime_ms: item.mtime_ms
        }));

    const pictures = pictureFiles.map((name) => ({
        name,
        url: `/pictures/${encodeURIComponent(name)}`
    }));

    res.json({ data: { music, pictures } });
});

app.listen(PORT, () => {
    console.log(`恋爱纪念服务器运行在 http://localhost:${PORT}`);
});

app.get('/api/daily_checkins', (req, res) => {
    const date = String(req.query.date || '').trim();
    if (!date) {
        return res.status(400).json({ error: 'date 不能为空，格式 YYYY-MM-DD' });
    }

    db.all(
        `SELECT * FROM daily_checkins WHERE checkin_date = ? ORDER BY id DESC`,
        [date],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        }
    );
});

app.post('/api/daily_checkins', (req, res) => {
    const { checkin_date, content } = req.body;
    if (!checkin_date || !content) {
        return res.status(400).json({ error: 'checkin_date 和 content 不能为空' });
    }

    db.run(
        `INSERT INTO daily_checkins (checkin_date, content) VALUES (?, ?)`,
        [checkin_date, content],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: '打卡已记录' });
        }
    );
});

app.put('/api/daily_checkins/:id', (req, res) => {
    const { id } = req.params;
    const { checkin_date, content } = req.body;
    if (!checkin_date || !content) {
        return res.status(400).json({ error: 'checkin_date 和 content 不能为空' });
    }

    db.run(
        `UPDATE daily_checkins SET checkin_date = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [checkin_date, content, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: '打卡记录不存在' });
            res.json({ message: '打卡已更新' });
        }
    );
});

app.delete('/api/daily_checkins/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM daily_checkins WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: '打卡记录不存在' });
        res.json({ message: '打卡记录已删除' });
    });
});

app.get('/api/wish_pool', (req, res) => {
    db.all(`SELECT * FROM wish_pool ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/wish_pool', (req, res) => {
    const { title, content } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'title 不能为空' });
    }

    db.run(
        `INSERT INTO wish_pool (title, content, status) VALUES (?, ?, 'active')`,
        [title, content || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: '愿望已加入许愿池' });
        }
    );
});

app.put('/api/wish_pool/:id', (req, res) => {
    const { id } = req.params;
    const { title, content, status } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'title 不能为空' });
    }

    const nextStatus = status === 'fulfilled' ? 'fulfilled' : 'active';
    db.run(
        `UPDATE wish_pool SET title = ?, content = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, content || '', nextStatus, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: '愿望不存在' });
            res.json({ message: '愿望已更新' });
        }
    );
});

app.patch('/api/wish_pool/:id/toggle', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT status FROM wish_pool WHERE id = ?`, [id], (findErr, row) => {
        if (findErr) return res.status(500).json({ error: findErr.message });
        if (!row) return res.status(404).json({ error: '愿望不存在' });

        const nextStatus = row.status === 'fulfilled' ? 'active' : 'fulfilled';
        db.run(
            `UPDATE wish_pool SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [nextStatus, id],
            function(updateErr) {
                if (updateErr) return res.status(500).json({ error: updateErr.message });
                res.json({ message: '愿望状态已更新', status: nextStatus });
            }
        );
    });
});

app.delete('/api/wish_pool/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM wish_pool WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: '愿望不存在' });
        res.json({ message: '愿望已删除' });
    });
});
