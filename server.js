
// Friday Night Web server with automatic Base Game and Mod song detection.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const SONGS_DIR = path.join(ROOT, 'songs');
const MODS_DIR = path.join(ROOT, 'mods', 'songs');
const ARROWSKINS_DIR = path.join(ROOT, 'arrowskins');

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
};

function findFile(files, name) {
    return files.find(file =>
        file.toLowerCase() === name.toLowerCase()
    );
}

function makeTitle(name) {
    return name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function readOldSongs(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data.songs || [];
    } catch (err) {
        console.warn('Could not read old song metadata:', filePath);
        return [];
    }
}

// Find chart JSON files anywhere inside a song folder.
// Keep their relative paths so charts inside "data" can still load.
function findChartsRecursive(songPath) {
    const charts = [];

    function search(directory) {
        if (!fs.existsSync(directory)) return;

        const entries = fs.readdirSync(directory, {
            withFileTypes: true
        });

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                search(fullPath);
                continue;
            }

            if (!entry.isFile()) continue;

            const lower = entry.name.toLowerCase();

            if (
                !lower.endsWith('.json') ||
                ['song.json', 'metadata.json', 'songs.json'].includes(lower)
            ) {
                continue;
            }

            const relativePath = path.relative(songPath, fullPath)
                .split(path.sep)
                .join('/');

            charts.push(relativePath);
        }
    }

    search(songPath);
    return charts;
}

function makeCharts(chartFiles) {
    const charts = {};

    for (const file of chartFiles) {
        const baseName = path.basename(file, '.json');

        const match = baseName.match(
            /(?:^|[-_])(easy|normal|hard|erect|nightmare|mania)$/i
        );

        const difficulty = match
            ? match[1].toLowerCase()
            : chartFiles.length === 1
                ? 'normal'
                : baseName.toLowerCase();

        charts[difficulty] = file;
    }

    return charts;
}

// Scan folders recursively.
// A song is identified by its Inst.ogg file.
// Its chart files can be directly inside it or in subfolders like "data".
function scanSongFolder(folderPath, folderURL, oldSongs, modName = null) {
    if (!fs.existsSync(folderPath)) return [];

    const songs = [];

    function scanDirectory(directory, directoryURL) {
        const entries = fs.readdirSync(directory, {
            withFileTypes: true
        });

        const files = entries
            .filter(entry => entry.isFile())
            .map(entry => entry.name);
            console.log("CHECKING FOLDER:", directoryURL);
            console.log("FILES:", files);

        const inst = findFile(files, 'Inst.ogg');

        if (inst) {
            const chartFiles = findChartsRecursive(directory);

            if (chartFiles.length === 0) {
                console.warn(`Skipping ${directoryURL}: no chart JSON found.`);
                return;
            }

            const oldEntry = oldSongs.find(song =>
                song.folder &&
                song.folder.toLowerCase() === directoryURL.toLowerCase()
            );

            const charts = makeCharts(chartFiles);

            const opponent =
                findFile(files, 'Voices-Oppenent.ogg') ||
                findFile(files, 'Voices-Opponent.ogg');

            const player = findFile(files, 'Voices-Player.ogg');
            const shared = findFile(files, 'Voices.ogg');

            const voices = {};

            if (opponent) voices.opponent = opponent;
            if (player) voices.player = player;
            if (shared) voices.default = shared;

            const song = {
                title: oldEntry?.title || makeTitle(path.basename(directory)),
                folder: directoryURL,
                icon: oldEntry?.icon || modName?.toLowerCase() || 'dad',
                charts,
                inst,
                ...(Object.keys(voices).length ? { voices } : {})
            };

            // Preserve extra character metadata from an existing entry.
            if (oldEntry?.player2) {
                song.player2 = oldEntry.player2;
            } else if (modName) {
                song.player2 = modName.toLowerCase();
            }

            if (modName) {
                song.mod = oldEntry?.mod || modName;
            }

            songs.push(song);

            // Do not scan inside a song as if its subfolders were separate songs.
            return;
        }

        // This isn't a song folder yet. Check its subfolders.
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            scanDirectory(
                path.join(directory, entry.name),
                `${directoryURL}/${entry.name}`
            );
        }
    }

    scanDirectory(folderPath, folderURL);

    return songs;
}

