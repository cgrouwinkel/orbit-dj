#!/usr/bin/env python3
"""ORBIT DJ build: produces the Netlify upload ZIP, a standalone single-file HTML, and a source bundle.

Usage:  python3 tools/build.py            (run from the repo root; output goes to dist/)
No dependencies beyond the Python standard library. Not needed by the site owner — the ZIP in
dist/ is what gets uploaded to Netlify.
"""
import base64, json, os, re, shutil, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
SITE_FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'README.txt']
SITE_DIRS = ['css', 'js', 'icons', 'samples', 'sounds', 'tracks']
JS_ORDER = ['util.js', 'sounds-manifest.js', 'tracks-manifest.js', 'engine.js', 'assets.js', 'music.js', 'game.js', 'beatpad.js', 'decks.js', 'school.js', 'ui.js', 'mixui.js']


def version():
    src = open(os.path.join(ROOT, 'js', 'util.js'), encoding='utf-8').read()
    return re.search(r"O\.VERSION = '([^']+)'", src).group(1)


def check_versions(v):
    sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
    if f"'orbit-v{v}'" not in sw:
        sys.exit(f'sw.js cache VERSION does not match util.js ({v}). Bump both together.')


def zip_dir(src_dir, zip_path, prefix=''):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(src_dir):
            dirs.sort()
            for f in sorted(files):
                if f.startswith('.') or f == '.DS_Store':
                    continue
                full = os.path.join(base, f)
                rel = os.path.relpath(full, src_dir)
                z.write(full, os.path.join(prefix, rel))


def build_site(v):
    site = os.path.join(DIST, 'site')
    shutil.rmtree(site, ignore_errors=True)
    os.makedirs(site)
    for f in SITE_FILES:
        shutil.copy2(os.path.join(ROOT, f), site)
    for d in SITE_DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(site, d))
    out = os.path.join(DIST, f'ORBIT-DJ-v{v}-netlify.zip')
    zip_dir(site, out)
    return site, out


def build_standalone(v):
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    css = open(os.path.join(ROOT, 'css', 'orbit.css'), encoding='utf-8').read()
    js = '\n'.join(open(os.path.join(ROOT, 'js', f), encoding='utf-8').read() for f in JS_ORDER)
    samples = {}
    for top in ('samples', 'sounds'):
        for base, _, files in os.walk(os.path.join(ROOT, top)):
            for f in sorted(files):
                if f.endswith('.wav'):
                    rel = os.path.relpath(os.path.join(base, f), ROOT).replace(os.sep, '/')
                    samples[rel] = base64.b64encode(open(os.path.join(base, f), 'rb').read()).decode('ascii')
    tracks = {'tracks/' + f: base64.b64encode(open(os.path.join(ROOT, 'tracks', f), 'rb').read()).decode('ascii') for f in sorted(os.listdir(os.path.join(ROOT, 'tracks'))) if f.endswith('.mp3')}
    icon = base64.b64encode(open(os.path.join(ROOT, 'icons', 'apple-touch-icon.png'), 'rb').read()).decode('ascii')
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
    html = html.replace('href="icons/apple-touch-icon.png"', f'href="data:image/png;base64,{icon}"')
    html = html.replace('href="icons/icon-192.png"', f'href="data:image/png;base64,{icon}"')
    html = html.replace('<link rel="stylesheet" href="css/orbit.css">', '<style>\n' + css + '\n</style>')
    scripts = re.compile(r'<script src="js/[a-z-]+\.js"></script>\n?')
    first = scripts.search(html)
    html = scripts.sub('', html)
    inline = ('<script>window.ORBIT_STANDALONE = true;\nwindow.ORBIT_EMBEDDED_SAMPLES = ' + json.dumps(samples) + ';\nwindow.ORBIT_EMBEDDED_TRACKS = ' + json.dumps(tracks) + ';</script>\n'
              '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n')
    html = html[:first.start()] + inline + html[first.start():]
    out = os.path.join(DIST, f'ORBIT-DJ-v{v}-standalone.html')
    open(out, 'w', encoding='utf-8').write(html)
    return out


def build_source(v):
    out = os.path.join(DIST, f'ORBIT-DJ-v{v}-source.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(ROOT):
            dirs[:] = sorted(d for d in dirs if d not in ('dist', 'node_modules', '.git'))
            for f in sorted(files):
                if f.startswith('.'):
                    continue
                full = os.path.join(base, f)
                z.write(full, os.path.join(f'ORBIT-DJ-v{v}-source', os.path.relpath(full, ROOT)))
    return out


if __name__ == '__main__':
    v = version()
    check_versions(v)
    os.makedirs(DIST, exist_ok=True)
    site, netlify_zip = build_site(v)
    standalone = build_standalone(v)
    source = build_source(v)
    with zipfile.ZipFile(netlify_zip) as z:
        names = z.namelist()
    assert 'index.html' in names, 'index.html must be at the ZIP root'
    assert sum(n.startswith('samples/') for n in names) == 48, 'expected 48 v1 chop samples'
    assert sum(n.startswith('sounds/') and n.endswith('.wav') for n in names) == 112, 'expected 112 sounds'
    assert sum(n.startswith('tracks/') and n.endswith('.mp3') for n in names) == 7, 'expected 7 deck tracks'
    for p in (netlify_zip, standalone, source):
        print(f'{os.path.relpath(p, ROOT)}  {os.path.getsize(p) / 1024:.0f} KB')
