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
    boxo((0, 6.0, 3.0), (22, 0.3, 9), wall)                                          # back wall with planks
    for k in range(-10, 11):
        boxo((k * 1.05, 5.82, 3.0), (0.06, 0.08, 9), plank)
    boxo((0, 5.8, 0.2), (22, 0.12, 0.25), plank)
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
    TX, TY, TZ0 = RC.x, RC.y + RP + 0.1, -0.35            # the throne stands at the head of the round table
    boxo((TX, TY + 0.15, TZ0 / 2 - 0.2), (2.4, 1.6, TZ0 + 0.4), plank)                         # dais
    boxo((TX, TY + 0.15, TZ0 + 0.02), (2.5, 1.7, 0.06), gold)
    boxo((TX, TY + 0.05, TZ0 + 0.18), (1.8, 1.25, 0.3), velvet)                       # seat cushion
    boxo((TX, TY + 0.75, TZ0 + 1.7), (2.0, 0.25, 3.3), M['Wood']); boxo((TX, TY + 0.6, TZ0 + 1.55), (1.6, 0.08, 2.6), velvet)
    for sx in (-1, 1):
        boxo((TX + sx * 1.0, TY + 0.6, TZ0 + 1.9), (0.12, 0.3, 3.6), gold)
        boxo((TX + sx * 1.05, TY - 0.05, TZ0 + 0.75), (0.25, 1.3, 0.18), M['Wood'])   # armrests
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=(TX + sx * 1.05, TY - 0.7, TZ0 + 0.8)); own(bpy.context.object).data.materials.append(gold)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(TX + sx * 1.0, TY + 0.6, TZ0 + 3.8)); own(bpy.context.object).data.materials.append(gold)
    bpy.ops.mesh.primitive_cone_add(radius1=0.35, depth=0.5, location=(TX, TY + 0.6, TZ0 + 3.6)); own(bpy.context.object).data.materials.append(gold)
    pirate(['base_davyjones', 'hat_admiral', 'top_admiral', 'trinket_macaw', 'teeth_pipe', 'arms_rest', 'cupgold_down'], *seat_at(0),
           {'Skin': '#5d8f7c', 'Cloth': '#1b2a52', 'Sleeve': '#1b2a52', 'Hat': '#1b2a52'}, scale=1.08)
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
    cup = Vector((CX + 0.2, -0.82, 0.78))                                             # where the lifted cup's mouth is
    for k, t in enumerate((0.18, 0.36, 0.55, 0.74, 0.92)):                          # dice tumbling out in an arc toward the camera
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
    shoot('cover_landscape_raw', 1920, 1080, (0, -10.8, 4.6), (0, 0.6, 1.6), 30)
    shoot('cover_portrait_raw', 800, 1200, (0, -10.8, 4.4), (0, 0.9, 2.1), 46)
    shoot('cover_square_raw', 800, 800, (CX - 0.15, -4.9, 1.45), (CX, -1.0, 1.22), 33)