function scanBaseSongs() {
    const oldSongs = readOldSongs(
        path.join(SONGS_DIR, 'songs.json')
    );

    return scanSongFolder(
        SONGS_DIR,
        'songs',
        oldSongs
    );
}

function scanModSongs() {
    if (!fs.existsSync(MODS_DIR)) return [];

    const songs = [];

    // Curated metadata lives in mods/songs/songs.json (title, icon, player2, mod).
    const modSongs = readOldSongs(path.join(MODS_DIR, 'songs.json'));

    const modFolders = fs.readdirSync(MODS_DIR, {
        withFileTypes: true
    });

    for (const mod of modFolders) {
        if (!mod.isDirectory()) continue;

        const modName = mod.name;
        const modPath = path.join(MODS_DIR, modName);
        const modURL = `mods/songs/${modName}`;

        const oldSongs = modSongs.filter(song =>
            song.folder && song.folder.toLowerCase().startsWith(modURL.toLowerCase())
        );

        const foundSongs = scanSongFolder(
            modPath,
            modURL,
            oldSongs,
            modName
        );
        console.log(`Scanning mod: ${modName}`);
        console.log('Found songs:', foundSongs.map(song => song.folder));
        songs.push(...foundSongs);
    }

    return songs;
}

function scanArrowSkins() {
    if (!fs.existsSync(ARROWSKINS_DIR)) return [];

    return fs.readdirSync(ARROWSKINS_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !name.startsWith('.'))
        .sort((a, b) => a.localeCompare(b));
}

http.createServer((req, res) => {
    let urlPath;

    try {
        urlPath = decodeURIComponent(
            new URL(req.url, 'http://localhost').pathname
        );
    } catch {
        res.writeHead(400);
        return res.end('Bad request');
    }

    // Base Game song list.
    if (urlPath === '/songs/songs.json') {
        try {
            const songs = scanBaseSongs();

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            });

            return res.end(JSON.stringify({ songs }, null, 2));
        } catch (err) {
            console.error('Base song scanning failed:', err);
            res.writeHead(500);
            return res.end('Could not scan base songs');
        }
    }

    // Mod song list.
    if (urlPath === '/mods/songs/songs.json') {
        try {
            const songs = scanModSongs();

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            });

            return res.end(JSON.stringify({ songs }, null, 2));
        } catch (err) {
            console.error('Mod song scanning failed:', err);
            res.writeHead(500);
            return res.end('Could not scan mod songs');
        }
    }

    // Arrow skin list (folders under arrowskins/).
    if (urlPath === '/arrowskins/skins.json') {
        try {
            const skins = scanArrowSkins();
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            });
            return res.end(JSON.stringify({ skins }, null, 2));
        } catch (err) {
            console.error('Arrow skin scanning failed:', err);
            res.writeHead(500);
            return res.end('Could not scan arrow skins');
        }
    }

    if (urlPath.endsWith('/')) {
        urlPath += 'index.html';
    }

    const file = path.resolve(ROOT, `.${urlPath}`);

    if (
        file !== ROOT &&
        !file.startsWith(ROOT + path.sep)
    ) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end('Not found');
        }

        res.writeHead(200, {
            'Content-Type':
                TYPES[path.extname(file).toLowerCase()] ||
                'application/octet-stream',
            'Cache-Control': 'no-cache'
        });

        res.end(data);
    });

}).listen(PORT, () => {
    console.log(`Friday Night Web running at http://localhost:${PORT}`);
    console.log('Game folder:', ROOT);
    console.log('Normal songs:', SONGS_DIR);
    console.log('Mod songs:', MODS_DIR);

    console.log('\nDetected Base Game songs:');
    for (const song of scanBaseSongs()) {
        console.log(' -', song.title, '|', song.folder);
    }

    console.log('\nDetected Mod songs:');
    for (const song of scanModSongs()) {
        console.log(' -', song.title, '|', song.folder);
    }

    console.log('\nDetected Arrow skins:');
    for (const skin of scanArrowSkins()) {
        console.log(' -', skin);
    }
});
