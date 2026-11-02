# Fact 12 hero shot: the K2 Black Panther rolling across open ground at dusk (same look as the LNG shot).
#   blender -b -P blender/k2_tank.py -- still <out.png> [frame]
#   blender -b -P blender/k2_tank.py -- anim  <out_dir/> <frames> [fps]
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

# ---------------------------------------------------------------- tank (10.8 m long including the gun)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets/models/k2-tank.glb'))
tank = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); tank.select_set(True); bpy.context.view_layer.objects.active = tank
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
k = 10.8 / tank.dimensions.y
tank.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
bb = [tank.matrix_world @ Vector(c) for c in tank.bound_box]
tank.location -= Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
# the gun points along -Y: drive that way, 2.2 m/s
rig = bpy.data.objects.new('Rig', None); sc.collection.objects.link(rig); tank.parent = rig
for f, y in ((1, 6), (FRAMES, 6 - 2.2 * FRAMES / FPS)):
    rig.location = (0, y, 0); rig.keyframe_insert('location', frame=f)
for fc in rig.animation_data.action.fcurves:
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'

# ---------------------------------------------------------------- ground: rolling dirt with tracks of relief
bpy.ops.mesh.primitive_plane_add(size=1200)
ground = bpy.context.object
sub = ground.modifiers.new('Sub', 'SUBSURF'); sub.subdivision_type = 'SIMPLE'; sub.levels = sub.render_levels = 8
tex = bpy.data.textures.new('Dunes', 'CLOUDS'); tex.noise_scale = 60; tex.noise_depth = 2
disp = ground.modifiers.new('Disp', 'DISPLACE'); disp.texture = tex; disp.strength = 6; disp.mid_level = 0.5
gm = bpy.data.materials.new('Dirt'); gm.use_nodes = True
nt = gm.node_tree; bsdf = nt.nodes['Principled BSDF']
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 2.5; noise.inputs['Detail'].default_value = 8
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (0.10, 0.07, 0.045, 1); ramp.color_ramp.elements[1].color = (0.30, 0.22, 0.14, 1)
nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.7
fine = nt.nodes.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 25; fine.inputs['Detail'].default_value = 10
nt.links.new(fine.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = 0.95
ground.data.materials.append(gm)
for poly in ground.data.polygons: poly.use_smooth = True
ground.location.z = -3.0  # displacement mid-level sits the terrain around the tank's tracks
# flatten a strip under the tank's path so it doesn't sink into a dune
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -10, 0.01)); strip = bpy.context.object
strip.scale = (7, 120, 1); strip.data.materials.append(gm)

# ---------------------------------------------------------------- sky and light: identical to the LNG shot
w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True
wn = w.node_tree; sky = wn.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(2.5); sky.sun_rotation = math.radians(250)
sky.altitude = 50; sky.air_density = 1.4; sky.dust_density = 3.5
wn.links.new(sky.outputs['Color'], wn.nodes['Background'].inputs['Color'])
wn.nodes['Background'].inputs['Strength'].default_value = 0.3
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.data.energy = 4.0; sun.data.color = (1.0, 0.72, 0.42); sun.data.angle = math.radians(1.2)
sun.rotation_euler = (math.radians(85), 0, math.radians(250 + 90))
sc.world.mist_settings.start = 40

# ---------------------------------------------------------------- camera: low, ahead and to the side, tracking with the tank
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 40
target = bpy.data.objects.new('Target', None); sc.collection.objects.link(target); target.parent = rig; target.location = (0, -1.5, 1.6)
c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
cam.data.dof.use_dof = True; cam.data.dof.focus_object = target; cam.data.dof.aperture_fstop = 4
for f, p in ((1, Vector((11, -12, 1.4))), (FRAMES, Vector((8.5, -16 - 2.2 * FRAMES / FPS, 1.1)))):
    cam.location = p; cam.keyframe_insert('location', frame=f)
if mode == 'still':
    sc.frame_set(int(args[2]) if len(args) > 2 else 72)

# ---------------------------------------------------------------- render (same settings as the LNG shot)
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
