# Takes the game's two forks out of a StuffIt archive of the Disk Copy 4.2 image
# (or out of the image itself) and dumps its resources:
#   python3 -I tools/extract.py <shufflepuck_cafe_1.0_dc42.sit | image.dsk | image.img> <outdir>
# Writes <outdir>/app/rsrc.bin, <outdir>/app/data.bin and <outdir>/res/<TYPE>/<id>.bin.
# Needs `unar` (for a .sit) and the `machfs` Python package.
import os, sys, subprocess, tempfile, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import machfs
from rsrc import read_rsrc

src, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, 'app'), exist_ok=True)

if src.lower().endswith('.sit'):
    tmp = tempfile.mkdtemp()
    subprocess.check_call(['unar', '-q', '-o', tmp, src])
    imgs = [os.path.join(r, f) for r, _, fs in os.walk(tmp) for f in fs if not f.endswith('.rsrc')]
    imgs.sort(key=lambda p: -os.path.getsize(p))
    src = imgs[0]
d = open(src, 'rb').read()
# Disk Copy 4.2: 84-byte header (name, data size, tag size ...) then the disk's 512-byte blocks
if len(d) > 84 and struct.unpack('>I', d[64:68])[0] == 819200: d = d[84:84 + 819200]
v = machfs.Volume(); v.read(d)
app = None
def walk(folder):
    global app
    for name, obj in folder.items():
        if isinstance(obj, machfs.Folder): walk(obj)
        elif obj.type == b'APPL' and obj.creator == b'PUCK': app = obj
walk(v)
if app is None: sys.exit('no Shufflepuck Café application on the volume')
open(os.path.join(out, 'app', 'rsrc.bin'), 'wb').write(app.rsrc)
open(os.path.join(out, 'app', 'data.bin'), 'wb').write(app.data)
res = read_rsrc(os.path.join(out, 'app', 'rsrc.bin'))
n = 0
for t, items in res.items():
    tdir = os.path.join(out, 'res', t.replace(' ', '_').replace('#', 'num')); os.makedirs(tdir, exist_ok=True)
    for rid, r in items.items():
        open(os.path.join(tdir, '%d.bin' % rid), 'wb').write(r['data']); n += 1
print('application forks: %d data, %d resource bytes; %d resources dumped' % (len(app.data), len(app.rsrc), n))
