# Bones & Brine — store cover art (CrazyGames: 1920x1080, 800x1200, 800x800). Run through build_pirates.py:
#   BNB_COVER=1 blender --background --factory-startup --python art/build_pirates.py -- <tmp.glb> <outdir>
# The title is added afterwards in the browser (tools/cover.html) so it can use the game's pirate font.
# Executed inside build_pirates.py after every part is built (uses its helpers and globals).
#  - landscape + portrait: a tavern dice game, the admin's Davy Jones on a throne at the back
#  - square: close-up of a pirate's hand with the cup, dice flying onto the table

def render_covers(outdir):
    scene = bpy.context.scene
    for ob in ROOT.all_objects:
        ob.hide_render = True
    coll = bpy.data.collections.new('cover'); scene.collection.children.link(coll)

    def own(ob):                                   # move a freshly added object into the cover collection
        for cl in list(ob.users_collection):
            cl.objects.unlink(ob)
        coll.objects.link(ob); ob.hide_render = False
        return ob

    def tinted(src, colors):
        c = src.copy(); c.data = src.data.copy(); c.hide_render = False
        for i, m in enumerate(c.data.materials):
            base = m.name.split('.')[0] if m else ''
            if base in colors:
                m2 = m.copy()
                b = next(n for n in m2.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                b.inputs['Base Color'].default_value = (*hex_lin(colors[base]), 1)
                c.data.materials[i] = m2
        coll.objects.link(c)
        return c

    def pirate(parts, at, turn=0.0, colors=None, per_part=None, scale=1.0):
        for pn in parts:
            src = bpy.data.objects.get(pn)
            if not src:
                print('cover: missing part', pn); continue
            col = dict(colors or {}); col.update((per_part or {}).get(pn, {}))
            c = tinted(src, col)
            c.matrix_world = (Matrix.Translation(Vector(at)) @ Matrix.Rotation(turn, 4, 'Z')
                              @ Matrix.Scale(scale, 4) @ src.matrix_world)

    def boxo(loc, size, mat_, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = own(bpy.context.object)
        o.scale = size; o.data.materials.append(mat_); return o

    def cylo(loc, r, depth, mat_, rot=(0, 0, 0), verts=32):
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts); o = own(bpy.context.object)
        o.data.materials.append(mat_); bpy.ops.object.shade_smooth(); return o

    def point(loc, energy, color, soft=0.2):
        bpy.ops.object.light_add(type='POINT', location=loc); L = own(bpy.context.object)
        L.data.energy = energy; L.data.color = color; L.data.shadow_soft_size = soft
        if energy < 150:
            L.data.use_shadow = False       # candles: glow only (too many shadow casters overflow EEVEE's shadow buffer)
        return L

    def area(loc, target, energy, color, size):
        bpy.ops.object.light_add(type='AREA', location=loc); L = own(bpy.context.object)
        L.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        L.data.energy = energy; L.data.color = color; L.data.size = size; return L

    PIPS = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)], 4: [(-1, -1), (1, -1), (-1, 1), (1, 1)],
            5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)], 6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)]}
    # face normal -> pip count (opposite faces add up to 7), plus two in-face axes
    FACES = [((0, 0, 1), 1, (1, 0, 0), (0, 1, 0)), ((0, 0, -1), 6, (1, 0, 0), (0, 1, 0)), ((0, -1, 0), 2, (1, 0, 0), (0, 0, 1)),
             ((0, 1, 0), 5, (1, 0, 0), (0, 0, 1)), ((1, 0, 0), 3, (0, 1, 0), (0, 0, 1)), ((-1, 0, 0), 4, (0, 1, 0), (0, 0, 1))]
    def die(loc, rot, s=0.16):
        """A proper die with pips on every face (the game's mk_die only marks the top)."""
        R = Euler(rot).to_matrix(); c = Vector(loc)
        it = [I(box(loc, (s, s, s), rot), 'DiceW', False)]
        for n, count, u, v in FACES:
            n, u, v = Vector(n), Vector(u), Vector(v)
            for (a, b) in PIPS[count]:
                p = c + R @ (n * (s / 2 + 0.002) + u * (a * s * 0.26) + v * (b * s * 0.26))
                it.append(I(sphere(p, s * 0.085, (1, 1, 0.35), (R @ n).to_track_quat('Z', 'Y').to_euler()), 'Pupil'))
        build('cover_die_%d' % len(coll.objects), coll, it)

    TOP = max((bpy.data.objects['table'].matrix_world @ Vector(v)).z for v in bpy.data.objects['table'].bound_box)
    wax, flame = mat('Wax', '#efe3c4', 0.6), M['Ember']
    wall, plank = mat('TavernWall', '#2a1a10', 0.85), mat('TavernPlank', '#3a2414', 0.8)
    velvet, gold = mat('Velvet', '#6e1420', 0.75), mat('ThroneGold', '#e2ad3f', 0.3, 1.0)
    lamp = mat('LampGlow', '#ffb45a', 0.3, 0, 8.0)

    def candle(x, y, h, z=TOP):
        cylo((x, y, z + h / 2), 0.08, h, wax, verts=20)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=(x, y, z + h + 0.06)); f = own(bpy.context.object)
        f.scale = (0.7, 0.7, 1.7); f.data.materials.append(flame)
        point((x, y, z + h + 0.22), 90, (1.0, 0.6, 0.28), 0.1)

    # ======================= the tavern (landscape + portrait) =======================
    RC, RP = Vector((0, -0.9, 0)), 3.4                     # round table centre, and how far the pirates sit from it
    RT = RP - 0.55                                         # table radius: their cups and hands rest on it
    cylo((RC.x, RC.y, TOP - 0.08), RT, 0.16, M['TableWood'], verts=96)
    cylo((RC.x, RC.y, TOP - 0.2), RT + 0.04, 0.14, M['TableEdge'], verts=96)
    cylo((RC.x, RC.y, TOP - 1.2), 0.45, 2.0, M['TableEdge'], verts=32)              # pedestal
    boxo((0, 0, TOP - 2.25), (34, 34, 0.1), plank)                                   # tavern floor
    for k in range(-16, 17):
        boxo((k * 0.9, 0, TOP - 2.19), (0.03, 34, 0.02), M['TableEdge'])
    def seat_at(deg):                                      # (position, turn) for a pirate at this angle round the back of the table
        a = math.radians(deg)
        return (RC.x + RP * math.sin(a), RC.y + RP * math.cos(a), 0), -a
    boxo((0, 6.0, 4.0), (44, 0.3, 14), wall)                                          # back wall with planks
    for k in range(-20, 21):
        boxo((k * 1.05, 5.82, 4.0), (0.06, 0.08, 14), plank)
    boxo((0, 5.8, 0.2), (44, 0.12, 0.25), plank)
    for x in (-5.6, 5.6):                                                            # barrels in the corners
        for (dx, dz) in ((0, 0.6), (1.1, 0.6), (0.55, 1.75)):
            b = cylo((x + (dx if x < 0 else -dx), 4.6, dz), 0.55, 1.15, mat('BarrelSide', '#7a4a24', 0.8), verts=28)
            for zz in (-0.4, 0.4):
                cylo((b.location.x, 4.6, dz + zz), 0.565, 0.06, M['Steel'], verts=28)
    for x in (-3.3, 3.3):                                                            # hanging lanterns
        boxo((x, 3.4, 4.25), (0.05, 0.05, 1.2), M['Dark'])
        boxo((x, 3.4, 3.55), (0.32, 0.32, 0.42), lamp)
        boxo((x, 3.4, 3.8), (0.4, 0.4, 0.06), M['Dark']); boxo((x, 3.4, 3.32), (0.4, 0.4, 0.06), M['Dark'])
        point((x, 3.4, 3.4), 420, (1.0, 0.66, 0.32), 0.3)

    # the throne, with the admin's Davy Jones on it (raised at the back)
    DJ_UP, DJ_SCALE = 0.75, 1.4                            # the admin sits bigger and higher than everyone else
    TX, TY, TZ0 = RC.x, RC.y + RP + 0.45, -0.35 + DJ_UP   # the throne stands at the head of the round table
    boxo((TX, TY + 0.45, TZ0 / 2 - 0.2), (3.2, 1.4, TZ0 + 0.4), plank)                         # dais
    boxo((TX, TY + 0.15, TZ0 + 0.02), (3.3, 2.1, 0.06), gold)
    boxo((TX, TY + 0.05, TZ0 + 0.18), (2.5, 1.5, 0.3), velvet)                       # seat cushion
    boxo((TX, TY + 0.85, TZ0 + 2.1), (2.8, 0.25, 4.1), M['Wood']); boxo((TX, TY + 0.7, TZ0 + 1.95), (2.3, 0.08, 3.3), velvet)
    for sx in (-1, 1):
        boxo((TX + sx * 1.4, TY + 0.7, TZ0 + 2.25), (0.14, 0.32, 4.4), gold)
        boxo((TX + sx * 1.45, TY - 0.05, TZ0 + 0.85), (0.28, 1.5, 0.2), M['Wood'])   # armrests
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=(TX + sx * 1.45, TY - 0.8, TZ0 + 0.9)); own(bpy.context.object).data.materials.append(gold)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(TX + sx * 1.4, TY + 0.7, TZ0 + 4.55)); own(bpy.context.object).data.materials.append(gold)
    bpy.ops.mesh.primitive_cone_add(radius1=0.45, depth=0.6, location=(TX, TY + 0.85, TZ0 + 4.4)); own(bpy.context.object).data.materials.append(gold)
    DJ_AT = (RC.x, RC.y + RP + 0.35, DJ_UP)
    pirate(['cupgold_down'], *seat_at(0))                                            # his golden cup stays on the table
    pirate(['base_davyjones', 'hat_admiral', 'top_admiral', 'trinket_macaw', 'teeth_pipe'], DJ_AT, 0,
           {'Skin': '#5d8f7c', 'Cloth': '#1b2a52', 'Sleeve': '#1b2a52', 'Hat': '#1b2a52'}, scale=DJ_SCALE)
    point((TX, TY - 1.6, TZ0 + 3.2), 260, (0.55, 0.85, 0.8), 0.6)                     # eerie sea-green glow on the captain

    # four pirates at the table
    pirate(['base_fishfolk', 'hat_tricorn', 'top_naval', 'trinket_necklace', 'arms_lift', 'cup_lift', 'dice_table'],
           *seat_at(-74), {'Skin': '#4a9bc2', 'Cloth': '#2e5e3a', 'Sleeve': '#2e5e3a', 'Hat': '#2b1d14'})
    pirate(['base_deckhand', 'hair_slick', 'hat_bicorne', 'top_naval', 'cos_scar', 'cos_goatee', 'trinket_spyglass', 'arms_drink', 'held_drink', 'cup_down'],
           *seat_at(-38), {'Skin': '#c08657', 'Hair': '#1b1b1b', 'Cloth': '#1f3b7a', 'Sleeve': '#1f3b7a', 'Hat': '#1f3b7a'})
    pirate(['base_deckhand', 'hat_bandana', 'top_rags', 'cos_freckles', 'arms_rest', 'cupbarrel_down'],      # the powder monkey (shaved under the bandana)
           *seat_at(38), {'Skin': '#f6d2b3', 'Hair': '#c9772d', 'Cloth': '#7a6a4a', 'Sleeve': '#7a6a4a', 'Hat': '#c8273a'},
           per_part={'hat_bandana': {'White': '#151515'}}, scale=0.8)
    pirate(['base_skeleton', 'hat_tricorn', 'top_rags', 'trinket_earring', 'arms_smoke', 'held_cigarette_M', 'cupbone_down'],
           *seat_at(74), {'Skin': '#f1ead6', 'Cloth': '#3b2a1a', 'Sleeve': '#3b2a1a', 'Hat': '#7a1f1f'})
    # lower bodies and chairs (the game's pirates are modelled chest-up; the covers show the whole pirate seated)
    FLOOR = TOP - 2.2
    chairwood = mat('ChairWood', '#5a3519', 0.8)
    def limb(p0, p1, r, mat_):
        p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(p0 + p1) / 2, vertices=20); o = own(bpy.context.object)
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); o.data.materials.append(mat_); bpy.ops.object.shade_smooth()
        return o
    def seated(at, turn, pants, chair=True, hip=0.62, thigh_z=-0.4, reach=0.95, k=1.0):
        Mw = Matrix.Translation(Vector(at)) @ Matrix.Rotation(turn, 4, 'Z')
        L = lambda x, y, z: Mw @ Vector((x, y, z))
        pm = mat('Pants_' + pants, pants, 0.85)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=L(0, 0.02, -0.22), segments=28, ring_count=14); h = own(bpy.context.object)
        h.scale = (hip, hip * 0.9, 0.42); h.rotation_euler = (0, 0, turn); h.data.materials.append(pm); bpy.ops.object.shade_smooth()   # hips
        for sx in (-1, 1):
            knee, ankle = L(sx * 0.28 * k, -reach, thigh_z), L(sx * 0.3 * k, -reach - 0.1, FLOOR - at[2] + 0.12)
            limb(L(sx * 0.28 * k, -0.05, thigh_z + 0.02), knee, 0.21 * k, pm)             # thigh
            limb(knee, ankle, 0.16 * k, pm)                                           # shin
            bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=L(sx * 0.3 * k, -reach - 0.23, FLOOR - at[2] + 0.1)); b = own(bpy.context.object)
            b.scale = (0.17 * k, 0.3 * k, 0.12 * k); b.rotation_euler = (0, 0, turn); b.data.materials.append(M['Leather']); bpy.ops.object.shade_smooth()   # boot
        if not chair:
            return
        st = -0.62                                                                    # seat top (local z)
        o = boxo(L(0, 0.05, st - 0.06), (1.35, 1.2, 0.12), chairwood); o.rotation_euler = (0, 0, turn)
        for sx in (-1, 1):
            for sy in (-1, 1):
                lz0, lz1 = st - 0.12, FLOOR - at[2]
                o = boxo(L(sx * 0.58, 0.05 + sy * 0.5, (lz0 + lz1) / 2), (0.1, 0.1, lz0 - lz1), chairwood); o.rotation_euler = (0, 0, turn)
            o = boxo(L(sx * 0.58, 0.62, 0.35), (0.1, 0.1, 1.9), chairwood); o.rotation_euler = (0, 0, turn)       # back posts
        for z in (0.55, 1.15):
            o = boxo(L(0, 0.62, z), (1.25, 0.08, 0.16), chairwood); o.rotation_euler = (0, 0, turn)               # back rails

    seated(*seat_at(-74), '#3a3f2a'); seated(*seat_at(-38), '#e8e1d0'); seated(*seat_at(38), '#5a4a32', hip=0.55); seated(*seat_at(74), '#2a2320')
    seated(DJ_AT, 0, '#1b2a52', chair=False, hip=0.68 * DJ_SCALE, thigh_z=0.02, reach=0.82, k=1.3)   # Davy Jones's legs, down the front of the throne
    for (x, y, h) in ((RC.x, RC.y + 0.2, 0.5), (RC.x - 1.3, RC.y - 1.6, 0.3), (RC.x + 1.45, RC.y - 1.5, 0.4)):
        candle(x, y, h)
    for (x, y, rz) in ((RC.x - 0.5, RC.y - 0.9, 0.3), (RC.x + 0.45, RC.y - 1.15, 1.1), (RC.x + 0.1, RC.y - 2.0, 0.6), (RC.x - 1.2, RC.y - 0.4, 0.9), (RC.x + 1.3, RC.y - 0.5, 0.2), (RC.x - 0.3, RC.y - 2.2, 0.7)):
        die((x, y, TOP + 0.08), (0, 0, rz))
    area((0, -7, 6.5), (0, 0, 1.2), 650, (1.0, 0.8, 0.6), 6)
    area((-7, -3, 3.5), (0, 0, 1.4), 220, (1.0, 0.68, 0.42), 3)
    area((0, 5, 6), (0, -1, 1.5), 350, (0.4, 0.6, 1.0), 6)                          # cool rim from behind

    # ======================= close-up (square): cup in hand, dice flying =======================
    CX = 40.0
    cylo((CX, -3.0, TOP - 0.08), 2.4, 0.16, M['TableWood'], verts=96)              # same round table, seen up close
    cylo((CX, -3.0, TOP - 0.2), 2.44, 0.14, M['TableEdge'], verts=96)
    boxo((CX, 4.5, 2.5), (10, 0.3, 7), wall)
    for k in range(-4, 5):
        boxo((CX + k * 1.05, 4.32, 2.5), (0.06, 0.08, 7), plank)
    pirate(['base_deckhand', 'hair_wild', 'hat_tricorn', 'top_captain', 'cos_mustache', 'cos_goldtooth', 'trinket_parrot', 'arms_lift', 'cup_lift'],
           (CX, 0.2, 0), 0, {'Cloth': '#8c2323', 'Sleeve': '#8c2323', 'Hair': '#4a2c16', 'Hat': '#2b1d14'})
    seated((CX, 0.2, 0), 0, '#2a2320')                                # the close-up's captain, on his chair
    cup = Vector((CX + 0.2, -0.82, 0.78))                                             # where the lifted cup's mouth is
    for k, t in enumerate((0.3, 0.58, 0.85)):                                       # 3 dice tumbling out toward the camera (5 in all: one cup)
        p = cup.lerp(Vector((CX - 0.25 + 0.18 * k - 0.4, -2.35, TOP + 0.09)), t)
        p.z += math.sin(t * math.pi) * 0.35
        die(tuple(p), (k * 0.9 + 0.3, k * 1.3, k * 0.7), 0.13 + 0.02 * k)
    for (x, y, rz) in ((CX - 0.55, -2.5, 0.4), (CX + 0.35, -2.65, 1.2)):
        die((x, y, TOP + 0.08), (0, 0, rz), 0.17)
    candle(CX - 1.5, -1.3, 0.45); candle(CX + 1.55, -1.1, 0.35)
    area((CX + 1.5, -5, 4), (CX, -1.2, 1.0), 380, (1.0, 0.8, 0.6), 3)
    area((CX - 2, 3.5, 4), (CX, 0, 1.4), 300, (0.4, 0.6, 1.0), 4)
    point((CX + 0.2, -1.6, 1.3), 120, (1.0, 0.7, 0.4), 0.2)

    # world, camera, render
    w = scene.world.node_tree.nodes.get('Background')
    if w:
        w.inputs[0].default_value = (0.01, 0.012, 0.02, 1); w.inputs[1].default_value = 1.0
    cam_ob = bpy.data.objects.new('cover_cam', bpy.data.cameras.new('cover_cam')); coll.objects.link(cam_ob)
    scene.camera = cam_ob
    try:
        scene.eevee.taa_render_samples = 64
    except Exception:
        pass
    def shoot(name, w, h, loc, target, lens):
        cam_ob.location = Vector(loc)
        cam_ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        cam_ob.data.lens = lens; cam_ob.data.sensor_fit = 'AUTO'
        scene.render.resolution_x, scene.render.resolution_y = w, h
        scene.render.resolution_percentage = 100
        scene.render.filepath = os.path.join(outdir, name + '.png')
        bpy.ops.render.render(write_still=True)
    shoot('cover_landscape_raw', 1920, 1080, (0, -12.0, 4.4), (0, 0.6, 2.25), 27)
    shoot('cover_portrait_raw', 800, 1200, (0, -12.0, 4.3), (0, 0.9, 2.75), 40)
    shoot('cover_square_raw', 800, 800, (CX - 0.15, -4.9, 1.45), (CX, -1.0, 1.22), 33)
