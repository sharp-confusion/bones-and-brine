"""
Bones & Brine - pirate character builder for Blender (5.x).

Builds every customisable part as its own mesh object and exports one GLB that the
game loads (models/pirates.glb). Run headless:

    blender --background --factory-startup --python art/build_pirates.py -- <out.glb> [preview_dir]

Conventions (Blender space, Z up, faces look toward -Y; glTF export turns that into
Y-up / +Z-forward for three.js):
  * every object keeps its transform applied at the origin, so the game can simply
    toggle visibility to swap parts;
  * materials named Skin, SkinShade, Hair, Cloth, Hat are recoloured in-game.
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, Euler, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = globals().get('OUT') or (argv[0] if argv else os.path.join(os.getcwd(), 'pirates.glb'))
PREVIEW = globals().get('PREVIEW') or (argv[1] if len(argv) > 1 else None)
random.seed(7)

# --------------------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ROOT = bpy.data.collections.new('Pirates')
scene.collection.children.link(ROOT)

# --------------------------------------------------------------------------- materials
def hex_lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

MATS = {}
def mat(name, color, rough=0.65, metal=0.0, emit=0.0, alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*hex_lin(color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*hex_lin(color), 1)
        b.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    m.diffuse_color = (*hex_lin(color), alpha)
    MATS[name] = m
    return m

M = dict(
    Skin=mat('Skin', '#e8b98f'), SkinShade=mat('SkinShade', '#c48e66'),
    Hair=mat('Hair', '#4a2c16', 0.8), Cloth=mat('Cloth', '#8c2323', 0.85), Hat=mat('Hat', '#2b1d14', 0.85),
    Shirt=mat('Shirt', '#efe6d2', 0.9), Trim=mat('Trim', '#e2ad3f', 0.35, 0.9), Leather=mat('Leather', '#5a3519', 0.7),
    Dark=mat('Dark', '#1a1412', 0.6), EyeWhite=mat('EyeWhite', '#f7f3ea', 0.3), Pupil=mat('Pupil', '#141414', 0.2),
    Glow=mat('Glow', '#7dfcf0', 0.3, 0, 4.0), Red=mat('Red', '#c8273a', 0.5), Green=mat('Green', '#1f9e4f', 0.5),
    Yellow=mat('Yellow', '#f4c430', 0.5), Blue=mat('Blue', '#2268d1', 0.5), White=mat('White', '#f4f1ea', 0.5),
    Brass=mat('Brass', '#c99a3a', 0.3, 1.0), Steel=mat('Steel', '#b9c0c8', 0.25, 1.0), Wood=mat('Wood', '#7a4a24', 0.8),
    Scar=mat('Scar', '#a8474a', 0.7), Lip=mat('Lip', '#7a2e2e', 0.6), Teeth=mat('Teeth', '#f2ead8', 0.4),
    Meat=mat('Meat', '#8a3b25', 0.6), Fat=mat('Fat', '#f0d9b5', 0.6), Glass=mat('Glass', '#d8f0ff', 0.05, 0, 0, 0.35),
    Rum=mat('Rum', '#b8641a', 0.1, 0, 0, 0.85), Foam=mat('Foam', '#fff8e8', 0.9), Ember=mat('Ember', '#ff6a1a', 0.4, 0, 6.0),
    Paper=mat('Paper', '#f7f4ec', 0.8), Filter=mat('Filter', '#d99a4e', 0.8), Tobacco=mat('Tobacco', '#5e3a1c', 0.9),
)

# --------------------------------------------------------------------------- mesh builder
class Part:
    """Accumulates primitives into one mesh with several materials."""
    def __init__(self, name):
        self.name, self.bm, self.mats = name, bmesh.new(), []

    def add(self, bm, material, smooth=True):
        if material not in self.mats:
            self.mats.append(material)
        idx = self.mats.index(material)
        me = bpy.data.meshes.new('_tmp')
        bm.to_mesh(me); bm.free()
        n = len(self.bm.faces)
        self.bm.from_mesh(me)
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[n:]:
            f.material_index = idx
            f.smooth = smooth
        bpy.data.meshes.remove(me)
        return self

    def finish(self, coll):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me); self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        coll.objects.link(ob)
        return ob

def xf(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    m = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm

def sphere(loc, r, scale=(1, 1, 1), rot=(0, 0, 0), seg=24, rings=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return xf(bm, loc, rot, scale)

def cyl(loc, r1, r2, depth, rot=(0, 0, 0), scale=(1, 1, 1), seg=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
    return xf(bm, loc, rot, scale)

def box(loc, size, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    return xf(bm, loc, rot, size)

def torus(loc, R, r, rot=(0, 0, 0), scale=(1, 1, 1), seg=32, ring=10, arc=2 * math.pi):
    bm = bmesh.new()
    rows = []
    full = arc >= 2 * math.pi - 1e-6
    n = seg if full else seg + 1
    for i in range(n):
        a = arc * i / seg
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(seg):
        a, b2 = rows[i], rows[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((a[j], a[(j + 1) % ring], b2[(j + 1) % ring], b2[j]))
    return xf(bm, loc, rot, scale)

def cut(bm, co, no):
    """Keep the side of the plane the normal points to."""
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no).normalized(), clear_inner=True)
    return bm

def lumpy(bm, amp=0.03, freq=4.0, center=(0, 0, 0), seed=0):
    c = Vector(center)
    off = Vector((seed * 3.1, seed * 1.7, seed * 5.3))
    for v in bm.verts:
        d = (v.co - c)
        if d.length < 1e-6:
            continue
        v.co += d.normalized() * noise.noise(v.co * freq + off) * amp
    return bm

def chain(p0, p1, n, r0, r1, wobble=0.0):
    """Row of spheres, e.g. braids."""
    out = bmesh.new()
    p0, p1 = Vector(p0), Vector(p1)
    for i in range(n):
        t = i / (n - 1)
        p = p0.lerp(p1, t) + Vector((math.sin(t * 9) * wobble, 0, 0))
        s = sphere(p, r0 + (r1 - r0) * t, (1, 1, 0.8), seg=12, rings=8)
        me = bpy.data.meshes.new('_c'); s.to_mesh(me); s.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out

def merge(*bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('_m'); b.to_mesh(me); b.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out

def aim(bm_fn, base, tip, r1, r2, seg=12):
    """Cone from base to tip."""
    base, tip = Vector(base), Vector(tip)
    d = tip - base
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=d.length)
    m = Matrix.Translation((base + tip) / 2) @ q.to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm

# --------------------------------------------------------------------------- shared head
HC = Vector((0, 0, 1.55))          # head centre
HS = Vector((0.60, 0.57, 0.63))    # head radii
TOP = HC.z + HS.z                  # 2.18

def surf(x, z, off=0.0):
    """Point on the front of the head ellipsoid at (x, z), pushed `off` along the normal."""
    u, w = x / HS.x, (z - HC.z) / HS.z
    y = -HS.y * math.sqrt(max(0.0, 1 - u * u - w * w))
    p = Vector((x, y, z))
    n = Vector(((p.x - HC.x) / HS.x ** 2, (p.y - HC.y) / HS.y ** 2, (p.z - HC.z) / HS.z ** 2)).normalized()
    return p + n * off

def face_rot(x, z):
    """Rotation that makes a local -Y face the surface normal at (x, z)."""
    p = surf(x, z)
    n = Vector(((p.x - HC.x) / HS.x ** 2, (p.y - HC.y) / HS.y ** 2, (p.z - HC.z) / HS.z ** 2)).normalized()
    return Vector((0, -1, 0)).rotation_difference(n).to_euler()

def head(scale=(1, 1, 1)):
    s = Vector(scale)
    return sphere(HC, 1, (HS.x * s.x, HS.y * s.y, HS.z * s.z), seg=40, rings=28)

def tsurf(x, z, k=1.05, off=0.0):
    """Point on the front of the (clothed) torso at (x, z)."""
    c, R = Vector((0, 0, 0.42)), Vector((0.80 * k, 0.48 * k, 0.62 * k))
    u, w = x / R.x, (z - c.z) / R.z
    y = -R.y * math.sqrt(max(0.0, 1 - u * u - w * w))
    p = Vector((x, y, z))
    n = Vector((p.x / R.x ** 2, p.y / R.y ** 2, (p.z - c.z) / R.z ** 2)).normalized()
    return p + n * off

def torso(k=1.0, mat_bm=None):
    bm = sphere((0, 0, 0.42), 1, (0.80 * k, 0.48 * k, 0.62 * k), seg=36, rings=22)
    return cut(bm, (0, 0, 0.0), (0, 0, 1))

def smile(width=0.13, z=1.29, depth=0.035, r=0.024):
    pts = []
    for i in range(7):
        t = -1 + 2 * i / 6
        x = t * width
        pts.append(surf(x, z + 0.04 * t * t, 0.004))
    out = bmesh.new()
    for i in range(len(pts) - 1):
        b = aim(None, pts[i], pts[i + 1], r, r, 8)
        me = bpy.data.meshes.new('_s'); b.to_mesh(me); b.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out

def eyes(r=0.10, z=1.60, x=0.20, pupil=0.052, look=(0, 0)):
    whites = merge(*[sphere(surf(sx, z, -0.02), r, (1, 0.55, 1.1), face_rot(sx, z)) for sx in (-x, x)])
    pupils = merge(*[sphere(surf(sx + look[0], z + look[1], 0.035), pupil, (1, 0.5, 1.15), face_rot(sx, z)) for sx in (-x, x)])
    shines = merge(*[sphere(surf(sx + 0.022, z + 0.03, 0.05), pupil * 0.3, (1, 0.5, 1), face_rot(sx, z)) for sx in (-x, x)])
    return whites, pupils, shines

# --------------------------------------------------------------------------- bases
BASES = bpy.data.collections.new('bases'); ROOT.children.link(BASES)

def base_common(p, skin='Skin', ears=True, neck=True):
    p.add(torso(), M[skin])
    if neck:
        p.add(cyl((0, 0, 1.0), 0.2, 0.2, 0.3), M[skin])
    p.add(head(), M[skin])
    if ears:
        for sx in (-1, 1):
            p.add(sphere((sx * 0.6, 0.02, 1.53), 0.14, (0.45, 0.9, 1.15)), M[skin])
            p.add(sphere((sx * 0.63, 0.0, 1.53), 0.07, (0.3, 0.6, 0.8)), M['SkinShade'])

def brows(p, w=0.12, h=0.035, z=1.75, tilt=0.18, material='Hair', thick=0.04):
    for sx in (-1, 1):
        p.add(box(surf(sx * 0.2, z, 0.02), (w * 2, thick, h * 2), (0, sx * tilt, 0)), M[material])

# 1. Deckhand: young sailor
p = Part('base_deckhand'); base_common(p)
w, pu, sh = eyes(); p.add(w, M['EyeWhite']).add(pu, M['Pupil']).add(sh, M['White'])
brows(p)
p.add(sphere(surf(0, 1.46, 0.03), 0.085, (1, 1, 1.1)), M['Skin'])
p.add(smile(), M['Lip'])
for sx in (-1, 1):
    p.add(sphere(surf(sx * 0.33, 1.42, -0.01), 0.09, (1, 0.4, 0.8), face_rot(sx * 0.33, 1.42)), M['SkinShade'])
p.finish(BASES)

# 2. Old Salt: weathered veteran with a big nose and heavy brows
p = Part('base_oldsalt'); base_common(p)
w, pu, sh = eyes(r=0.085, z=1.6, pupil=0.045); p.add(w, M['EyeWhite']).add(pu, M['Pupil']).add(sh, M['White'])
brows(p, w=0.15, h=0.05, z=1.72, tilt=-0.15, thick=0.07)
p.add(sphere(surf(0, 1.45, 0.06), 0.15, (1, 1, 0.95)), M['Skin'])
p.add(sphere(surf(0, 1.47, 0.11), 0.06), M['SkinShade'])
for sx in (-1, 1):
    p.add(sphere(surf(sx * 0.3, 1.38, 0.0), 0.13, (1, 0.6, 0.85)), M['Skin'])
    p.add(torus(surf(sx * 0.2, 1.53, 0.0), 0.08, 0.012, face_rot(sx * 0.2, 1.53), (1, 1, 1), arc=math.pi, seg=12, ring=6), M['SkinShade'])
for z in (1.86, 1.92):
    p.add(box(surf(0, z, 0.0), (0.32, 0.02, 0.018)), M['SkinShade'])
p.add(smile(width=0.11, z=1.27), M['Lip'])
p.finish(BASES)

# 3. Bones: a skeleton pirate
p = Part('base_skeleton'); base_common(p, ears=False, neck=False)
for i in range(4):
    p.add(cyl((0, 0, 0.9 + i * 0.08), 0.13, 0.13, 0.05, seg=12), M['Skin'])
for sx in (-1, 1):
    p.add(sphere(surf(sx * 0.21, 1.6, -0.06), 0.15, (1, 0.5, 1.05), face_rot(sx * 0.21, 1.6)), M['Dark'])
    p.add(sphere(surf(sx * 0.21, 1.6, 0.0), 0.04, (1, 0.5, 1)), M['Glow'])
    p.add(sphere(surf(sx * 0.36, 1.45, 0.0), 0.1, (1, 0.5, 0.6)), M['Skin'])
p.add(sphere(surf(0, 1.46, -0.01), 0.05, (0.8, 0.5, 1.2)), M['Dark'])
for i in range(-3, 4):
    p.add(box(surf(i * 0.045, 1.3, 0.0), (0.038, 0.04, 0.07)), M['Teeth'])
p.add(box(surf(0, 1.3, -0.02), (0.36, 0.04, 0.012)), M['Dark'])
p.finish(BASES)

# 4. Fishfolk: sea creature with fin ears and big eyes
p = Part('base_fishfolk'); base_common(p, ears=False)
w, pu, sh = eyes(r=0.14, z=1.62, x=0.22, pupil=0.075); p.add(w, M['EyeWhite']).add(pu, M['Pupil']).add(sh, M['White'])
for sx in (-1, 1):
    fin = cyl((0, 0, 0), 0.22, 0.02, 0.36, seg=4, scale=(1, 0.18, 1))
    xf(fin, (sx * 0.66, 0.05, 1.58), (0, sx * -1.1, 0))
    p.add(fin, M['SkinShade'], smooth=False)
    for k in range(3):
        p.add(box(surf(sx * 0.42, 1.38 - k * 0.06, 0.0), (0.1, 0.02, 0.014), (0, sx * 0.4, 0)), M['SkinShade'])
for sx in (-1, 1):
    p.add(sphere(surf(sx * 0.04, 1.47, 0.0), 0.018), M['Dark'])
p.add(smile(width=0.18, z=1.31, r=0.02), M['Dark'])
p.add(cut(sphere((0, 0.05, TOP - 0.05), 0.3, (0.08, 1, 1)), (0, 0, TOP - 0.1), (0, 0, 1)), M['SkinShade'])
p.finish(BASES)

# --------------------------------------------------------------------------- hair
# Hair is built from tapered "locks" (strands with a flattened cross-section) laid over a
# scalp cap, so each style has real shape: fringes, partings, waves and flicked tips.
HAIR = bpy.data.collections.new('hair'); ROOT.children.link(HAIR)

def hp(th, ph, k=1.0):
    """Point on the head ellipsoid: th = degrees round from the front (+ = pirate's left... viewer's right),
    ph = degrees up from the equator. k scales outward."""
    t, f = math.radians(th), math.radians(ph)
    d = Vector((math.sin(t) * math.cos(f), -math.cos(t) * math.cos(f), math.sin(f)))
    return HC + Vector((d.x * HS.x, d.y * HS.y, d.z * HS.z)) * k

def catmull(pts, steps):
    P = [Vector(p) for p in pts]
    P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(steps):
            t = s / steps; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return out

def lock(pts, r0, r1=0.006, flat=0.5, seg=8, steps=6, wide=None, center=None, taper=1.3, swell=0.0):
    """Tapered strand along a smooth curve. `wide` fixes the broad axis (else it lies flat on the head)."""
    path = catmull(pts, steps)
    c = Vector(center) if center is not None else HC
    n = len(path)
    bm = bmesh.new(); rings = []
    for i, p in enumerate(path):
        t = i / (n - 1)
        T = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        W = Vector(wide) if wide is not None else T.cross(p - c)
        if W.length < 1e-6:
            W = T.orthogonal()
        W = (W - T * W.dot(T)).normalized()
        N = T.cross(W).normalized()
        r = (r0 + (r1 - r0) * (t ** taper)) * (1 + swell * math.sin(math.pi * t))
        rings.append([bm.verts.new(p + W * math.cos(a) * r + N * math.sin(a) * r * flat)
                      for a in [2 * math.pi * k / seg for k in range(seg)]])
    for i in range(n - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def scalp(k=1.045, zf=1.86, zb=1.3, side_drop=0.0, lump=0.008, seed=0):
    """Close-fitting hair cap with a natural hairline (higher at the temples)."""
    bm = sphere(HC, 1, (HS.x * k, HS.y * k, HS.z * k), seg=48, rings=32)
    bm = cut(bm, (0, -0.6, zf), (0, zf - zb, 1.2))
    for v in bm.verts:            # temples recede a little, sides come down over the ears
        if v.co.y < -0.2 and abs(v.co.x) > 0.25:
            v.co.z += 0.0
    if side_drop:
        pass
    return lumpy(bm, lump, 7, HC, seed)

def merge_all(bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('_h'); b.to_mesh(me); b.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out

def hair(name, *parts):
    p = Part('hair_' + name)
    for b in parts:
        p.add(b, M['Hair'])
    p.finish(HAIR)

R = random.Random(42)
def j(a):           # small jitter
    return R.uniform(-a, a)

# 1. Short crop: tidy cap, a short fringe brushed to one side and a textured crown
fr = [lock([hp(th, 62, 1.04), hp(th + 6, 46, 1.09), hp(th + 14, 33, 1.08)], 0.075, 0.01, 0.4) for th in range(-50, 51, 12)]
crown = [lock([hp(th, ph, 1.03), hp(th + j(8), ph + 12, 1.09), hp(th + j(10), ph + 20, 1.1)], 0.06, 0.01, 0.45)
         for th in range(-150, 151, 30) for ph in (55, 72)]
hair('crop', scalp(1.045, 1.88, 1.35), merge_all(fr + crown))

# 2. Messy: lots of flicked tufts going every which way
ms = []
for i in range(34):
    th, ph = R.uniform(-170, 170), R.uniform(35, 88)
    if abs(th) < 55 and ph < 48:
        continue
    b = hp(th, ph, 1.03)
    out = (b - HC).normalized()
    side = Vector((R.uniform(-1, 1), R.uniform(-0.4, 1), 0)).normalized()
    ms.append(lock([b, b + out * 0.12 + side * 0.08, b + out * 0.22 + side * 0.2 + Vector((0, 0, 0.06))], 0.075, 0.008, 0.45))
hair('messy', scalp(1.05, 1.86, 1.35, lump=0.02, seed=2), merge_all(ms))

# 3. Long: centre parting, waves falling past the shoulders
lg = []
for th in list(range(-165, -25, 14)) + list(range(25, 166, 14)):
    s = 1 if th > 0 else -1
    top = hp(th * 0.2, 86, 1.03)
    mid = hp(th, 40, 1.1)
    ear = hp(th, -5, 1.13)
    fall = ear + Vector((s * 0.06, 0.05 if abs(th) > 90 else -0.08, -0.45))
    end = fall + Vector((s * 0.04 + j(0.03), j(0.04), -0.32))
    lg.append(lock([top, mid, ear, fall, end], 0.11, 0.015, 0.4, swell=0.3))
for s in (-1, 1):   # face-framing curtains from the parting
    lg.append(lock([hp(s * 4, 82, 1.04), hp(s * 22, 58, 1.1), hp(s * 52, 28, 1.12), hp(s * 64, -10, 1.12),
                    hp(s * 66, -10, 1.12) + Vector((0, -0.05, -0.55))], 0.1, 0.02, 0.4, swell=0.25))
hair('long', scalp(1.05, 1.9, 1.25), merge_all(lg))

# 4. Ponytail: combed back, tied, swung forward over the shoulder
pt = [lock([hp(th, 30 if abs(th) < 60 else 10, 1.05), hp(th * 0.8, 75, 1.08), hp(180 - th * 0.15, 40, 1.07)], 0.07, 0.03, 0.35, steps=8)
      for th in range(-120, 121, 20)]
tie = hp(165, 28, 1.07)
pt.append(torus(tie, 0.07, 0.025, (math.radians(70), 0, math.radians(20)), seg=20, ring=8))
for k in range(6):
    a = 2 * math.pi * k / 6
    o = Vector((math.cos(a) * 0.04, 0, math.sin(a) * 0.04))
    pt.append(lock([tie + o, tie + Vector((0.3, 0.12, -0.15)) + o, Vector((0.56, -0.1, 1.0)) + o * 1.4,
                    Vector((0.5, -0.36, 0.72)) + o * 0.8], 0.06, 0.008, 0.6, steps=8, swell=0.4))
hair('ponytail', scalp(1.05, 1.86, 1.3), merge_all(pt))

# 5. Braids: centre parting and two plaits hanging in front of the shoulders
br = [lock([hp(s * 3, 85, 1.03), hp(s * th, 50, 1.08), hp(s * (th + 8), 15, 1.08)], 0.08, 0.04, 0.35)
      for s in (-1, 1) for th in range(20, 171, 18)]
for s in (-1, 1):
    a, b = Vector((s * 0.5, -0.05, 1.42)), Vector((s * 0.42, -0.36, 0.72))
    for k in range(10):
        t = k / 9
        c = a.lerp(b, t)
        for off in (-1, 1):
            br.append(sphere(c + Vector((off * 0.035, 0, off * 0.02 * (1 if k % 2 else -1))), 0.065 - 0.015 * t,
                             (1, 0.8, 1.25), (0.0, off * 0.5, 0.0), seg=12, rings=8))
    br.append(torus(b + Vector((0, 0, -0.03)), 0.045, 0.018, (0, 0, 0), seg=16, ring=6))
    br.append(lock([b + Vector((0, 0, -0.05)), b + Vector((s * 0.02, -0.02, -0.16))], 0.05, 0.01, 0.8))
hair('braids', scalp(1.05, 1.88, 1.3), merge_all(br))

# 6. Dreadlocks: thick rope locks, some over the shoulders
dr = []
for i, th in enumerate(range(-170, 171, 15)):
    if abs(th) < 30:
        continue
    s = 1 if th > 0 else -1
    start = hp(th, 45 + (i % 3) * 10, 1.03)
    ear = hp(th, 0, 1.15)
    fwd = -0.18 if abs(th) < 80 else 0.06
    end = ear + Vector((s * (0.08 + j(0.03)), fwd + j(0.04), -0.6 - (i % 4) * 0.08))
    dr.append(lock([start, hp(th, 25, 1.12), ear, end], 0.055, 0.04, 1.0, seg=8, swell=0.15))
for th in range(-40, 41, 20):   # short front locks pushed back
    dr.append(lock([hp(th, 40, 1.04), hp(th * 1.3, 70, 1.12), hp(th * 2, 85, 1.1)], 0.05, 0.035, 1.0))
dr.append(torus(hp(0, 88, 1.02), 0.2, 0.035, (0, 0, 0), seg=24, ring=8))
hair('dreads', scalp(1.05, 1.86, 1.3, lump=0.015, seed=6), merge_all(dr))

# 7. Mohawk: shaved sides, tall spiked crest of flat locks from forehead to nape
mh = []
for i in range(11):
    ph = 30 + i * 13.5           # forehead -> top -> back
    th = 0 if ph <= 90 else 180
    phx = ph if ph <= 90 else 180 - ph
    base = hp(th, phx, 1.0)
    out = (base - HC).normalized()
    back = Vector((0, 1, 0.1)).normalized()
    length = 0.42 + 0.12 * math.sin(math.pi * i / 10)
    tip = base + (out * 0.85 + back * 0.45).normalized() * length
    mid = base.lerp(tip, 0.5) + back * 0.04
    mh.append(lock([base - out * 0.03, mid, tip], 0.13, 0.01, 0.28, seg=8, wide=(0, 1, 0), taper=0.9))
strip = cut(cut(sphere(HC, 1, (HS.x * 1.03, HS.y * 1.03, HS.z * 1.03), seg=48, rings=32), (0.11, 0, 0), (-1, 0, 0)), (-0.11, 0, 0), (1, 0, 0))
strip = cut(strip, (0, -0.6, 1.84), (0, 0.6, 1.2))
hair('mohawk', strip, merge_all(mh))

# 8. Top knot: combed up into a wrapped bun
tk = [lock([hp(th, 25 if abs(th) < 60 else 0, 1.05), hp(th * 0.7, 65, 1.08), hp(th * 0.2, 86, 1.06)], 0.07, 0.03, 0.35, steps=8)
      for th in range(-180, 181, 24)]
bun_c = Vector((0, 0.05, TOP + 0.12))
tk.append(lumpy(sphere(bun_c, 0.2, (1, 1, 0.85), seg=24, rings=16), 0.015, 9, bun_c, 3))
for k in range(4):
    tk.append(torus(bun_c + Vector((0, 0, -0.08 + k * 0.05)), 0.18 - abs(k - 1.5) * 0.03, 0.03,
                    (math.radians(15 * (k - 1.5)), 0, 0), seg=24, ring=8))
tk.append(torus(bun_c + Vector((0, 0, -0.15)), 0.12, 0.03, (0, 0, 0), seg=20, ring=8))
hair('topknot', scalp(1.05, 1.88, 1.3), merge_all(tk))

# 9. Afro: a big cloud of tight curls
af = []
ac, ar = Vector((0, 0.06, 1.74)), Vector((0.86, 0.8, 0.78))
for i in range(260):
    u, v = R.uniform(-1, 1), R.uniform(0, 2 * math.pi)
    d = Vector((math.sqrt(1 - u * u) * math.cos(v), math.sqrt(1 - u * u) * math.sin(v), u))
    p = ac + Vector((d.x * ar.x, d.y * ar.y, d.z * ar.z))
    if p.y < -0.25 and p.z < 1.86:        # keep the face clear
        continue
    if p.z < 1.05:
        continue
    af.append(sphere(p, R.uniform(0.09, 0.13), seg=10, rings=7))
af.append(cut(sphere(ac, 1, ar * 0.93, seg=40, rings=26), (0, -0.6, 1.83), (0, 0.85, 1.2)))
hair('afro', merge_all(af))

# 10. Slicked back: glossy comb lines from the hairline to a flicked nape
sl = []
for th in range(-75, 76, 10):
    sl.append(lock([hp(th, 30 if abs(th) < 50 else 15, 1.05), hp(th * 0.85, 70, 1.085), hp(180 - th * 0.6, 55, 1.08),
                    hp(180 - th * 0.8, 10, 1.07), hp(180 - th * 0.8, -5, 1.14)], 0.07, 0.02, 0.3, steps=8))
hair('slick', scalp(1.05, 1.86, 1.2, lump=0.003), merge_all(sl))

# 11. Wild mane: long untamed spikes and waves flaring out behind
wd = []
for i in range(36):
    th = R.uniform(-175, 175)
    if abs(th) < 40:
        continue
    ph = R.uniform(10, 80)
    b = hp(th, ph, 1.03)
    out = (b - HC).normalized()
    back = Vector((0, 0.6, -0.2))
    l = R.uniform(0.3, 0.6)
    wd.append(lock([b, b + out * l * 0.4 + back * 0.1, b + (out + back).normalized() * l + Vector((j(0.08), 0, j(0.08)))],
                   0.09, 0.006, 0.45, swell=0.2))
for th in range(-40, 41, 16):
    wd.append(lock([hp(th, 50, 1.04), hp(th * 1.4, 34, 1.12), hp(th * 2.2 + (8 if th >= 0 else -8), 25, 1.2)], 0.07, 0.008, 0.45))
hair('wild', scalp(1.05, 1.86, 1.3, lump=0.02, seed=11), merge_all(wd))

# 12. Bob: blunt fringe and jaw-length sides curling under
bb = [lock([hp(th, 70, 1.04), hp(th, 50, 1.09), hp(th, 34, 1.09)], 0.08, 0.05, 0.4, taper=2.5) for th in range(-48, 49, 10)]
for th in list(range(-175, -45, 12)) + list(range(55, 176, 12)):
    s = 1 if th > 0 else -1
    bb.append(lock([hp(th * 0.3, 86, 1.03), hp(th, 45, 1.1), hp(th, -12, 1.13), hp(th, -28, 1.07)], 0.1, 0.06, 0.4, taper=2.5, swell=0.2))
hair('bob', scalp(1.05, 1.88, 1.3), merge_all(bb))

# --------------------------------------------------------------------------- hats
HATS = bpy.data.collections.new('hats'); ROOT.children.link(HATS)
def tricorn_brim(r_in=0.5, r_out=0.98, z=1.97, rise=0.34, thick=0.05, seg=96, rings=8):
    """Round brim whose rim is folded up into three peaks, one pointing forward."""
    bm = bmesh.new()
    def fold(a):                      # 0 at the three corners, 1 between them
        return (1 - math.cos(3 * (a + math.pi / 2))) / 2
    def corner(a):                    # corners stick out a bit further
        return 1 + 0.12 * (1 - fold(a))
    grid = []
    for side in (0, 1):
        layer = []
        for j in range(rings + 1):
            t = j / rings
            row = []
            for i in range(seg):
                a = 2 * math.pi * i / seg
                r = (r_in + (r_out - r_in) * t) * corner(a) if t > 0 else r_in
                up = rise * fold(a) * (t ** 1.6)
                row.append(bm.verts.new((r * math.cos(a), r * math.sin(a) * 0.96, z + up + (thick if side else 0))))
            layer.append(row)
        grid.append(layer)
    for side in (0, 1):
        L = grid[side]
        for j in range(rings):
            for i in range(seg):
                q = (L[j][i], L[j][(i + 1) % seg], L[j + 1][(i + 1) % seg], L[j + 1][i])
                bm.faces.new(q if side else q[::-1])
    for i in range(seg):   # outer rim
        bm.faces.new((grid[0][rings][i], grid[0][rings][(i + 1) % seg], grid[1][rings][(i + 1) % seg], grid[1][rings][i]))
    return bm

p = Part('hat_tricorn')
p.add(cut(sphere((0, 0.02, 2.0), 1, (0.55, 0.53, 0.42)), (0, 0, 1.95), (0, 0, 1)), M['Hat'])
p.add(tricorn_brim(), M['Hat'])
rim = bmesh.new()
for i in range(96):
    a = 2 * math.pi * i / 96
    b = 2 * math.pi * (i + 1) / 96
    def rp(a):
        f = (1 - math.cos(3 * (a + math.pi / 2))) / 2
        r = 0.98 * (1 + 0.12 * (1 - f)) + 0.01
        return Vector((r * math.cos(a), r * math.sin(a) * 0.96, 1.97 + 0.34 * f + 0.03))
    seg_bm = aim(None, rp(a), rp(b), 0.022, 0.022, 6)
    me = bpy.data.meshes.new('_r'); seg_bm.to_mesh(me); seg_bm.free(); rim.from_mesh(me); bpy.data.meshes.remove(me)
p.add(rim, M['Trim'])
p.add(sphere((0.0, -0.56, 2.08), 0.055, (1, 0.5, 1)), M['Trim'])
p.finish(HATS)

p = Part('hat_bicorne')
p.add(cut(sphere((0, 0.04, 2.05), 1, (1.08, 0.3, 0.5), seg=40, rings=24), (0, 0, 1.96), (0, 0, 1)), M['Hat'])
p.add(cut(torus((0, 0.04, 1.97), 1.0, 0.03, (0, 0, 0), (1.08, 0.3, 1), seg=48, ring=8), (0, 0, 1.96), (0, 0, 1)), M['Trim'])
skull = merge(sphere((0, -0.32, 2.24), 0.075, (1, 0.5, 1)), box((0, -0.32, 2.18), (0.08, 0.04, 0.05)))
p.add(skull, M['White'])
p.add(merge(sphere((-0.026, -0.36, 2.245), 0.018), sphere((0.026, -0.36, 2.245), 0.018)), M['Dark'])
for sx in (-1, 1):
    p.add(aim(None, (sx * 0.1, -0.31, 2.13), (-sx * 0.1, -0.31, 2.27), 0.012, 0.012, 6), M['White'])
p.add(aim(None, (0.25, 0.05, 2.3), (0.75, 0.25, 2.65), 0.07, 0.01, 10), M['White'])
p.finish(HATS)

p = Part('hat_bandana')
band = cut(sphere(HC, 1, (HS.x * 1.09, HS.y * 1.09, HS.z * 1.09), seg=40, rings=26), (0, -0.6, 1.88), (0, 0.5, 1.2))
p.add(band, M['Hat'])
dots = []
for i in range(14):
    a = random.uniform(-2.6, 2.6); el = random.uniform(0.45, 1.3)
    d = Vector((math.sin(a) * math.cos(el), -math.cos(a) * math.cos(el), math.sin(el)))
    pos = HC + Vector((d.x * HS.x, d.y * HS.y, d.z * HS.z)) * 1.1
    if (pos - Vector((0, -0.6, 1.88))).dot(Vector((0, 0.5, 1.2))) > 0.02:
        dots.append(sphere(pos, 0.035, (1, 1, 0.4), Vector((0, 0, 1)).rotation_difference(d).to_euler()))
if dots:
    p.add(merge(*dots), M['White'])
p.add(sphere((0, 0.66, 1.58), 0.1), M['Hat'])
for sx in (-1, 1):
    p.add(aim(None, (sx * 0.04, 0.68, 1.55), (sx * 0.2, 0.8, 1.2), 0.08, 0.03, 10), M['Hat'])
p.finish(HATS)

# --------------------------------------------------------------------------- tops
TOPS = bpy.data.collections.new('tops'); ROOT.children.link(TOPS)
def shell(k=1.05, lump=0.0, seed=0):
    bm = torso(k)
    return lumpy(bm, lump, 5, (0, 0, 0.42), seed) if lump else bm

p = Part('top_captain')
p.add(shell(1.05), M['Cloth'])
p.add(cut(cut(shell(1.07), (0.0, 0, 0), (-1, -1.2, 0)), (0.0, 0, 0), (1, -1.2, 0)), M['Shirt'])
for sx in (-1, 1):
    p.add(box((sx * 0.17, -0.5, 0.62), (0.06, 0.05, 0.75), (0.25, 0, sx * 0.32)), M['Trim'])
    for z in (0.25, 0.45, 0.65):
        p.add(sphere((sx * (0.12 + (0.75 - z) * 0.12), -0.53, z), 0.035), M['Trim'])
p.add(cyl((0, 0.02, 1.02), 0.33, 0.38, 0.16, seg=28), M['Cloth'])
p.add(cut(torus((0, 0.02, 1.08), 0.36, 0.03, seg=36, ring=8), (0, 0.0, 0), (0, 1, 0)), M['Trim'])
p.finish(TOPS)

p = Part('top_striped')
p.add(shell(1.05), M['Cloth'])
for z0 in (0.12, 0.36, 0.6, 0.84):
    p.add(cut(cut(shell(1.065), (0, 0, z0), (0, 0, 1)), (0, 0, z0 + 0.11), (0, 0, -1)), M['Shirt'])
# red neckerchief: knot plus two hanging tails
knot = tsurf(0, 0.86, 1.07, 0.03)
p.add(sphere(knot, 0.07, (1.1, 0.7, 0.9)), M['Red'])
for sx in (-1, 1):
    p.add(aim(None, knot, tsurf(sx * 0.1, 0.62, 1.07, 0.03), 0.06, 0.02, 4), M['Red'], smooth=False)
p.finish(TOPS)

p = Part('top_vest')
p.add(shell(1.04), M['Shirt'])
p.add(cut(shell(1.075), (-0.1, 0, 0), (-1, 0.3, 0)), M['Cloth'])
p.add(cut(shell(1.075), (0.1, 0, 0), (1, 0.3, 0)), M['Cloth'])
for z in (0.2, 0.42, 0.64):
    p.add(sphere((-0.14, -0.52, z), 0.03), M['Trim'])
p.add(cyl((0, 0, 0.98), 0.27, 0.3, 0.1, seg=24), M['Shirt'])
p.finish(TOPS)

p = Part('top_rags')
p.add(lumpy(shell(1.05), 0.025, 7, (0, 0, 0.42), 11), M['Cloth'])
# open V-neck showing the chest, laced with a cord
vn = bmesh.new()
v0, v1, v2 = tsurf(-0.16, 0.92, 1.06, 0.012), tsurf(0.16, 0.92, 1.06, 0.012), tsurf(0, 0.55, 1.06, 0.012)
vn.faces.new([vn.verts.new(v) for v in (v0, v1, v2)][::-1])
p.add(vn, M['Skin'], smooth=False)
for z in (0.62, 0.74, 0.84):
    w = 0.03 + (z - 0.55) * 0.42
    p.add(aim(None, tsurf(-w, z, 1.06, 0.02), tsurf(w, z + 0.04, 1.06, 0.02), 0.01, 0.01, 6), M['Leather'])
# patches with stitches
for (x, z, s, m) in ((0.45, 0.55, 0.2, 'Leather'), (-0.42, 0.3, 0.17, 'Shirt'), (0.2, 0.18, 0.13, 'Leather')):
    c = tsurf(x, z, 1.05, 0.0)
    p.add(box(c, (s, 0.05, s), Vector((0, -1, 0)).rotation_difference((c - Vector((0, 0, 0.42))).normalized()).to_euler()), M[m], smooth=False)
p.add(torus((0, 0, 0.05), 0.79, 0.04, (0, 0, 0), (1, 0.62, 1), seg=40, ring=8), M['Leather'])
p.finish(TOPS)

p = Part('top_naval')
p.add(shell(1.05), M['Cloth'])
for sx in (-1, 1):
    p.add(cyl((sx * 0.56, 0.0, 0.97), 0.22, 0.22, 0.05, rot=(0, sx * 0.45, 0), scale=(1, 0.8, 1), seg=24), M['Trim'])
    for k in range(9):
        a = math.pi * k / 8
        p.add(cyl((sx * (0.56 + math.cos(a) * 0.19), -math.sin(a) * 0.17 + 0.0, 0.88 - abs(sx) * 0.0), 0.018, 0.018, 0.12,
                  rot=(0, sx * 0.45, 0), seg=6), M['Trim'])
    for z in (0.18, 0.38, 0.58):
        p.add(sphere((sx * 0.16, -0.52, z), 0.03), M['Trim'])
sash = torus((0, 0, 0.5), 0.8, 0.06, (0, math.radians(35), 0), (1, 0.66, 1), seg=40, ring=8)
p.add(sash, M['Red'])
for k, z in enumerate((0.9, 0.8, 0.7)):   # lace jabot
    p.add(lumpy(sphere(tsurf(0, z, 1.06, 0.03), 0.1 - k * 0.012, (1.1, 0.5, 0.8)), 0.012, 14, tsurf(0, z), k), M['Shirt'])
p.add(cyl((0, 0.0, 1.0), 0.32, 0.36, 0.14, seg=28), M['Cloth'])
p.finish(TOPS)

# --------------------------------------------------------------------------- trinkets
TRINK = bpy.data.collections.new('trinkets'); ROOT.children.link(TRINK)
p = Part('trinket_parrot')
p.add(sphere((0.66, 0.06, 1.16), 0.17, (0.8, 0.85, 1.25)), M['Red'])
p.add(sphere((0.66, 0.0, 1.43), 0.12), M['Red'])
p.add(sphere((0.76, 0.08, 1.12), 0.12, (0.4, 0.9, 1.3)), M['Green'])
p.add(sphere((0.79, 0.12, 1.02), 0.08, (0.4, 0.8, 1.2)), M['Blue'])
p.add(aim(None, (0.66, -0.1, 1.42), (0.66, -0.2, 1.36), 0.045, 0.005, 10), M['Yellow'])
for sx in (-1, 1):
    p.add(sphere((0.66 + sx * 0.07, -0.07, 1.47), 0.035), M['White'])
    p.add(sphere((0.66 + sx * 0.075, -0.095, 1.47), 0.018), M['Pupil'])
p.add(aim(None, (0.68, 0.18, 1.0), (0.72, 0.32, 0.72), 0.06, 0.02, 10), M['Blue'])
p.finish(TRINK)

p = Part('trinket_earring')
for sx in (-1, 1):
    p.add(torus((sx * 0.62, -0.02, 1.36), 0.06, 0.013, (math.pi / 2, 0, 0), seg=24, ring=8), M['Trim'])
p.finish(TRINK)

p = Part('trinket_necklace')
cord = bmesh.new()
pts = [tsurf(t * 0.36, 0.98 - 0.3 * (1 - t * t), 1.09, 0.012) for t in [i / 10 - 1 for i in range(21)]]
for a, b in zip(pts, pts[1:]):
    s = aim(None, a, b, 0.014, 0.014, 6)
    me = bpy.data.meshes.new('_n'); s.to_mesh(me); s.free(); cord.from_mesh(me); bpy.data.meshes.remove(me)
p.add(cord, M['Leather'])
for t in (-0.6, -0.4, -0.2, 0.0, 0.2, 0.4, 0.6):
    top = tsurf(t * 0.36, 0.98 - 0.3 * (1 - t * t), 1.09, 0.02)
    p.add(aim(None, top, top + Vector((0, -0.015, -0.13 if t == 0 else -0.09)), 0.03, 0.004, 8), M['Teeth'])
p.add(sphere(tsurf(0, 0.66, 1.09, 0.03), 0.045), M['Trim'])
p.finish(TRINK)

p = Part('trinket_spyglass')
p.add(box((0, -0.5, 0.5), (0.08, 0.04, 1.3), (0, math.radians(-38), 0)), M['Leather'])
sg = aim(None, (-0.35, -0.6, 0.35), (0.25, -0.6, 0.62), 0.07, 0.055, 16)
p.add(sg, M['Brass'])
for t in (0.15, 0.55, 0.85):
    a = Vector((-0.35, -0.6, 0.35)).lerp(Vector((0.25, -0.6, 0.62)), t)
    b = Vector((-0.35, -0.6, 0.35)).lerp(Vector((0.25, -0.6, 0.62)), t + 0.05)
    p.add(aim(None, a, b, 0.078, 0.078, 16), M['Dark'])
p.finish(TRINK)

p = Part('trinket_cutlass')
g0, g1 = Vector((-0.62, 0.12, 1.08)), Vector((-0.86, 0.16, 1.62))      # grip rises over the left shoulder
p.add(aim(None, g0, g1, 0.05, 0.045, 12), M['Leather'])
for t in (0.25, 0.5, 0.75):
    c = g0.lerp(g1, t)
    p.add(aim(None, c, c + (g1 - g0).normalized() * 0.02, 0.056, 0.056, 12), M['Trim'])
p.add(sphere(g1 + (g1 - g0).normalized() * 0.04, 0.075), M['Trim'])
p.add(cyl(g0, 0.2, 0.2, 0.04, Vector((0, 0, 1)).rotation_difference((g1 - g0).normalized()).to_euler(), (1, 0.5, 1), seg=24), M['Trim'])
p.add(torus(g0 + Vector((0.06, -0.08, 0.12)), 0.15, 0.022, (0.4, 0.9, 0.2), seg=24, ring=6, arc=math.pi), M['Trim'])
p.add(box((-0.3, -0.5, 0.55), (0.1, 0.04, 1.2), (0, math.radians(32), 0)), M['Leather'])   # baldric strap
p.finish(TRINK)

# --------------------------------------------------------------------------- cosmetics (any combination)
COS = bpy.data.collections.new('cosmetics'); ROOT.children.link(COS)
p = Part('cos_eyepatch')
p.add(sphere(surf(-0.21, 1.6, 0.03), 0.13, (1.05, 0.35, 0.95), face_rot(-0.21, 1.6)), M['Dark'])
# strap: a ring round the head through the patch, up over the forehead to the far side
P_ = surf(-0.21, 1.6) - HC
Q_ = Vector((0.42, -0.36, 0.36))
n_ = P_.cross(Q_).normalized()
p.add(torus(HC, 0.645, 0.016, Vector((0, 0, 1)).rotation_difference(n_).to_euler(), seg=56, ring=6), M['Dark'])
p.finish(COS)

p = Part('cos_monocle')
p.add(torus(surf(0.21, 1.6, 0.05), 0.11, 0.014, (math.pi / 2, 0, 0), seg=28, ring=8), M['Trim'])
p.add(cyl(surf(0.21, 1.6, 0.05), 0.105, 0.105, 0.005, (math.pi / 2, 0, 0), seg=24), M['Glass'])
p.add(aim(None, surf(0.31, 1.55, 0.04), (0.42, -0.42, 1.05), 0.006, 0.006, 6), M['Trim'])
p.finish(COS)

p = Part('cos_scar')
a, b = surf(0.14, 1.78, 0.012), surf(0.32, 1.38, 0.012)
p.add(aim(None, a, b, 0.026, 0.026, 8), M['Scar'])
for t in (0.2, 0.4, 0.6, 0.8):
    c = a.lerp(b, t) + Vector((0, -0.012, 0))
    p.add(box(c, (0.1, 0.02, 0.018), (0, 0.45, 0)), M['Scar'])
p.finish(COS)

p = Part('cos_goldtooth')
p.add(box(surf(0.05, 1.27, 0.0), (0.045, 0.05, 0.05)), M['Trim'])
p.finish(COS)

p = Part('cos_warpaint')
for sx in (-1, 1):
    for k in range(2):
        z = 1.47 - k * 0.07
        p.add(box(surf(sx * 0.3, z, 0.005), (0.16, 0.02, 0.03), face_rot(sx * 0.3, z)), M['Red'])
p.finish(COS)

p = Part('cos_freckles')
for sx in (-1, 1):
    for (dx, dz) in ((0.0, 0.0), (0.06, 0.03), (-0.05, 0.035), (0.03, -0.05), (-0.03, -0.04)):
        p.add(sphere(surf(sx * (0.3 + dx), 1.47 + dz, 0.0), 0.014, (1, 0.5, 1)), M['SkinShade'])
p.finish(COS)

def beard_shell(k=1.07, z=1.47, seed=1, lump=0.03):
    bm = sphere(HC + Vector((0, -0.02, -0.04)), 1, (HS.x * k, HS.y * k, HS.z * k * 1.08), seg=40, rings=26)
    bm = cut(bm, (0, 0, z), (0, 0, -1))
    bm = cut(bm, (0, 0.05, 0), (0, -1, 0))
    return lumpy(bm, lump, 6, HC, seed)

def mustache():
    out = bmesh.new()
    for sx in (-1, 1):
        b = aim(None, surf(0.0, 1.38, 0.02), surf(sx * 0.2, 1.33, 0.03), 0.05, 0.02, 10)
        me = bpy.data.meshes.new('_mu'); b.to_mesh(me); b.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out

p = Part('cos_beard'); p.add(beard_shell(), M['Hair']).add(mustache(), M['Hair']); p.finish(COS)
p = Part('cos_braidbeard')
p.add(beard_shell(1.05, 1.42, 2, 0.02), M['Hair']).add(mustache(), M['Hair'])
p.add(chain((0, -0.52, 0.98), (0, -0.56, 0.62), 6, 0.07, 0.045), M['Hair'])
p.add(torus((0, -0.55, 0.7), 0.055, 0.015, (0, 0, 0), seg=16, ring=6), M['Trim'])
p.finish(COS)
p = Part('cos_mustache'); p.add(mustache(), M['Hair']); p.finish(COS)
p = Part('cos_goatee')
p.add(lumpy(sphere(surf(0, 1.13, 0.05), 0.12, (0.95, 0.6, 1.5)), 0.015, 8, surf(0, 1.13), 3), M['Hair'])
p.add(aim(None, surf(0, 1.06, 0.06), surf(0, 1.06, 0.06) + Vector((0, -0.06, -0.2)), 0.07, 0.01, 10), M['Hair'])
p.finish(COS)

# --------------------------------------------------------------------------- consumables, table, arms & poses
M.update(
    Ash=mat('Ash', '#a3a19a', 0.95), Sleeve=mat('Sleeve', '#8c2323', 0.85), TableWood=mat('TableWood', '#5e3818', 0.75),
    TableEdge=mat('TableEdge', '#3e2410', 0.7), Paper2=mat('Paper2', '#fbfaf5', 0.7), Leaf=mat('Leaf', '#6b4423', 0.85),
    Grill=mat('Grill', '#2a1208', 0.9), Herb=mat('Herb', '#3f8f3a', 0.7), Ale=mat('Ale', '#c98a1c', 0.2, 0, 0, 0.9),
    Cork=mat('Cork', '#c7864a', 0.85), DiceW=mat('DiceW', '#f4ecd8', 0.35),
)

def place(items, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    m = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((scale, scale, scale, 1))
    for bm, _, _ in items:
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return items

def build(name, coll, items):
    p = Part(name)
    for bm, mname, smooth in items:
        p.add(bm, M[mname], smooth)
    return p.finish(coll)

I = lambda bm, m, smooth=True: (bm, m, smooth)

def mk_tankard(foam=True):  # origin = bottom centre, height 0.42
    it = [I(cyl((0, 0, 0.21), 0.2, 0.185, 0.42, seg=14), 'Wood', False)]
    for k in range(14):    # stave grooves
        a = 2 * math.pi * k / 14
        it.append(I(box((math.cos(a) * 0.195, math.sin(a) * 0.195, 0.21), (0.012, 0.012, 0.4), (0, 0, a)), 'TableEdge', False))
    for z in (0.07, 0.35):
        it.append(I(torus((0, 0, z), 0.2, 0.02, seg=28, ring=6), 'Steel'))
    it.append(I(torus((0.22, 0, 0.22), 0.11, 0.032, (math.pi / 2, 0, 0), seg=18, ring=8, arc=math.pi * 1.1), 'Steel'))
    it.append(I(cyl((0, 0, 0.405 if foam else 0.2), 0.17, 0.17, 0.02, seg=20), 'Ale'))
    if foam:
        it.append(I(lumpy(cut(sphere((0, 0, 0.42), 0.21, (1, 1, 0.45), seg=20, rings=12), (0, 0, 0.405), (0, 0, 1)), 0.025, 11, (0, 0, 0.42), 4), 'Foam'))
        it.append(I(sphere((0.15, -0.12, 0.36), 0.04, (1, 1, 1.8)), 'Foam'))
    else:
        it.append(I(torus((0, 0, 0.41), 0.178, 0.012, seg=24, ring=6), 'Foam'))    # dried foam ring
        it.append(I(cyl((0, 0, 0.42), 0.17, 0.17, 0.004, seg=20), 'Dark'))         # dark empty mouth
    return it

def mk_shot(full=True):    # origin = bottom centre, height 0.24
    it = [I(cyl((0, 0, 0.03), 0.1, 0.1, 0.06, seg=20), 'Glass'),
          I(cyl((0, 0, 0.14), 0.1, 0.12, 0.2, seg=20), 'Glass'),
          I(torus((0, 0, 0.24), 0.118, 0.008, seg=24, ring=6), 'Glass')]
    if full:
        it.append(I(cyl((0, 0, 0.12), 0.088, 0.103, 0.12, seg=20), 'Rum'))
    else:
        it.append(I(cyl((0, 0, 0.065), 0.088, 0.09, 0.012, seg=20), 'Rum'))      # last drop
    return it

def mk_cigarette(left=1.0):  # along +X, filter end at origin; `left` = how much is still unburnt (1 .. 0.25)
    paper = 0.22 * left
    end = 0.08 + paper
    it = [I(cyl((0.04, 0, 0), 0.02, 0.02, 0.08, (0, math.pi / 2, 0), seg=12), 'Cork'),
          I(cyl((0.08 + paper / 2, 0, 0), 0.019, 0.019, paper, (0, math.pi / 2, 0), seg=12), 'Paper2'),
          I(lumpy(cyl((end + 0.015 + (1 - left) * 0.01, 0, 0), 0.019, 0.017, 0.03 + (1 - left) * 0.02, (0, math.pi / 2, 0), seg=12),
                  0.004, 40, (end, 0, 0), 1), 'Ash'),
          I(cyl((end + 0.002, 0, 0), 0.0195, 0.0195, 0.008, (0, math.pi / 2, 0), seg=12), 'Ember')]
    for k in range(5):
        it.append(I(sphere((0.012 + k * 0.014, -0.019, 0.005 * (k % 2)), 0.004), 'Leaf'))
    return it

def mk_cigar(left=1.0):    # along +X, mouth end at origin; `left` = how much is still unsmoked
    L = 0.12 + 0.3 * left
    body = aim(None, (0.0, 0, 0), (L, 0, 0), 0.04, 0.04 + 0.01 * (L / 0.42), 16)
    it = [I(lumpy(body, 0.004, 25, (L / 2, 0, 0), 2), 'Leaf'),
          I(sphere((0.0, 0, 0), 0.04, (0.6, 1, 1)), 'Leaf'),
          I(cyl((0.1, 0, 0), 0.044, 0.045, 0.05, (0, math.pi / 2, 0), seg=16), 'Trim'),
          I(cyl((0.1, 0, 0), 0.0455, 0.0455, 0.02, (0, math.pi / 2, 0), seg=16), 'Red'),
          I(lumpy(cyl((L + 0.03 + (1 - left) * 0.015, 0, 0), 0.05, 0.048, 0.06 + (1 - left) * 0.03, (0, math.pi / 2, 0), seg=16),
                  0.006, 30, (L, 0, 0), 3), 'Ash'),
          I(cyl((L + 0.004, 0, 0), 0.051, 0.051, 0.01, (0, math.pi / 2, 0), seg=16), 'Ember')]
    for k in range(6):     # leaf seams
        a = 2 * math.pi * k / 6
        it.append(I(aim(None, (0.02, math.cos(a) * 0.041, math.sin(a) * 0.041), (L - 0.02, math.cos(a + 0.6) * 0.05, math.sin(a + 0.6) * 0.05), 0.004, 0.004, 4), 'Tobacco'))
    return it

def mk_steak_plate(left=1.0):   # origin = plate bottom centre; `left` = share of the steak still on the plate
    it = [I(cyl((0, 0, 0.015), 0.42, 0.36, 0.03, seg=36), 'White'),
          I(torus((0, 0, 0.035), 0.42, 0.02, seg=36, ring=6), 'White')]
    if left > 0.05:
        cut_x = -0.3 + 0.6 * left             # eaten from the left side inward
        meat = lumpy(sphere((0, 0, 0.08), 1, (0.3, 0.22, 0.06), seg=28, rings=12), 0.012, 7, (0, 0, 0.08), 5)
        if left < 0.99:
            meat = cut(meat, (0.3 - 0.6 * left, 0, 0), (1, 0, 0))
        it.append(I(meat, 'Meat'))
        fat = torus((0, 0, 0.08), 1.0, 0.035, (0, 0, 0), (0.3, 0.22, 1), seg=36, ring=8)
        if left < 0.99:
            fat = cut(fat, (0.3 - 0.6 * left, 0, 0), (1, 0, 0))
        it.append(I(fat, 'Fat'))
        for k in range(4):     # grill marks
            x = -0.15 + k * 0.1
            if x > 0.3 - 0.6 * left + 0.03:
                it.append(I(box((x, 0, 0.138), (0.025, 0.4, 0.01), (0, 0, 0.6)), 'Grill', False))
    else:
        for p in ((-0.1, 0.05), (0.12, -0.08), (-0.05, -0.12)):   # just crumbs and gristle left
            it.append(I(lumpy(sphere((p[0], p[1], 0.05), 0.03, (1.3, 1, 0.5)), 0.008, 20, (p[0], p[1], 0.05), 3), 'Fat'))
    it.append(I(aim(None, (0.02, -0.18, 0.1), (0.02, 0.18, 0.1), 0.025, 0.025, 8), 'Teeth'))    # T-bone
    it.append(I(aim(None, (0.02, 0.0, 0.1), (0.24, 0.0, 0.1), 0.022, 0.022, 8), 'Teeth'))
    for p in ((0.28, 0.12), (0.31, 0.06), (0.26, 0.16)):
        it.append(I(sphere((p[0], p[1], 0.06), 0.035), 'Herb'))
    return it

def mk_knife():            # along +X, handle end at origin, length 0.38
    it = [I(aim(None, (0, 0, 0), (0.15, 0, 0), 0.022, 0.02, 10), 'Wood'),
          I(box((0.155, 0, 0), (0.012, 0.05, 0.03)), 'Steel', False)]
    blade = bmesh.new()
    pts = [(0.16, -0.004, 0.012), (0.38, -0.004, 0.0), (0.38, 0.004, 0.0), (0.16, 0.004, 0.012),
           (0.16, -0.004, -0.02), (0.36, -0.004, -0.012), (0.36, 0.004, -0.012), (0.16, 0.004, -0.02)]
    v = [blade.verts.new(p) for p in pts]
    for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)):
        blade.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(blade, faces=blade.faces)
    it.append(I(blade, 'Steel', False))
    return it

def point_along(items, origin, direction):
    """Place a +X-pointing prop at `origin`, aimed along `direction`."""
    q = Vector((1, 0, 0)).rotation_difference(Vector(direction).normalized())
    m = Matrix.Translation(Vector(origin)) @ q.to_matrix().to_4x4()
    for bm, _, _ in items:
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return items

def mk_fork(bite=True):    # along +X, handle end at origin, length 0.36
    it = [I(aim(None, (0, 0, 0), (0.24, 0, 0), 0.016, 0.012, 8), 'Steel'),
          I(box((0.27, 0, 0), (0.06, 0.06, 0.01)), 'Steel', False)]
    for y in (-0.022, 0, 0.022):
        it.append(I(aim(None, (0.29, y, 0), (0.37, y, 0), 0.006, 0.003, 6), 'Steel'))
    if bite:
        it.append(I(lumpy(sphere((0.34, 0, 0), 0.05, (1, 0.8, 0.7)), 0.008, 20, (0.34, 0, 0), 7), 'Meat'))
        it.append(I(box((0.34, 0, 0.033), (0.06, 0.012, 0.004), (0, 0, 0.5)), 'Grill', False))
    return it

def mk_cup():              # leather dice cup, origin = mouth centre, opening facing -Z (upside down)
    it = [I(cut(cyl((0, 0, 0.21), 0.2, 0.16, 0.42, seg=28), (0, 0, 0.005), (0, 0, 1)), 'Leather'),
          I(torus((0, 0, 0.02), 0.2, 0.022, seg=32, ring=8), 'Trim'),
          I(torus((0, 0, 0.4), 0.16, 0.02, seg=32, ring=8), 'Trim'),
          I(cyl((0, 0, 0.215), 0.183, 0.183, 0.03, seg=28), 'TableEdge')]
    for k in range(10):    # stitching
        a = 2 * math.pi * k / 10
        it.append(I(box((math.cos(a) * 0.188, math.sin(a) * 0.188, 0.3), (0.01, 0.01, 0.05), (0, 0, a)), 'Shirt', False))
    it.append(I(cyl((0, 0, 0.01), 0.18, 0.18, 0.01, seg=28), 'Dark'))   # dark inside rim when seen from below
    return it

def mk_die(loc, rot, s=0.075):
    it = [I(box(loc, (s, s, s), rot), 'DiceW', False)]
    top = Vector(loc) + (Euler(rot).to_matrix() @ Vector((0, 0, s / 2 + 0.001)))
    it.append(I(sphere(top, s * 0.13, (1, 1, 0.3)), 'Pupil'))
    return it

def mk_smokes_pack():
    it = [I(box((0, 0, 0.21), (0.3, 0.12, 0.42)), 'Red', False),
          I(box((0, -0.061, 0.26), (0.31, 0.01, 0.15)), 'White', False),
          I(box((0, -0.062, 0.26), (0.12, 0.01, 0.05)), 'Trim', False),
          I(box((0, 0, 0.405), (0.305, 0.125, 0.03)), 'Trim', False)]
    for i, x in enumerate((-0.07, 0.0, 0.07)):
        cig = place(mk_cigarette(), (x, 0, 0.36 + i * 0.03), (0, -math.pi / 2, 0))
        it += cig
    return it

def mk_cigar_box():
    it = [I(box((0, 0, 0.09), (0.5, 0.34, 0.18)), 'Wood', False),
          I(box((0, -0.171, 0.1), (0.3, 0.01, 0.1)), 'Shirt', False),
          I(box((0, -0.172, 0.1), (0.12, 0.01, 0.04)), 'Red', False)]
    for k, y in enumerate((-0.08, 0.0, 0.08)):
        it += place(mk_cigar(), (-0.24, y, 0.23 + k * 0.004), (0, 0, 0))
    return it

PROPS = bpy.data.collections.new('props'); ROOT.children.link(PROPS)
build('prop_drink', PROPS, place(mk_tankard(), (0, 0, -0.21)))
build('prop_smokes', PROPS, place(mk_smokes_pack(), (0, 0, -0.25)))
build('prop_cigarette', PROPS, place(mk_cigarette(), (-0.17, 0, 0), (0.3, 0, 0.3), 1.4))
build('prop_cigar', PROPS, place(mk_cigar_box(), (0, 0, -0.15), (0.35, 0, 0.25), 0.9))
build('prop_steak', PROPS, place(mk_steak_plate(), (0, 0, -0.05), (0, 0, 0.2)))
build('prop_rum', PROPS, place(mk_shot(), (0, 0, -0.12), (0, 0, 0), 1.4))

# ---- table, cup and arms for the at-the-table poses
TABLE = bpy.data.collections.new('table'); ROOT.children.link(TABLE)
TZ = 0.16                                     # table top height
build('table', TABLE, [I(box((0, -0.85, TZ - 0.1), (3.2, 1.5, 0.2)), 'TableWood', False),
                       I(aim(None, (-1.6, -1.6, TZ - 0.06), (1.6, -1.6, TZ - 0.06), 0.09, 0.09, 12), 'TableEdge')]
      + [I(box((x, -0.85, TZ + 0.001), (0.012, 1.5, 0.002)), 'TableEdge', False) for x in (-1.1, -0.45, 0.25, 0.9)])

CUP = Vector((0, -1.02, TZ))
build('cup_down', TABLE, place(mk_cup(), CUP))
build('cup_side', TABLE, place(mk_cup(), CUP + Vector((-0.62, 0.05, 0)), (0, 0, 0), 0.85))
lift_at = Vector((0.2, -1.02, 0.78))
build('cup_lift', TABLE, place(mk_cup(), lift_at, (math.radians(-35), math.radians(25), 0)))
dice = []
for k, (dx, dy, rz) in enumerate(((-0.12, 0.0, 0.3), (0.0, -0.06, 0.9), (0.11, 0.03, 0.1), (-0.04, 0.1, 1.2), (0.13, -0.12, 0.6))):
    dice += mk_die((dx, -1.02 + dy, TZ + 0.0375), (0, 0, rz))
build('dice_table', TABLE, dice)

def hand(wrist, direction, kind='grip', side=1):
    """kind: grip (fist round something), flat (resting on the table), pinch (holding a cigarette)."""
    d = Vector(direction).normalized()
    q = Vector((0, -1, 0)).rotation_difference(d)
    m = Matrix.Translation(Vector(wrist)) @ q.to_matrix().to_4x4()
    it = [I(sphere((0, -0.07, 0), 1, (0.085, 0.085, 0.05 if kind == 'flat' else 0.065)), 'Skin')]
    if kind == 'flat':
        for x in (-0.05, -0.017, 0.017, 0.05):
            it.append(I(aim(None, (x, -0.12, 0), (x * 1.1, -0.2 + abs(x) * 0.4, -0.005), 0.021, 0.018, 8), 'Skin'))
            it.append(I(sphere((x * 1.1, -0.2 + abs(x) * 0.4, -0.005), 0.018), 'Skin'))
    elif kind == 'pinch':
        for x, l in ((-0.03, 0.2), (0.0, 0.21)):
            it.append(I(aim(None, (x, -0.12, 0.01), (x, -l, 0.02), 0.02, 0.017, 8), 'Skin'))
        it.append(I(sphere((0.03, -0.13, -0.02), 0.045, (1, 1.2, 0.8)), 'Skin'))
    else:
        it.append(I(sphere((0, -0.14, -0.02), 1, (0.08, 0.06, 0.065)), 'Skin'))
        for x in (-0.045, -0.015, 0.015, 0.045):
            it.append(I(sphere((x, -0.17, -0.035), 0.024), 'Skin'))
    it.append(I(aim(None, (side * 0.06, -0.04, 0.0), (side * 0.095, -0.13, 0.03), 0.026, 0.02, 8), 'Skin'))
    for bm, _, _ in it:
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return it

def arm(side, elbow, wrist, hand_dir, kind='grip'):
    S = Vector((side * 0.6, -0.04, 0.78))
    E, W = Vector(elbow), Vector(wrist)
    fdir = (W - E).normalized()
    it = [I(aim(None, S, E, 0.13, 0.11, 14), 'Sleeve'), I(sphere(E, 0.11), 'Sleeve'),
          I(aim(None, E, W - fdir * 0.03, 0.11, 0.095, 14), 'Sleeve'),
          I(aim(None, W - fdir * 0.06, W, 0.1, 0.1, 14), 'Shirt'),
          I(aim(None, W - fdir * 0.01, W + fdir * 0.03, 0.06, 0.06, 10), 'Skin')]
    return it + hand(W + fdir * 0.02, hand_dir, kind, -side)

L_REST = lambda: arm(-1, (-0.82, -0.48, 0.3), (-0.33, -0.98, 0.33), (1, -0.25, 0.05))
R_REST = lambda: arm(1, (0.82, -0.48, 0.3), (0.33, -0.98, 0.33), (-1, -0.25, 0.05))
L_FLAT = lambda: arm(-1, (-0.84, -0.46, 0.26), (-0.44, -0.98, TZ + 0.06), (0.25, -1, -0.02), 'flat')
build('arms_rest', TABLE, L_REST() + R_REST())
build('arms_lift', TABLE, L_FLAT() + arm(1, (0.86, -0.55, 0.45), (0.42, -0.98, 0.82), (-0.9, -0.1, 0.1)))
build('arms_drink', TABLE, L_REST() + arm(1, (0.84, -0.42, 0.42), (0.38, -0.74, 1.08), (-0.55, -0.35, 0.45)))
build('arms_smoke', TABLE, L_REST() + arm(1, (0.86, -0.42, 0.44), (0.42, -0.7, 1.06), (-0.65, -0.25, 0.55), 'pinch'))
build('arms_eat', TABLE, L_FLAT() + arm(1, (0.86, -0.45, 0.44), (0.34, -0.78, 1.0), (-0.6, -0.2, 0.5)))
# in-between poses for the item loops
build('arms_holddrink', TABLE, L_REST() + arm(1, (0.86, -0.5, 0.32), (0.44, -0.9, 0.62), (-0.75, -0.45, 0.15)))
build('arms_smokedown', TABLE, L_REST() + arm(1, (0.86, -0.5, 0.28), (0.44, -0.98, 0.3), (-0.45, -0.88, 0.05), 'pinch'))
build('arms_cigarhand', TABLE, L_REST() + arm(1, (0.88, -0.5, 0.36), (0.5, -0.86, 0.68), (-0.55, -0.62, 0.3)))
build('arms_cut', TABLE, arm(-1, (-0.82, -0.5, 0.32), (-0.26, -0.98, 0.42), (0.35, -0.75, -0.4)) +
      arm(1, (0.82, -0.5, 0.32), (0.32, -0.98, 0.42), (-0.35, -0.75, -0.4)))

HELD = bpy.data.collections.new('held'); ROOT.children.link(HELD)
MOUTH = Vector((0.0, -0.58, 1.29))
SIZES = (('L', 1.0), ('M', 0.6), ('S', 0.28))          # how much of a smoke is left
# grog: at the lips, held at the chest, standing on the table (full / drained)
build('held_drink', HELD, place(mk_tankard(), (0.2, -0.86, 1.08), (0, math.radians(-38), math.radians(-10)), 0.85))
build('held_drink_empty', HELD, place(mk_tankard(False), (0.2, -0.86, 1.08), (0, math.radians(-50), math.radians(-10)), 0.85))
build('chest_drink', HELD, place(mk_tankard(), (0.26, -1.02, 0.52), (0, math.radians(-8), 0), 0.85))
build('chest_drink_empty', HELD, place(mk_tankard(False), (0.26, -1.02, 0.52), (0, math.radians(-8), 0), 0.85))
build('table_drink', HELD, place(mk_tankard(), (0.7, -1.12, TZ), (0, 0, 0.4), 0.8))
build('table_drink_empty', HELD, place(mk_tankard(False), (0.7, -1.12, TZ), (0, 0, 0.4), 0.8))
# rum: at the lips, on the table full, empty glass afterwards
build('held_rum', HELD, place(mk_shot(), (0.17, -0.8, 1.13), (0, math.radians(-40), 0), 0.9))
build('table_rum', HELD, place(mk_shot(), (0.66, -1.12, TZ), (0, 0, 0), 0.95))
build('table_rum_empty', HELD, place(mk_shot(False), (0.66, -1.12, TZ), (0, 0, 0), 0.95))
# cigarette: at the lips with the hand (drag), dangling from the lips, resting in the hand on the table
for tag, left in SIZES:
    build('held_cigarette_' + tag, HELD, place(mk_cigarette(left), MOUTH + Vector((0.07, -0.01, 0.0)), (0, math.radians(8), math.radians(-38)), 1.0))
    build('lips_cigarette_' + tag, HELD, place(mk_cigarette(left), MOUTH + Vector((0.07, -0.01, 0.0)), (0, math.radians(22), math.radians(-30)), 1.0))
    build('hand_cigarette_' + tag, HELD, point_along(mk_cigarette(left), (0.3, -1.12, 0.33), (0.55, -0.8, 0.12)))
    # cigar: clamped in the teeth, or held in the hand between puffs
    build('teeth_cigar_' + tag, HELD, place(mk_cigar(left), MOUTH + Vector((0.09, 0.0, 0.0)), (0, math.radians(12), math.radians(-35)), 0.95))
    build('hand_cigar_' + tag, HELD, point_along(place(mk_cigar(left), (0, 0, 0), (0, 0, 0), 0.95), (0.36, -1.0, 0.74), (0.6, -0.7, 0.25)))
# steak: plate with a whole, half eaten or finished steak; fork at the mouth, or knife and fork at the plate
for tag, left in (('full', 1.0), ('half', 0.5), ('bone', 0.0)):
    build('plate_' + tag, HELD, place(mk_steak_plate(left), (0.05, -1.02, TZ + 0.001), (0, 0, 0.3), 0.95))
build('held_fork', HELD, place(mk_fork(), (0.3, -0.84, 1.03), (0, math.radians(-30), math.radians(150)), 0.9))
build('cut_tools', HELD, point_along(mk_fork(False), (-0.2, -1.1, 0.42), (0.35, 0.15, -0.9))
      + point_along(mk_knife(), (0.26, -1.1, 0.42), (-0.5, 0.05, -0.75)))

# --------------------------------------------------------------------------- admin exclusives
# Davy Jones, the Admiral's hat and coat, the great macaw, the golden dice cup and the captain's pipe.
M.update(
    Barnacle=mat('Barnacle', '#e4ddcc', 0.85), BarnacleDark=mat('BarnacleDark', '#5d5446', 0.9),
    Ruby=mat('Ruby', '#d0142f', 0.12, 0.2), Emerald=mat('Emerald', '#0fa860', 0.12, 0.2), Sapphire=mat('Sapphire', '#1f5ce0', 0.12, 0.2),
    DarkGold=mat('DarkGold', '#9a6c12', 0.3, 1.0), Plume=mat('Plume', '#f6f3ec', 0.8), PlumeRed=mat('PlumeRed', '#b5142f', 0.7),
    Beak=mat('Beak', '#efe8da', 0.4), BeakDark=mat('BeakDark', '#2a2522', 0.4), Feet=mat('Feet', '#6f6a66', 0.7),
    MacawRed=mat('MacawRed', '#d81f26', 0.55), MacawYellow=mat('MacawYellow', '#ffcc1a', 0.5), MacawBlue=mat('MacawBlue', '#1d63d8', 0.5),
    MacawGreen=mat('MacawGreen', '#2f9e44', 0.55), Briar=mat('Briar', '#6b3418', 0.35), Medal=mat('Medal', '#e9c25a', 0.25, 1.0),
    RibbonBlue=mat('RibbonBlue', '#2347a3', 0.6),
)
ADMIN = bpy.data.collections.new('admin'); ROOT.children.link(ADMIN)

def bm_list(*items):
    """Merge a mixed list of bmeshes into one (all freed)."""
    out = bmesh.new()
    for b in items:
        me = bpy.data.meshes.new('_a'); b.to_mesh(me); b.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out

# ---- Davy Jones: sea-cursed captain with a beard of tentacles -------------------------------
p = Part('base_davyjones'); base_common(p, ears=False)
w, pu, sh = eyes(r=0.088, z=1.61, x=0.2, pupil=0.05, look=(0.0, -0.008))
p.add(w, M['EyeWhite']).add(pu, M['Pupil']).add(sh, M['White'])
for sx in (-1, 1):   # heavy, scowling brow ridge
    p.add(lumpy(sphere(surf(sx * 0.2, 1.72, 0.02), 1, (0.17, 0.06, 0.055), (0, sx * 0.28, 0), seg=20, rings=10), 0.01, 9, surf(sx * 0.2, 1.72), 2), M['SkinShade'])
p.add(sphere(surf(0, 1.46, 0.035), 0.1, (1.25, 0.8, 0.8)), M['Skin'])                     # broad flat nose
for sx in (-1, 1):
    p.add(sphere(surf(sx * 0.055, 1.44, 0.075), 0.022, (1, 0.6, 1.2)), M['Dark'])          # nostrils
# tentacle beard: seven thick octopus arms from the mouth and chin, swaying and curling at the tips,
# with pale suckers down the front; two short ones at the corners of the mouth
M['Sucker'] = mat('Sucker', '#b9a397', 0.6)
BEARD = [  # x at root, root height, length, sway, curl direction, thickness
    (-0.27, 1.3, 0.55, -0.10, -1, 0.062), (-0.17, 1.25, 0.78, -0.06, 1, 0.074), (-0.07, 1.21, 0.95, 0.04, -1, 0.082),
    (0.03, 1.2, 1.02, -0.03, 1, 0.085), (0.13, 1.22, 0.86, 0.07, -1, 0.078), (0.22, 1.27, 0.68, 0.05, 1, 0.07),
    (0.3, 1.32, 0.5, 0.12, 1, 0.06)]
tent, suck = [], []
for k, (x, z0, L, sway, curl, th) in enumerate(BEARD):
    root = surf(x, z0, -0.01)
    out = (root - HC).normalized()
    p1 = root + out * 0.1 + Vector((x * 0.15, -0.03, -0.12))
    p2 = p1 + Vector((sway, -0.04, -L * 0.38))
    p3 = p2 + Vector((-sway * 0.6, -0.02, -L * 0.34))
    # curled tip: a small spiral
    c0 = p3 + Vector((curl * 0.07, -0.05, -0.08))
    c1 = c0 + Vector((curl * 0.08, -0.02, 0.03))
    c2 = c1 + Vector((curl * 0.0, -0.01, 0.08))
    c3 = c2 + Vector((-curl * 0.05, 0.0, 0.02))
    pts = [root - out * 0.03, p1, p2, p3, c0, c1, c2, c3]
    tent.append(lock(pts, th, 0.007, 0.92, seg=12, steps=7, center=root + Vector((0, 0.4, 0.3)), taper=1.05))
    path = catmull(pts, 7)
    n = len(path)
    for s in range(5, n - 6, 3):             # suckers on the side facing the viewer
        a, b = path[s], path[s + 1]
        T = (b - a).normalized()
        side = T.cross(Vector((0, 1, 0)))
        front = T.cross(side).normalized()
        if front.y > 0:
            front = -front
        r_t = th * (1 - (s / (n - 1)) ** 1.05) + 0.007
        sr = max(0.008, r_t * 0.42)
        c = a + front * r_t * 0.92
        rot = Vector((0, 0, 1)).rotation_difference(front).to_euler()
        suck.append(cyl(c, sr, sr * 0.8, sr * 0.6, rot, seg=12))
        suck.append(cyl(c + front * sr * 0.32, sr * 0.45, sr * 0.45, sr * 0.1, rot, seg=10))
for sx in (-1, 1):                           # short mouth-corner tentacles
    root = surf(sx * 0.2, 1.36, -0.01)
    tent.append(lock([root, root + Vector((sx * 0.1, -0.08, -0.06)), root + Vector((sx * 0.2, -0.08, -0.02)), root + Vector((sx * 0.24, -0.06, 0.06))],
                     0.04, 0.006, 0.95, seg=10, steps=6, center=root + Vector((0, 0.4, 0))))
p.add(bm_list(*tent), M['Skin'])
p.add(bm_list(*suck), M['Sucker'])
p.add(sphere(surf(0, 1.3, 0.0), 0.12, (1.6, 0.6, 0.7)), M['SkinShade'])          # dark mouth shadow behind the beard
# barnacles crusted on the brow and cheek
for (x, z, r) in ((0.3, 1.83, 0.062), (0.4, 1.74, 0.048), (0.22, 1.92, 0.04), (0.36, 1.92, 0.035), (0.46, 1.62, 0.052),
                  (0.42, 1.5, 0.036), (0.5, 1.72, 0.03), (-0.36, 1.86, 0.04), (-0.44, 1.6, 0.034), (-0.3, 1.95, 0.028)):
    c = surf(x, z, -0.005)
    n = (c - HC).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(n).to_euler()
    p.add(cyl(c + n * r * 0.4, r, r * 0.55, r * 0.9, rot, seg=10), M['Barnacle'], smooth=False)
    p.add(cyl(c + n * r * 0.86, r * 0.42, r * 0.42, r * 0.06, rot, seg=8), M['BarnacleDark'])
for sx in (-1, 1):   # gills on the neck
    for k in range(3):
        p.add(torus((sx * 0.5, -0.05, 1.3 - k * 0.07), 0.08, 0.01, (math.pi / 2, sx * 0.3, 0), (1, 1, 1), seg=12, ring=6, arc=math.pi * 0.8), M['SkinShade'])
p.finish(ADMIN)

# ---- Admiral's hat: grand tricorn, thick gold lace, skull emblem and plumes ----------------
p = Part('hat_admiral')
p.add(cut(sphere((0, 0.02, 2.02), 1, (0.58, 0.56, 0.47)), (0, 0, 1.95), (0, 0, 1)), M['Hat'])
p.add(tricorn_brim(r_in=0.5, r_out=1.08, rise=0.4, thick=0.06), M['Hat'])
def adm_rim(off_r, off_z, r):
    out = bmesh.new()
    for i in range(120):
        a, b = 2 * math.pi * i / 120, 2 * math.pi * (i + 1) / 120
        def rp(a):
            f = (1 - math.cos(3 * (a + math.pi / 2))) / 2
            rr = (1.08 + off_r) * (1 + 0.12 * (1 - f))
            return Vector((rr * math.cos(a), rr * math.sin(a) * 0.96, 1.97 + 0.4 * f + off_z))
        s = aim(None, rp(a), rp(b), r, r, 8)
        me = bpy.data.meshes.new('_r'); s.to_mesh(me); s.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out
p.add(adm_rim(0.01, 0.035, 0.034), M['Trim'])       # thick gold lace on the edge
p.add(adm_rim(-0.09, 0.03, 0.014), M['DarkGold'])    # second braid line
# skull and crossbones emblem on the front peak
em = Vector((0.0, -0.66, 2.16))
for sx in (-1, 1):
    p.add(aim(None, em + Vector((-0.11 * sx, -0.01, -0.1)), em + Vector((0.11 * sx, -0.01, 0.1)), 0.016, 0.016, 8), M['Trim'])
    for e in (-1, 1):
        p.add(sphere(em + Vector((0.11 * sx * e, -0.01, 0.1 * e)) + Vector((0.012 * sx * e, 0, 0)), 0.02), M['Trim'])
p.add(sphere(em + Vector((0, -0.02, 0.02)), 0.072, (1, 0.6, 1)), M['Trim'])
p.add(box(em + Vector((0, -0.02, -0.045)), (0.07, 0.05, 0.04)), M['Trim'])
for sx in (-1, 1):
    p.add(sphere(em + Vector((sx * 0.026, -0.06, 0.03)), 0.018, (1, 0.5, 1)), M['Dark'])
# ostrich plumes: a fan of soft curling feathers sweeping back from the left side
PL = random.Random(5)
plume_base = Vector((-0.4, 0.08, 2.22))
for k in range(9):
    t = k / 8
    col = 'PlumeRed' if k in (2, 5) else 'Plume'
    L = 0.75 + 0.3 * math.sin(math.pi * t)
    ang = math.radians(-35 + 70 * t)
    d = Vector((math.sin(ang) * 0.25 - 0.1, 0.55 + 0.1 * math.cos(ang), 0.45 + 0.15 * math.cos(ang))).normalized()
    pts = [plume_base, plume_base + d * L * 0.35 + Vector((0, 0, 0.08)), plume_base + d * L * 0.7 + Vector((0, 0.05, 0.06)),
           plume_base + d * L + Vector((0.04 * math.sin(ang), 0.12, -0.12))]
    p.add(lock(pts, 0.075, 0.012, 0.35, seg=10, steps=8, wide=(math.cos(ang), 0, 0.3), taper=1.4, swell=0.5), M[col])
    # wispy barbs along each feather
    path = catmull(pts, 8)
    for s in range(3, len(path) - 2, 3):
        a = path[s]
        for side in (-1, 1):
            tipb = a + Vector((side * 0.08 * math.cos(ang), 0.03, side * 0.03 - 0.03)) + Vector((PL.uniform(-0.02, 0.02), 0, PL.uniform(-0.02, 0.02)))
            p.add(aim(None, a, tipb, 0.012, 0.002, 5), M[col])
p.add(torus(Vector((-0.4, -0.02, 2.22)), 0.07, 0.03, (math.radians(70), 0, math.radians(-30)), seg=20, ring=8), M['PlumeRed'])   # cockade
p.add(sphere(Vector((-0.4, -0.04, 2.22)), 0.04, (1, 0.6, 1)), M['Trim'])
p.finish(ADMIN)

# ---- Admiral's coat: gold braid, big epaulettes, sash, medals and jabot ---------------------
p = Part('top_admiral')
p.add(shell(1.05), M['Cloth'])
p.add(cut(cut(shell(1.07), (0.0, 0, 0), (-1, -1.4, 0)), (0.0, 0, 0), (1, -1.4, 0)), M['Shirt'])
for sx in (-1, 1):
    lap = [tsurf(sx * 0.07, 0.08, 1.08, 0.01), tsurf(sx * 0.13, 0.5, 1.08, 0.012), tsurf(sx * 0.2, 0.9, 1.08, 0.012), tsurf(sx * 0.3, 1.0, 1.08, 0.01)]
    p.add(lock(lap, 0.026, 0.026, 1.0, seg=8, steps=6, taper=1), M['Trim'])                                # braid edge
    p.add(lock([v + Vector((sx * 0.05, 0.01, 0)) for v in lap], 0.012, 0.012, 1.0, seg=6, steps=6), M['DarkGold'])
    for z in (0.22, 0.42, 0.62, 0.8):
        c = tsurf(sx * (0.2 + (0.9 - z) * 0.05), z, 1.06, 0.02)
        p.add(sphere(c, 0.038, (1, 0.6, 1)), M['Trim'])
        p.add(torus(c + Vector((0, -0.012, 0)), 0.03, 0.006, (math.pi / 2, 0, 0), seg=12, ring=5), M['DarkGold'])
    # epaulette: gold board, crown and long fringe
    ep = Vector((sx * 0.58, 0.0, 0.99))
    p.add(cyl(ep, 0.25, 0.23, 0.06, (0, sx * 0.48, 0), (1, 0.8, 1), seg=28), M['Trim'])
    p.add(torus(ep + Vector((0, 0, 0.03)), 0.24, 0.02, (0, sx * 0.48, 0), (1, 0.8, 1), seg=28, ring=6), M['DarkGold'])
    cc = ep + Vector((sx * 0.03, -0.04, 0.08))       # little gold crown on each epaulette
    p.add(cyl(cc, 0.055, 0.055, 0.03, (0, sx * 0.48, 0), seg=16), M['Medal'])
    for k in range(5):
        a = 2 * math.pi * k / 5
        b0 = cc + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.01))
        p.add(aim(None, b0, b0 + Vector((0, 0, 0.05)), 0.014, 0.002, 6), M['Medal'])
    p.add(sphere(cc + Vector((0, -0.05, 0.0)), 0.014), M['Ruby'])
    for k in range(13):
        a = math.pi * k / 12
        tip = Vector((sx * (0.58 + math.cos(a) * 0.23), -math.sin(a) * 0.19, 0.96))
        p.add(aim(None, tip + Vector((0, 0, 0.02)), tip + Vector((sx * 0.02, -0.01, -0.17)), 0.016, 0.012, 6), M['Trim'])
        p.add(sphere(tip + Vector((sx * 0.02, -0.01, -0.18)), 0.016), M['DarkGold'])
# silk sash: a flat band hugging the coat from the right shoulder to the left hip, gold-fringed
band = shell(1.085)
nrm = Vector((math.sin(math.radians(-32)), 0, math.cos(math.radians(-32))))
band = cut(cut(band, Vector((0, 0, 0.5)) + nrm * 0.07, -nrm), Vector((0, 0, 0.5)) - nrm * 0.07, nrm)
p.add(band, M['Red'])
for sgn in (-1, 1):                          # gold edging along both sides of the sash
    edge = bmesh.new()
    pts_e = []
    for i in range(41):
        x = -0.75 + 1.5 * i / 40
        z = 0.5 + (-x * math.tan(math.radians(32))) + sgn * 0.07 / math.cos(math.radians(32))
        if 0.02 < z < 1.0:
            pts_e.append(tsurf(x * 0.98, z, 1.09, 0.004))
    for a, b in zip(pts_e, pts_e[1:]):
        if (a - b).length < 0.2:
            s = aim(None, a, b, 0.012, 0.012, 6)
            me = bpy.data.meshes.new('_se'); s.to_mesh(me); s.free(); edge.from_mesh(me); bpy.data.meshes.remove(me)
    p.add(edge, M['Trim'])
buckle = tsurf(0.2, 0.5 - 0.2 * math.tan(math.radians(32)), 1.1, 0.0)
p.add(box(buckle, (0.13, 0.03, 0.12), (0, math.radians(32), 0)), M['Trim'], smooth=False)
p.add(box(buckle + Vector((0, -0.016, 0)), (0.08, 0.01, 0.07), (0, math.radians(32), 0)), M['Ruby'], smooth=False)
# medals on the left chest: ribbons with star medals
for k, (x, rib) in enumerate(((-0.46, 'RibbonBlue'), (-0.34, 'Red'), (-0.22, 'RibbonBlue'))):
    top = tsurf(x, 0.8, 1.06, 0.012)
    p.add(box(top, (0.085, 0.025, 0.13), Vector((0, -1, 0)).rotation_difference((top - Vector((0, 0, 0.42))).normalized()).to_euler()), M[rib], smooth=False)
    st = bmesh.new()
    mc = tsurf(x, 0.64, 1.06, 0.04)
    pts2 = []
    for i in range(10):
        r = 0.07 if i % 2 == 0 else 0.03
        a = -math.pi / 2 + i * math.pi / 5
        pts2.append(Vector((mc.x + r * math.cos(a), mc.y, mc.z - r * math.sin(a))))
    vs = [st.verts.new(v) for v in pts2]
    vb = [st.verts.new(v + Vector((0, 0.015, 0))) for v in pts2]
    st.faces.new(vs); st.faces.new(vb[::-1])
    for i in range(10):
        st.faces.new((vs[i], vb[i], vb[(i + 1) % 10], vs[(i + 1) % 10]))
    bmesh.ops.recalc_face_normals(st, faces=st.faces)
    p.add(st, M['Medal'], smooth=False)
for k, z in enumerate((0.92, 0.83, 0.74)):   # lace jabot
    p.add(lumpy(sphere(tsurf(0, z, 1.07, 0.03), 0.11 - k * 0.012, (1.15, 0.5, 0.8)), 0.014, 14, tsurf(0, z), k + 3), M['Shirt'])
p.add(cyl((0, 0.02, 1.02), 0.34, 0.39, 0.18, seg=32), M['Cloth'])      # high collar
p.add(cut(torus((0, 0.02, 1.1), 0.37, 0.025, seg=40, ring=8), (0, 0.0, 0), (0, 1, 0)), M['Trim'])
p.finish(ADMIN)

# ---- Great macaw on the left shoulder ---------------------------------------------------------
BX = Vector((-0.74, 0.04, 1.02))      # where its feet grip the shoulder
p = Part('trinket_macaw')
body_c = BX + Vector((-0.02, 0.0, 0.26))
p.add(sphere(body_c, 1, (0.16, 0.15, 0.27), (0.25, 0, 0)), M['MacawRed'])
p.add(sphere(body_c + Vector((0.0, -0.06, -0.04)), 1, (0.13, 0.1, 0.2), (0.25, 0, 0)), M['MacawRed'])
head = body_c + Vector((0.02, -0.07, 0.29))
p.add(sphere(head, 0.135, (1, 1.05, 1.0)), M['MacawRed'])
p.add(sphere(head + Vector((0.03, -0.09, 0.0)), 0.075, (1.05, 0.6, 0.95)), M['White'])         # bare face patch
for k in range(3):
    p.add(aim(None, head + Vector((-0.02, -0.14, -0.03 + k * 0.025)), head + Vector((0.07, -0.13, -0.03 + k * 0.025)), 0.004, 0.004, 4), M['Dark'])
p.add(sphere(head + Vector((0.07, -0.1, 0.03)), 0.026), M['Pupil'])
p.add(sphere(head + Vector((0.075, -0.115, 0.04)), 0.008), M['White'])
beak_root = head + Vector((0.0, -0.13, -0.01))
p.add(lock([beak_root, beak_root + Vector((0.0, -0.09, 0.0)), beak_root + Vector((0.0, -0.12, -0.07)), beak_root + Vector((0.0, -0.09, -0.12))],
           0.06, 0.006, 0.9, seg=10, steps=6, taper=1.2), M['Beak'])
p.add(lock([beak_root + Vector((0, -0.01, -0.05)), beak_root + Vector((0, -0.07, -0.07)), beak_root + Vector((0, -0.06, -0.1))], 0.035, 0.008, 1.0, seg=8), M['BeakDark'])
# folded wing (outer side, facing the viewer's left) in red, yellow, blue bands
for k, (col, z0, L) in enumerate((('MacawRed', 0.12, 0.28), ('MacawYellow', 0.02, 0.34), ('MacawGreen', -0.06, 0.4), ('MacawBlue', -0.14, 0.5))):
    start = body_c + Vector((-0.12, -0.02 + k * 0.01, z0 + 0.08))
    pts = [start, start + Vector((-0.03, 0.04, -L * 0.45)), start + Vector((0.0, 0.08, -L))]
    p.add(lock(pts, 0.1 - k * 0.012, 0.012, 0.3, seg=10, steps=6, wide=(0, 1, 0.2), swell=0.25), M[col])
# long tail feathers hanging behind the arm
for k, (col, dx, L) in enumerate((('MacawRed', 0.0, 0.85), ('MacawBlue', -0.05, 0.75), ('MacawRed', 0.05, 0.7), ('MacawBlue', 0.02, 0.62))):
    s0 = body_c + Vector((dx, 0.1, -0.2))
    pts = [s0, s0 + Vector((dx * 0.5, 0.08, -L * 0.5)), s0 + Vector((dx, 0.12, -L))]
    p.add(lock(pts, 0.05, 0.008, 0.3, seg=8, steps=6, wide=(1, 0, 0), swell=0.2), M[col])
# feet gripping the shoulder
for sx in (-1, 1):
    f0 = BX + Vector((sx * 0.05, -0.02, 0.04))
    for t in (-1, 0, 1):
        p.add(lock([f0, f0 + Vector((t * 0.035, -0.06, -0.01)), f0 + Vector((t * 0.04, -0.08, -0.05))], 0.016, 0.006, 1.0, seg=6, steps=4), M['Feet'])
    p.add(aim(None, f0, f0 + Vector((0, 0.0, 0.1)), 0.02, 0.025, 8), M['Feet'])
# a *great* macaw: scale the whole bird up from its feet and perch it a little further out
grow = Matrix.Translation(BX + Vector((-0.06, 0.02, -0.02))) @ Matrix.Diagonal((1.45, 1.45, 1.45, 1)) @ Matrix.Translation(-BX)
bmesh.ops.transform(p.bm, matrix=grow, verts=p.bm.verts)
p.finish(ADMIN)

# ---- Golden dice cup with jewels --------------------------------------------------------------
def mk_cup_gold():         # origin = mouth centre, opening facing -Z (upside down), like mk_cup
    it = [I(cut(cyl((0, 0, 0.21), 0.205, 0.165, 0.42, seg=36), (0, 0, 0.005), (0, 0, 1)), 'Trim'),
          I(torus((0, 0, 0.02), 0.205, 0.028, seg=40, ring=8), 'DarkGold'),
          I(torus((0, 0, 0.405), 0.165, 0.024, seg=40, ring=8), 'DarkGold'),
          I(torus((0, 0, 0.21), 0.19, 0.022, seg=40, ring=8), 'DarkGold'),
          I(cyl((0, 0, 0.01), 0.185, 0.185, 0.01, seg=36), 'Dark')]
    gems = ('Ruby', 'Emerald', 'Sapphire')
    for k in range(9):
        a = 2 * math.pi * k / 9
        r = 0.205
        c = Vector((math.cos(a) * r, math.sin(a) * r, 0.21))
        rot = Vector((0, 0, 1)).rotation_difference(Vector((math.cos(a), math.sin(a), 0))).to_euler()
        it.append(I(sphere(c, 0.03, (1, 1, 0.55), rot), gems[k % 3]))
        it.append(I(torus(c, 0.03, 0.008, rot, seg=12, ring=5), 'DarkGold'))
    for k in range(18):    # engraved flutes
        a = 2 * math.pi * k / 18
        it.append(I(aim(None, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.05), (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.18), 0.006, 0.006, 4), 'DarkGold'))
        it.append(I(aim(None, (math.cos(a) * 0.188, math.sin(a) * 0.188, 0.245), (math.cos(a) * 0.165, math.sin(a) * 0.165, 0.38), 0.006, 0.006, 4), 'DarkGold'))
    # little gold skull on the top
    it.append(I(sphere((0, 0, 0.47), 0.06, (1, 1, 0.9)), 'Trim'))
    it.append(I(box((0, -0.01, 0.43), (0.06, 0.05, 0.04)), 'Trim'))
    for sx in (-1, 1):
        it.append(I(sphere((sx * 0.022, -0.05, 0.47), 0.015, (1, 0.5, 1)), 'Ruby'))
    return it
build('cupgold_down', ADMIN, place(mk_cup_gold(), CUP))
build('cupgold_side', ADMIN, place(mk_cup_gold(), CUP + Vector((-0.62, 0.05, 0)), (0, 0, 0), 0.85))
build('cupgold_lift', ADMIN, place(mk_cup_gold(), lift_at, (math.radians(-35), math.radians(25), 0)))

# ---- Captain's pipe (churchwarden) --------------------------------------------------------------
def mk_pipe(at_bowl=False):
    """Long-stemmed pipe. Default origin = mouthpiece, stem along +X; at_bowl: origin = bowl centre."""
    stem = [Vector((0, 0, 0)), Vector((0.16, 0, -0.03)), Vector((0.34, 0, -0.12)), Vector((0.46, 0, -0.24)), Vector((0.5, 0, -0.3))]
    bowl_c = Vector((0.53, 0, -0.27))
    it = [I(lock(stem, 0.017, 0.022, 1.0, seg=10, steps=6, taper=1), 'Briar'),
          I(aim(None, (-0.02, 0, 0.003), (0.05, 0, -0.008), 0.012, 0.016, 10), 'BeakDark'),
          I(cut(sphere(bowl_c, 1, (0.075, 0.075, 0.1)), bowl_c + Vector((0, 0, 0.07)), (0, 0, -1)), 'Briar'),
          I(torus(bowl_c + Vector((0, 0, 0.07)), 0.068, 0.012, seg=24, ring=6), 'Briar'),
          I(cyl(bowl_c + Vector((0, 0, 0.068)), 0.058, 0.058, 0.004, seg=20), 'Dark'),
          I(lumpy(cyl(bowl_c + Vector((0, 0, 0.06)), 0.05, 0.045, 0.012, seg=16), 0.006, 30, bowl_c, 2), 'Ember'),
          I(torus(bowl_c + Vector((0, 0, -0.02)), 0.075, 0.008, seg=24, ring=5), 'Trim')]
    if at_bowl:
        for bm, _, _ in it:
            bmesh.ops.transform(bm, matrix=Matrix.Translation(-bowl_c), verts=bm.verts)
    return it
build('prop_pipe', PROPS, place(mk_pipe(), (-0.25, 0, 0.12), (0.25, 0, 0.35), 1.15))
build('teeth_pipe', ADMIN, place(mk_pipe(), MOUTH + Vector((0.06, -0.01, -0.01)), (0, 0, math.radians(-40)), 1.0))
build('hand_pipe', ADMIN, place(mk_pipe(at_bowl=True), (0.4, -1.03, 0.79), (0, math.radians(-10), math.radians(150)), 1.0))

# --------------------------------------------------------------------------- export
for ob in ROOT.all_objects:
    ob.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                          export_draco_position_quantization=12, export_draco_normal_quantization=8,
                          export_animations=False, export_cameras=False, export_lights=False)

# --------------------------------------------------------------------------- optional preview renders
def preview(name, show):
    if not PREVIEW:
        return
    for ob in ROOT.all_objects:
        ob.hide_render = ob.name not in show
    path = os.path.join(PREVIEW, name + '.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 3.2
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
    cam.location = (1.2, -6, 1.6); cam.rotation_euler = (math.radians(88), 0, math.radians(11))
    scene.camera = cam
    for loc, e in (((-3, -4, 5), 600), ((4, -3, 2), 250), ((0, 4, 4), 300)):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 4
        lo = bpy.data.objects.new('l', ld); lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)
    world = bpy.data.worlds.new('w'); scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.05, 0.08, 0.12, 1); bg.inputs[1].default_value = 0.6
    scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = scene.render.resolution_y = 360
    scene.render.film_transparent = False
    # contact sheets: lay out copies of combos in a grid and render once
    def sheet(name, rows, cols=4, dx=2.0, dz=2.9, turn=0.0, px=220, tilt=90):
        for ob in ROOT.all_objects:
            ob.hide_render = True
        tmp = []
        for i, parts in enumerate(rows):
            cx, cz = (i % cols) * dx, -(i // cols) * dz
            for pn in parts:
                src = bpy.data.objects.get(pn)
                if not src:
                    continue
                c = src.copy(); c.hide_render = False
                c.location = (cx, 0, cz); c.rotation_euler = (0, 0, turn)
                scene.collection.objects.link(c); tmp.append(c)
        nrows = (len(rows) + cols - 1) // cols
        w, h = cols * dx, nrows * dz
        cam_data.ortho_scale = max(w, h) + 0.2
        cam.rotation_euler = (math.radians(tilt), 0, 0)
        back = 14
        cam.location = ((cols - 1) * dx / 2, -back * math.sin(math.radians(tilt)), 1.0 - (nrows - 1) * dz / 2 + back * math.cos(math.radians(tilt)))
        scene.render.resolution_x = int(px * cols)
        scene.render.resolution_y = int(px * cols * h / w)
        cam_data.sensor_fit = 'HORIZONTAL'; cam_data.ortho_scale = w + 0.2
        scene.render.filepath = os.path.join(PREVIEW, name + '.png')
        bpy.ops.render.render(write_still=True)
        for c in tmp:
            bpy.data.objects.remove(c)
    ADM = ['base_davyjones', 'hat_admiral', 'top_admiral', 'trinket_macaw']
    sheet('sheet_admin', [ADM + ['table', 'arms_rest', 'cupgold_down'],
                          ADM + ['table', 'arms_rest', 'cupgold_down', 'teeth_pipe'],
                          ADM + ['table', 'arms_cigarhand', 'cupgold_down', 'hand_pipe'],
                          ADM + ['table', 'arms_lift', 'cupgold_lift', 'dice_table']], 2, dx=3.4, dz=3.3, turn=math.radians(-14), px=420, tilt=80)
    sheet('sheet_admin_parts', [['base_davyjones', 'top_striped', 'hair_bob'], ['base_deckhand', 'hair_crop', 'hat_admiral', 'top_captain'],
                                ['base_oldsalt', 'hair_crop', 'top_admiral'], ['base_deckhand', 'hair_crop', 'top_vest', 'trinket_macaw']], 4, turn=math.radians(-25), px=300)
    if os.environ.get('BNB_ONLY_ADMIN'):
        raise SystemExit(0)
    H = sorted(o.name for o in HAIR.objects)
    sheet('sheet_hair', [['base_deckhand', 'top_striped', h] for h in H], 4, turn=math.radians(-25))
    sheet('sheet_hair_back', [['base_deckhand', 'top_striped', h] for h in H], 4, turn=math.radians(140), px=160)
    poses = [['arms_rest', 'cup_down', 'table_drink'], ['arms_holddrink', 'cup_down', 'chest_drink'], ['arms_drink', 'cup_down', 'held_drink'],
             ['arms_rest', 'cup_down', 'table_drink_empty'], ['arms_smokedown', 'cup_down', 'hand_cigarette_L'],
             ['arms_smoke', 'cup_down', 'held_cigarette_M'], ['arms_lift', 'cup_lift', 'dice_table', 'lips_cigarette_S'],
             ['arms_rest', 'cup_down', 'teeth_cigar_L'], ['arms_cigarhand', 'cup_down', 'hand_cigar_M'],
             ['arms_cut', 'cup_side', 'plate_full', 'cut_tools'], ['arms_eat', 'cup_side', 'plate_half', 'held_fork'],
             ['arms_cut', 'cup_side', 'plate_bone', 'cut_tools'], ['arms_drink', 'cup_down', 'held_rum'], ['arms_rest', 'cup_down', 'table_rum_empty']]
    sheet('sheet_poses', [['base_deckhand', 'hair_crop', 'top_captain', 'table'] + p for p in poses], 4, dx=3.3, dz=3.0, turn=math.radians(-12), px=260, tilt=78)
    sheet('sheet_props', [[n] for n in sorted(o.name for o in PROPS.objects)], 6, dx=1.3, dz=1.3, turn=0.3, px=150, tilt=75)
    sheet('sheet_tops_hats', [['base_oldsalt', 'hair_crop', t] for t in sorted(o.name for o in TOPS.objects)]
          + [[b, 'hair_long', h, 'top_vest'] for b, h in zip(['base_deckhand', 'base_fishfolk', 'base_skeleton'], sorted(o.name for o in HATS.objects))], 4)
    sheet('sheet_trinkets_cos', [['base_deckhand', 'hair_crop', 'top_captain', t] for t in sorted(o.name for o in TRINK.objects)]
          + [['base_fishfolk' if i % 2 else 'base_deckhand', 'hair_slick', 'top_naval', c] for i, c in enumerate(sorted(o.name for o in COS.objects))], 5)

result = {'out': OUT, 'objects': sorted(o.name for o in ROOT.all_objects), 'count': len(ROOT.all_objects)}
print('BNB_RESULT', result)
