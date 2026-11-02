# Fact 16 hero shot: a car carrier at Hyundai's private Ulsan quay at dusk, new cars driving up the stern ramp.
#   blender -b -P blender/car_carrier.py -- still <out.png> [frame]
#   blender -b -P blender/car_carrier.py -- anim  <out_dir/> <frames> [fps] [step]
import bpy, sys, math, os, random
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
mode, out = args[0], args[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
random.seed(16)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
FPS = int(args[3]) if mode == 'anim' and len(args) > 3 else 24
FRAMES = int(args[2]) if mode == 'anim' else 144
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, FRAMES
sc.frame_step = int(args[4]) if mode == 'anim' and len(args) > 4 else 1

def mat(name, rgb, rough=0.6, metal=0.0, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['Coat Weight'].default_value = coat
    return m

# ---------------------------------------------------------------- ship: ~200 m pure car and truck carrier, about 9 m draft
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets/models/car-carrier.glb'))
ship = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); ship.select_set(True); bpy.context.view_layer.objects.active = ship
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
k = 200 / ship.dimensions.y
ship.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
bb = [ship.matrix_world @ Vector(c) for c in ship.bound_box]
ship.location -= Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb) + 11))
HALF_W = ship.dimensions.x / 2
STERN_Y = 100 - 6                                   # stern taken as +Y end

# ---------------------------------------------------------------- quay on the ship's +X side, harbour water
QX = HALF_W + 2
concrete = mat('Concrete', (0.30, 0.29, 0.28), 0.85)
Q_END = STERN_Y + 45                          # the quay stops just past the stern ramp
bpy.ops.mesh.primitive_cube_add(location=(QX + 300, (Q_END - 500) / 2, 1)); quay = bpy.context.object
quay.scale = (300, (Q_END + 500) / 2, 3); quay.data.materials.append(concrete)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.5)); water = bpy.context.object
water.scale = (80000, 80000, 1)
wm = mat('Harbour', (0.006, 0.02, 0.035), 0.07)
wave = wm.node_tree.nodes.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 0.15; wave.inputs['Distortion'].default_value = 8
bump = wm.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12
wm.node_tree.links.new(wave.outputs['Fac'], bump.inputs['Height']); wm.node_tree.links.new(bump.outputs['Normal'], wm.node_tree.nodes['Principled BSDF'].inputs['Normal'])
water.data.materials.append(wm)

RAMP_TOP = Vector((HALF_W - 4, STERN_Y, 9.0)); RAMP_BOT = Vector((QX + 30, STERN_Y + 22, 4.0))
# the stern-quarter door the ramp folds down from: a dark doorway on the hull surface, warm car-deck light inside
door_frame = mat('DoorFrame', (0.10, 0.11, 0.12), 0.5, 0.7)
deck = bpy.data.materials.new('CarDeck'); deck.use_nodes = True
dn = deck.node_tree; db = dn.nodes['Principled BSDF']
db.inputs['Base Color'].default_value = (0.01, 0.01, 0.012, 1)
grad = dn.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'QUADRATIC_SPHERE'
tc = dn.nodes.new('ShaderNodeTexCoord'); mp = dn.nodes.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (-0.5, -0.5, 0)
dn.links.new(tc.outputs['UV'], mp.inputs['Vector']); dn.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
em = dn.nodes.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; em.inputs[1].default_value = 1.4
dn.links.new(grad.outputs['Fac'], em.inputs[0])
db.inputs['Emission Color'].default_value = (1.0, 0.75, 0.45, 1); dn.links.new(em.outputs[0], db.inputs['Emission Strength'])
DOOR_W, DOOR_H = 12.0, 6.5
DX = HALF_W * 0.42                                # door sits on the quay side of the stern
bpy.context.view_layer.update()
hit, loc, nrm, *_ = sc.ray_cast(bpy.context.view_layer.depsgraph, Vector((DX, 400, RAMP_TOP.z + DOOR_H / 2)), Vector((0, -1, 0)))
fy = loc.y if hit else 100
bpy.ops.mesh.primitive_plane_add(size=1, location=(DX, fy + 0.15, RAMP_TOP.z + DOOR_H / 2)); opening = bpy.context.object
opening.scale = (DOOR_W, DOOR_H, 1); opening.rotation_euler = (math.radians(90), 0, 0); opening.data.materials.append(deck)
for dz in (0, DOOR_H):   # sill and header
    bpy.ops.mesh.primitive_cube_add(location=(DX, fy + 0.3, RAMP_TOP.z + dz)); bar = bpy.context.object
    bar.scale = (DOOR_W / 2 + 0.4, 0.3, 0.3); bar.data.materials.append(door_frame)
for dy in (-1, 1):       # jambs
    bpy.ops.mesh.primitive_cube_add(location=(DX + dy * (DOOR_W / 2 + 0.2), fy + 0.3, RAMP_TOP.z + DOOR_H / 2)); jamb = bpy.context.object
    jamb.scale = (0.3, 0.3, DOOR_H / 2 + 0.3); jamb.data.materials.append(door_frame)
RAMP_TOP = Vector((DX, fy + 0.4, RAMP_TOP.z))       # the ramp hinges at the stern door sill
RAMP_BOT = Vector((QX + 22, fy + 34, 4.0))           # and lands on the quay past the stern

