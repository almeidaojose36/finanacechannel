# Fact 13 hero shot: the EV battery pack as a studio product shot in the channel palette (navy, gold rim, cool accent).
#   blender -b -P blender/ev_battery.py -- still <out.png> [frame]
#   blender -b -P blender/ev_battery.py -- anim  <out_dir/> <frames> [fps] [step]
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

# ---------------------------------------------------------------- the pack (~2.0 m long), slowly turning on the floor
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets/models/ev-battery-pack.glb'))
pack = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); pack.select_set(True); bpy.context.view_layer.objects.active = pack
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
k = 2.0 / max(pack.dimensions.x, pack.dimensions.y)
pack.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
bb = [pack.matrix_world @ Vector(c) for c in pack.bound_box]
pack.location -= Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
turn = bpy.data.objects.new('Turn', None); sc.collection.objects.link(turn); pack.parent = turn
for f, r in ((1, math.radians(-18)), (FRAMES, math.radians(14))):
    turn.rotation_euler.z = r; turn.keyframe_insert('rotation_euler', frame=f)

# ---------------------------------------------------------------- glossy navy floor that curves up into a backdrop (studio cyclorama)
bpy.ops.mesh.primitive_plane_add(size=40); floor = bpy.context.object
fm = bpy.data.materials.new('Floor'); fm.use_nodes = True
fb = fm.node_tree.nodes['Principled BSDF']
fb.inputs['Base Color'].default_value = (0.006, 0.01, 0.03, 1); fb.inputs['Roughness'].default_value = 0.32
fb.inputs['Coat Weight'].default_value = 0.6
floor.data.materials.append(fm)

w = bpy.data.worlds.new('Studio'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.004, 0.008, 0.025, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

def area(name, loc, energy, color, size, aim=(0, 0, 0.1)):
    bpy.ops.object.light_add(type='AREA', location=loc); L = bpy.context.object; L.name = name
    L.data.energy = energy; L.data.color = color; L.data.size = size
    t = L.constraints.new('TRACK_TO'); e = bpy.data.objects.new(name + '_aim', None); sc.collection.objects.link(e); e.location = aim
    t.target = e; t.track_axis = 'TRACK_NEGATIVE_Z'; t.up_axis = 'UP_Y'
    return L
area('Key', (-2.2, -2.4, 3.6), 750, (1.0, 0.95, 0.9), 1.6)           # soft white key, front-left above
area('RimGold', (2.8, 2.4, 1.2), 1400, (1.0, 0.62, 0.18), 1.2)       # gold rim from behind-right
area('Accent', (-3.0, 2.2, 0.8), 500, (0.35, 0.65, 1.0), 1.0)        # cool accent from behind-left
area('Top', (0, 0, 4.5), 250, (0.9, 0.92, 1.0), 3.0)

# ---------------------------------------------------------------- camera: low front glide up to a high three-quarter look into the modules
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 50
target = bpy.data.objects.new('Target', None); sc.collection.objects.link(target); target.location = (0, 0, 0.12)
c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
cam.data.dof.use_dof = True; cam.data.dof.focus_object = target; cam.data.dof.aperture_fstop = 2.8
for f, p in ((1, Vector((1.6, -3.4, 0.45))), (FRAMES, Vector((1.9, -2.3, 2.1)))):
    cam.location = p; cam.keyframe_insert('location', frame=f)
if mode == 'still':
    sc.frame_set(int(args[2]) if len(args) > 2 else 72)

# ---------------------------------------------------------------- render (shared hero-shot settings)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 8; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.adaptive_threshold = 0.05
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 2
sc.render.use_persistent_data = True
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = 0.0
sc.render.use_motion_blur = mode == 'anim'
if mode == 'still':
    sc.render.filepath = out; bpy.ops.render.render(write_still=True)
else:
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
    sc.render.use_overwrite = False; sc.render.use_placeholder = True  # resumable: skip frames already rendered
    sc.render.filepath = out; bpy.ops.render.render(animation=True)
