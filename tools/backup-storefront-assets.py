"""Download versioned storefront assets, or restore a manifest into a new directory."""
import datetime
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path.home() / 'Library/Application Support/VELUM/ArchivosTienda'
API = 'https://savzjanpydyjtrgdkllx.supabase.co'
BUCKET = 'storefront-assets'
BLOBS = ROOT / 'contenido'
MANIFESTS = ROOT / 'inventarios'


def inventory(token):
    headers = {'apikey': (ROOT / 'api-publica').read_text().strip(),
               'x-velum-inventory': token, 'Content-Type': 'application/json'}
    req = Request(API + '/rest/v1/rpc/storefront_asset_backup_inventory', data=b'{}', headers=headers)
    with urlopen(req, timeout=30) as response:
        rows = json.load(response)
    if not isinstance(rows, list):
        raise ValueError('Respuesta de inventario inválida')
    return rows


def file_digest(path):
    with path.open('rb') as source:
        h = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def safe_name(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or str(path) != name or path == PurePosixPath('.'):
        raise ValueError('Ruta de objeto inválida')
    return path


def blob(sha):
    if not re.fullmatch('[0-9a-f]{64}', sha):
        raise ValueError('Huella de archivo inválida')
    return BLOBS / sha


def download(row):
    url = API + '/storage/v1/object/public/' + BUCKET + '/' + quote(row['name']) + '?version=' + quote(row['version'], safe='')
    etag = row['etag'].strip('"')
    with tempfile.TemporaryDirectory(dir=BLOBS) as tmp:
        part = Path(tmp) / 'descarga'
        with part.open('wb') as out, urlopen(url, timeout=90) as response:
            if response.headers.get('ETag', '').strip('"') != etag:
                raise ValueError('La versión servida difiere del inventario')
            shutil.copyfileobj(response, out)
            out.flush()
            os.fsync(out.fileno())
        if part.stat().st_size != row['size']:
            raise ValueError('Tamaño de descarga incorrecto')
        sha = file_digest(part)
        target = blob(sha)
        if not target.is_file() or file_digest(target) != sha:
            os.replace(part, target)
        return sha


def backup():
    token = subprocess.check_output(['/usr/bin/security', 'find-generic-password', '-s',
                                     'app.myvelum.inventario-tienda', '-a', 'respaldo', '-w']).decode().rstrip('\n')
    BLOBS.mkdir(exist_ok=True)
    MANIFESTS.mkdir(exist_ok=True)
    rows = inventory(token)
    previous = sorted(MANIFESTS.glob('*.json'))
    last = json.loads(previous[-1].read_text()) if previous else []
    by_name = {r['name']: r for r in last}
    result = []
    for row in rows:
        safe_name(row['name'])
        prior = by_name.get(row['name'])
        if prior and all(prior.get(k) == v for k, v in row.items()):
            sha = prior['sha256']
            path = blob(sha)
            if not path.is_file() or file_digest(path) != sha:
                sha = download(row)
        else:
            sha = download(row)
        result.append(dict(row, sha256=sha))
    if inventory(token) != rows:
        raise RuntimeError('El inventario cambió durante la copia. Reintenta.')
    if not previous or result != last:
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        with tempfile.NamedTemporaryFile(mode='w', dir=MANIFESTS, delete=False) as out:
            json.dump(result, out, ensure_ascii=False)
            out.flush()
            os.fsync(out.fileno())
        os.replace(out.name, MANIFESTS / (stamp + '.json'))
    print(datetime.datetime.now().isoformat(timespec='seconds'), len(rows), 'archivos verificados', flush=True)


def restore(manifest, destination):
    rows = json.loads(manifest.read_text())
    if destination.exists():
        raise ValueError('El destino de recuperación debe ser nuevo')
    with tempfile.TemporaryDirectory(dir=destination.parent) as tmp:
        tree = Path(tmp) / 'tienda'
        tree.mkdir()
        for row in rows:
            target = tree / safe_name(row['name'])
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as out, blob(row['sha256']).open('rb') as source:
                shutil.copyfileobj(source, out)
            if target.stat().st_size != row['size'] or file_digest(target) != row['sha256']:
                raise ValueError('Falló la comprobación de integridad')
        tree.rename(destination)
    print(len(rows), 'archivos recuperados y verificados')


if __name__ == '__main__':
    os.umask(0o077)
    if len(sys.argv) == 1:
        with (ROOT / '.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            backup()
    elif len(sys.argv) == 4 and sys.argv[1] == 'restore':
        restore(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        raise SystemExit('Uso: backup-storefront-assets.py [restore INVENTARIO DESTINO_NUEVO]')
