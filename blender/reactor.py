# Fact 2 hero shot: Barakah's four APR1400 units on the Gulf coast at dusk (same look as the LNG and K2 shots).
#   blender -b -P blender/reactor.py -- still <out.png> [frame]
#   blender -b -P blender/reactor.py -- anim  <out_dir/> <frames> [fps] [step]
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

# ---------------------------------------------------------------- one APR1400 unit (containment ~70 m tall), then three linked copies
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets/models/reactor-apr1400.glb'))
unit = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); unit.select_set(True); bpy.context.view_layer.objects.active = unit
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
k = 70 / unit.dimensions.z
unit.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
bb = [unit.matrix_world @ Vector(c) for c in unit.bound_box]
unit.location -= Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
span = unit.dimensions.x * 1.15
for i in range(1, 4):
    u = unit.copy(); u.data = unit.data  # linked duplicate: Cycles instances the 1.5M-triangle mesh
    u.location.x += i * span; sc.collection.objects.link(u)
mid_x = 1.5 * span

# ---------------------------------------------------------------- desert ground, the Gulf behind
bpy.ops.mesh.primitive_plane_add(size=6000, location=(mid_x, 0, 0)); ground = bpy.context.object
gm = bpy.data.materials.new('Sand'); gm.use_nodes = True
nt = gm.node_tree; bsdf = nt.nodes['Principled BSDF']
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.02; noise.inputs['Detail'].default_value = 8
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (0.36, 0.27, 0.17, 1); ramp.color_ramp.elements[1].color = (0.55, 0.43, 0.29, 1)
nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.95
ground.data.materials.append(gm)
bpy.ops.mesh.primitive_plane_add(size=1, location=(mid_x, 700 + 450000, 0.3)); sea = bpy.context.object
sea.scale = (1200000, 900000, 1)  # coastline behind the plant, out past the horizon
wm = bpy.data.materials.new('Gulf'); wm.use_nodes = True
wb = wm.node_tree.nodes['Principled BSDF']
wb.inputs['Base Color'].default_value = (0.006, 0.025, 0.05, 1); wb.inputs['Roughness'].default_value = 0.08
wave = wm.node_tree.nodes.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 0.08; wave.inputs['Distortion'].default_value = 6
bump = wm.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.15
wm.node_tree.links.new(wave.outputs['Fac'], bump.inputs['Height']); wm.node_tree.links.new(bump.outputs['Normal'], wb.inputs['Normal'])
sea.data.materials.append(wm)

# ---------------------------------------------------------------- sky and sun: same as the other hero shots
w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True
wn = w.node_tree; sky = wn.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(3); sky.sun_rotation = math.radians(250)
sky.altitude = 50; sky.air_density = 1.0; sky.dust_density = 1.2
wn.links.new(sky.outputs['Color'], wn.nodes['Background'].inputs['Color'])
wn.nodes['Background'].inputs['Strength'].default_value = 0.3
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.data.energy = 4.0; sun.data.color = (1.0, 0.72, 0.42); sun.data.angle = math.radians(1.2)
sun.rotation_euler = (math.radians(84), 0, math.radians(250 + 90))

# ---------------------------------------------------------------- camera: drone pass along the row, descending
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 35; cam.data.clip_end = 900000
target = bpy.data.objects.new('Target', None); sc.collection.objects.link(target)
c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
for f, p, t in ((1, Vector((-260, -620, 200)), Vector((mid_x * 0.6, 420, 0))), (FRAMES, Vector((mid_x * 0.9, -540, 120)), Vector((mid_x * 1.2, 460, 10)))):
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
