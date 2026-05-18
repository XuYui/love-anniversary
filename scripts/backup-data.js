const fs = require('fs');
const path = require('path');

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function resolveRuntimePaths() {
    const root = path.resolve(__dirname, '..');
    const dataDir = path.resolve(process.env.DATA_DIR || root);

    return {
        root,
        backupDir: path.resolve(process.env.BACKUP_DIR || path.join(root, 'backups', timestamp())),
        dbPath: path.resolve(process.env.DB_PATH || path.join(dataDir, 'memory.db')),
        musicDir: path.resolve(process.env.MUSIC_DIR || path.join(dataDir, 'music')),
        picturesDir: path.resolve(process.env.PICTURES_DIR || path.join(dataDir, 'pictures'))
    };
}

function copyIfExists(source, target) {
    if (!fs.existsSync(source)) return false;

    const stat = fs.statSync(source);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    if (stat.isDirectory()) {
        fs.cpSync(source, target, { recursive: true });
    } else {
        fs.copyFileSync(source, target);
    }

    return true;
}

const paths = resolveRuntimePaths();
fs.mkdirSync(paths.backupDir, { recursive: true });

const copied = [
    ['database', paths.dbPath, path.join(paths.backupDir, 'memory.db')],
    ['music', paths.musicDir, path.join(paths.backupDir, 'music')],
    ['pictures', paths.picturesDir, path.join(paths.backupDir, 'pictures')]
].filter(([, source, target]) => copyIfExists(source, target));

console.log(`Backup created: ${paths.backupDir}`);
console.log(`Copied: ${copied.map(([name]) => name).join(', ') || 'nothing'}`);
