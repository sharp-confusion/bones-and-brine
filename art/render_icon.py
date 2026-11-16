"""
Renders the app icons (icons/icon-512.png, icons/icon-192.png) from models/pirates.glb.
    blender --background --factory-startup --python art/render_icon.py -- <project folder>
"""
import bpy, math, os, sys
from mathutils import Vector

root = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.getcwd()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.join(root, 'models', 'pirates.glb'))

SHOW = {'base_deckhand', 'hair_messy', 'hat_tricorn', 'top_captain', 'trinket_parrot', 'cos_eyepatch', 'cos_goldtooth'}
COLORS = {'Skin': '#e8b98f', 'SkinShade': '#c48e66', 'Hair': '#4a2c16', 'Cloth': '#8c2323', 'Hat': '#2b1d14'}

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

for ob in scene.objects:
    if ob.type == 'MESH':
        ob.hide_render = ob.name not in SHOW
for m in bpy.data.materials:
    if m.name in COLORS and m.node_tree:
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b:
            b.inputs['Base Color'].default_value = (*lin(COLORS[m.name]), 1)

cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2.45
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
cam.location = (0.7, -7, 1.95); cam.rotation_euler = (math.radians(87), 0, math.radians(6))
scene.camera = cam
for loc, e in (((-3, -4, 5), 700), ((4, -3, 2), 300), ((0, 4, 4), 400)):
    ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 4
    lo = bpy.data.objects.new('l', ld); lo.location = loc
    lo.rotation_euler = (Vector((0, 0, 1.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(lo)
world = bpy.data.worlds.new('w'); scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
bg = world.node_tree.nodes.get('Background')
bg.inputs[0].default_value = (*lin('#12324a'), 1); bg.inputs[1].default_value = 1.0
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
os.makedirs(os.path.join(root, 'icons'), exist_ok=True)
for size in (512, 192):
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.filepath = os.path.join(root, 'icons', f'icon-{size}.png')
    bpy.ops.render.render(write_still=True)
print('ICONS_DONE')