# stern quarter ramp from the ship down to the quay
ramp_m = mat('Ramp', (0.18, 0.19, 0.2), 0.5, 0.7)
bpy.ops.mesh.primitive_cube_add(); ramp = bpy.context.object; ramp.data.materials.append(ramp_m)
d = RAMP_BOT - RAMP_TOP; ramp.location = (RAMP_TOP + RAMP_BOT) / 2
ramp.scale = (d.length / 2, DOOR_W / 2 - 0.3, 0.4)
ramp.rotation_euler = (0, -math.atan2(d.z, math.hypot(d.x, d.y)), math.atan2(d.y, d.x))

# ---------------------------------------------------------------- new cars: one simple body mesh, many painted copies
paints = [mat(f'Paint{i}', c, 0.25, 0.6, 1.0) for i, c in enumerate([(0.8, 0.8, 0.82), (0.05, 0.05, 0.06), (0.35, 0.36, 0.38), (0.45, 0.04, 0.04), (0.04, 0.12, 0.30), (0.75, 0.75, 0.74)])]
glass = mat('Glass', (0.02, 0.03, 0.04), 0.05, 0.0, 1.0)
bpy.ops.mesh.primitive_cube_add(); body = bpy.context.object; body.scale = (0.9, 2.3, 0.45); body.location.z = 0.75
bpy.ops.object.transform_apply(location=True, scale=True)
bv = body.modifiers.new('Bevel', 'BEVEL'); bv.width = 0.25; bv.segments = 3
bpy.ops.mesh.primitive_cube_add(); cabin = bpy.context.object; cabin.scale = (0.8, 1.2, 0.35); cabin.location = (0, -0.2, 1.5)
bpy.ops.object.transform_apply(location=True, scale=True)
cv = cabin.modifiers.new('Bevel', 'BEVEL'); cv.width = 0.3; cv.segments = 3
cabin.data.materials.append(glass)
cabin.parent = body
def car(x, y, rot=0.0):
    b = body.copy(); b.data = body.data.copy(); b.data.materials.clear(); b.data.materials.append(random.choice(paints))
    b.location = (x, y, 4.0); b.rotation_euler.z = rot; sc.collection.objects.link(b)
    c = cabin.copy(); c.parent = b; sc.collection.objects.link(c)
    return b
for row in range(10):                       # parking lanes on the quay, waiting to load
    for i in range(40):
        car(QX + 45 + row * 5.2, -110 + i * 5.6)
# a line of cars driving up the ramp into the stern
path = [RAMP_BOT + Vector((40, 10, 0)), RAMP_BOT + Vector((12, 6, 0)), RAMP_BOT, RAMP_TOP, RAMP_TOP + Vector((0, -14, 0))]  # last leg disappears inside the deck
seg = [(path[i + 1] - path[i]).length for i in range(len(path) - 1)]; total = sum(seg)
def at(u):
    dist = u * total
    for i, L in enumerate(seg):
        if dist <= L or i == len(seg) - 1:
            return path[i].lerp(path[i + 1], min(1, dist / L)), path[i + 1] - path[i]
        dist -= L
for n in range(7):
    cobj = car(0, 0)
    for f in range(1, FRAMES + 1, 6):
        u = (f / FRAMES) * 0.85 + n * 0.12 - 0.35
        if u < 0 or u > 1:
            cobj.hide_render = True; cobj.keyframe_insert('hide_render', frame=f)
            for ch in cobj.children: ch.hide_render = True; ch.keyframe_insert('hide_render', frame=f)
            continue
        p, dvec = at(u)
        cobj.hide_render = False; cobj.keyframe_insert('hide_render', frame=f)
        for ch in cobj.children: ch.hide_render = False; ch.keyframe_insert('hide_render', frame=f)
        cobj.location = (p.x, p.y, p.z + 0.0 - 4.0 + 4.0); cobj.rotation_euler = (0, 0, math.atan2(dvec.y, dvec.x) - math.pi / 2)
        cobj.keyframe_insert('location', frame=f); cobj.keyframe_insert('rotation_euler', frame=f)
body.hide_render = True; cabin.hide_render = True

# ---------------------------------------------------------------- sky and sun (shared hero look)
w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True
wn = w.node_tree; sky = wn.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(3); sky.sun_rotation = math.radians(250)
sky.altitude = 50; sky.air_density = 1.0; sky.dust_density = 1.2
wn.links.new(sky.outputs['Color'], wn.nodes['Background'].inputs['Color'])
wn.nodes['Background'].inputs['Strength'].default_value = 0.3
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.data.energy = 4.0; sun.data.color = (1.0, 0.72, 0.42); sun.data.angle = math.radians(1.2)
sun.rotation_euler = (math.radians(84), 0, math.radians(250 + 90))

# ---------------------------------------------------------------- camera: high over the quay looking at the stern ramp, slow push
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 30; cam.data.clip_end = 100000
target = bpy.data.objects.new('Target', None); sc.collection.objects.link(target)
c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
for f, p, t in ((1, Vector((QX + 120, STERN_Y + 150, 60)), Vector((0, STERN_Y - 40, 12))), (FRAMES, Vector((QX + 90, STERN_Y + 110, 45)), Vector((0, STERN_Y - 20, 10)))):
    cam.location = p; cam.keyframe_insert('location', frame=f)
    target.location = t; target.keyframe_insert('location', frame=f)
if mode == 'still':
    sc.frame_set(int(args[2]) if len(args) > 2 else 72)

# ---------------------------------------------------------------- render (shared hero-shot settings)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 8; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.adaptive_threshold = 0.05
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 2
sc.render.use_persistent_data = True
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.15
sc.render.use_motion_blur = mode == 'anim'
if mode == 'still':
    sc.render.filepath = out; bpy.ops.render.render(write_still=True)
else:
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
    sc.render.filepath = out; bpy.ops.render.render(animation=True)
