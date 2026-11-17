# Bones & Brine — turns a screencast (frames + timestamps from tools/record) into a silent MP4 preview video,
# opening on the static cover (CrazyGames asks for that). Runs in Blender, which has FFmpeg built in:
#   blender --background --factory-startup --python tools/encode_preview.py -- <framesdir> <cover.png> <out.mp4> <w> <h> [seconds]
import bpy, os, sys, shutil

argv = sys.argv[sys.argv.index('--') + 1:]
src, cover, out, W, H = argv[0], argv[1], argv[2], int(argv[3]), int(argv[4])
MAX_S = float(argv[5]) if len(argv) > 5 else 19.5
FPS, COVER_S = 30, 1.2

# frames.txt: "<timestamp> <file>" (the timestamp may use a decimal comma)
rows = []
for line in open(os.path.join(src, 'frames.txt'), encoding='utf-8-sig'):
    p = line.split()
    if len(p) == 2:
        rows.append((float(p[0].replace(',', '.')), p[1]))
rows.sort()
t0 = rows[0][0]

seq_dir = os.path.join(src, 'seq'); shutil.rmtree(seq_dir, ignore_errors=True); os.makedirs(seq_dir)
names = []
def put(path):
    n = 's_%05d%s' % (len(names) + 1, os.path.splitext(path)[1])
    shutil.copyfile(path, os.path.join(seq_dir, n)); names.append(n)

for _ in range(int(COVER_S * FPS)):                      # the static cover as the opening frames
    put(cover)
k, t, end = 0, 0.0, min(rows[-1][0] - t0, MAX_S - COVER_S)
while t <= end:                                          # constant frame rate: latest captured frame at each tick
    while k + 1 < len(rows) and rows[k + 1][0] - t0 <= t:
        k += 1
    put(os.path.join(src, rows[k][1]))
    t += 1.0 / FPS

scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = W, H, 100
scene.render.fps = FPS
ed = scene.sequence_editor_create()
strips = ed.strips if hasattr(ed, 'strips') else ed.sequences      # (an empty collection is falsy, so no 'or' here)
s = strips.new_image('preview', os.path.join(seq_dir, names[0]), 1, 1, fit_method='FIT')
for n in names[1:]:
    s.elements.append(n)
scene.frame_start, scene.frame_end = 1, len(names)

ims = scene.render.image_settings
try:
    ims.media_type = 'VIDEO'
except Exception:
    pass
ims.file_format = 'FFMPEG'
ff = scene.render.ffmpeg
ff.format, ff.codec = 'MPEG4', 'H264'
try:
    ff.constant_rate_factor = 'HIGH'
except Exception:
    pass
ff.audio_codec = 'NONE'
scene.render.filepath = out
bpy.ops.render.render(animation=True)
print('preview video:', out, len(names), 'frames')
