# Facts 6 and 10 hero shot: a Seoul apartment danji (rows of identical towers) at dusk, mountains behind, drone rising.
#   blender -b -P blender/seoul_apartments.py -- still <out.png> [frame]
#   blender -b -P blender/seoul_apartments.py -- anim  <out_dir/> <frames> [fps] [step]
import bpy, sys, math, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
mode, out = args[0], args[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
FPS = int(args[3]) if mode == 'anim' and len(args) > 3 else 24
FRAMES = int(args[2]) if mode == 'anim' else 144
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, FRAMES
sc.frame_step = int(args[4]) if mode == 'anim' and len(args) > 4 else 1

# ---------------------------------------------------------------- one tower (~75 m, about 25 floors), repeated in rows as linked copies
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets/models/seoul-apartment.glb'))
tower = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); tower.select_set(True); bpy.context.view_layer.objects.active = tower
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
k = 75 / tower.dimensions.z
tower.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
bb = [tower.matrix_world @ Vector(c) for c in tower.bound_box]
tower.location -= Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
TW, TD = tower.dimensions.x, tower.dimensions.y
first = True
for row in range(4):
    for col in range(4):
        if first:
            first = False; continue
        t = tower.copy(); t.data = tower.data
        t.location = (col * (TW + 30) + (row % 2) * 18, row * (TD + 55), 0)
        sc.collection.objects.link(t)
CX = 1.5 * (TW + 30); CY = 1.5 * (TD + 55)

# ---------------------------------------------------------------- grounds: paths and grass between the blocks, roads around
def mat(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m
bpy.ops.mesh.primitive_plane_add(size=20000, location=(CX, CY, 0)); ground = bpy.context.object
ground.data.materials.append(mat('Asphalt', (0.05, 0.05, 0.055), 0.9))
bpy.ops.mesh.primitive_plane_add(size=1, location=(CX, CY, 0.05)); lawn = bpy.context.object
lawn.scale = (CX * 2 + 160, CY * 2 + 120, 1); lawn.data.materials.append(mat('Grounds', (0.08, 0.12, 0.06), 0.9))
# mountains behind the complex (Seoul sits in a ring of granite ridges)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=220, y_subdivisions=60, size=1, location=(CX, CY + 2600, 0)); hills = bpy.context.object
hills.scale = (9000, 2600, 1)
tex = bpy.data.textures.new('Ridges', 'CLOUDS'); tex.noise_scale = 0.18; tex.noise_depth = 4
disp = hills.modifiers.new('Disp', 'DISPLACE'); disp.texture = tex; disp.strength = 900; disp.mid_level = 0.35
hills.data.materials.append(mat('Ridge', (0.015, 0.03, 0.018), 0.95))  # forested granite ridges
for p in hills.data.polygons: p.use_smooth = True

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

# ---------------------------------------------------------------- camera: drone rising between the rows towards the ridgeline
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 28; cam.data.clip_end = 60000
target = bpy.data.objects.new('Target', None); sc.collection.objects.link(target)
c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
for f, p, t in ((1, Vector((CX - TW * 0.5, -160, 30)), Vector((CX, CY, 40))), (FRAMES, Vector((CX - TW * 0.3, -120, 110)), Vector((CX, CY + 300, 60)))):
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
    sc.render.use_overwrite = False; sc.render.use_placeholder = True  # resumable: skip frames already rendered
    sc.render.filepath = out; bpy.ops.render.render(animation=True)
