# Fact 17 hero shot: ship-to-shore cranes at Busan New Port at dusk, one lifting a container off a moored ship.
#   blender -b -P blender/container_crane.py -- still <out.png> [frame]
#   blender -b -P blender/container_crane.py -- anim  <out_dir/> <frames> [fps] [step]
import bpy, sys, math, os, random
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
mode, out = args[0], args[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
random.seed(17)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
FPS = int(args[3]) if mode == 'anim' and len(args) > 3 else 24
FRAMES = int(args[2]) if mode == 'anim' else 144
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, FRAMES
sc.frame_step = int(args[4]) if mode == 'anim' and len(args) > 4 else 1

def mat(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

# ---------------------------------------------------------------- crane (~75 m tall), boom out over the water (+X), three along the quay (Y)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets/models/container-crane.glb'))
crane = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); crane.select_set(True); bpy.context.view_layer.objects.active = crane
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
k = 75 / crane.dimensions.z
crane.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
bb = [crane.matrix_world @ Vector(c) for c in crane.bound_box]
crane.location -= Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
CL = crane.dimensions.x
for i, y in enumerate((-70, 70)):
    c = crane.copy(); c.data = crane.data; c.location.y += y; sc.collection.objects.link(c)

# ---------------------------------------------------------------- quay, water, moored ship, containers
QUAY_EDGE = CL * 0.18                         # quay edge sits under the crane's seaward legs
concrete = mat('Concrete', (0.32, 0.31, 0.30), 0.85)
bpy.ops.mesh.primitive_cube_add(location=(QUAY_EDGE - 400, 0, -1)); quay = bpy.context.object
quay.scale = (400, 900, 1); quay.data.materials.append(concrete)
bpy.ops.mesh.primitive_plane_add(size=1, location=(QUAY_EDGE + 5000, 0, -2.5)); water = bpy.context.object
water.scale = (10000, 20000, 1)
wm = mat('Harbour', (0.006, 0.02, 0.035), 0.07)
wave = wm.node_tree.nodes.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 0.15; wave.inputs['Distortion'].default_value = 8
bump = wm.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12
wm.node_tree.links.new(wave.outputs['Fac'], bump.inputs['Height']); wm.node_tree.links.new(bump.outputs['Normal'], wm.node_tree.nodes['Principled BSDF'].inputs['Normal'])
water.data.materials.append(wm)
# container ship alongside: dark hull + bays of stacked containers
hull_m = mat('Hull', (0.05, 0.07, 0.1), 0.5, 0.3)
SHIP_X = QUAY_EDGE + 26
bpy.ops.mesh.primitive_cube_add(location=(SHIP_X, 0, 4)); hull = bpy.context.object
hull.scale = (24, 170, 9); hull.data.materials.append(hull_m)
bev = hull.modifiers.new('Bevel', 'BEVEL'); bev.width = 3; bev.segments = 3
cols = [(0.55, 0.08, 0.06), (0.06, 0.18, 0.40), (0.85, 0.55, 0.10), (0.10, 0.35, 0.22), (0.45, 0.45, 0.47), (0.70, 0.30, 0.08), (0.12, 0.12, 0.14)]
cmats = [mat(f'Box{i}', c, 0.55, 0.4) for i, c in enumerate(cols)]
box_mesh = bpy.data.meshes.new('ContainerMesh')
bpy.ops.mesh.primitive_cube_add(); proto = bpy.context.object; proto.scale = (1.22, 3.05, 1.3); bpy.ops.object.transform_apply(scale=True)
def container(x, y, z, rot=0.0):
    o = proto.copy(); o.data = proto.data.copy(); o.data.materials.append(random.choice(cmats))
    o.location = (x, y, z); o.rotation_euler.z = rot; sc.collection.objects.link(o); return o
for by in range(-150, 150, 7):            # ship bays
    for cx in range(-4, 5):
        for cz in range(random.randint(3, 6)):
            container(SHIP_X + cx * 2.5, by, 13.4 + cz * 2.6)
for row in range(14):                     # yard stacks behind the quay
    for by in range(-160, 160, 7):
        for cz in range(random.randint(1, 4)):
            container(QUAY_EDGE - 60 - row * 3.2, by + (row % 2) * 1.5, 1.3 + cz * 2.6)
proto.hide_render = True; proto.hide_viewport = True
# the container being lifted by the middle crane
lift = container(SHIP_X - 2, 0, 28.0)
for f, z, x in ((1, 28.0, SHIP_X - 2), (int(FRAMES * 0.55), 52.0, SHIP_X - 2), (FRAMES, 54.0, SHIP_X - 30)):
    lift.location = (x, 0, z); lift.keyframe_insert('location', frame=f)
cable_m = mat('Cable', (0.05, 0.05, 0.05), 0.4, 0.8)
bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=1); cable = bpy.context.object; cable.data.materials.append(cable_m)
cable.parent = lift; cable.location = (0, 0, 14); cable.scale = (1, 1, 26)

# ---------------------------------------------------------------- sky and sun (shared hero look, low haze)
w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True
wn = w.node_tree; sky = wn.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(3); sky.sun_rotation = math.radians(250)
sky.altitude = 50; sky.air_density = 1.0; sky.dust_density = 1.2
wn.links.new(sky.outputs['Color'], wn.nodes['Background'].inputs['Color'])
wn.nodes['Background'].inputs['Strength'].default_value = 0.3
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.data.energy = 4.0; sun.data.color = (1.0, 0.72, 0.42); sun.data.angle = math.radians(1.2)
sun.rotation_euler = (math.radians(84), 0, math.radians(250 + 90))

# ---------------------------------------------------------------- camera: drifting down the quay at crane height, looking across to the ship
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 28; cam.data.clip_end = 50000
target = bpy.data.objects.new('Target', None); sc.collection.objects.link(target)
c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
for f, p, t in ((1, Vector((QUAY_EDGE - 70, -230, 55)), Vector((SHIP_X - 10, -10, 30))), (FRAMES, Vector((QUAY_EDGE - 60, -150, 42)), Vector((SHIP_X - 10, 20, 34)))):
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
