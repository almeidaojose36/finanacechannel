# Fact 14 hero shot: the LNG carrier at sea at golden hour.
#   blender -b -P blender/lng_carrier.py -- still <out.png> [frame]
#   blender -b -P blender/lng_carrier.py -- anim  <out_dir/> <frames> [fps]
import bpy, sys, math, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
mode, out = args[0], args[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
FPS = int(args[3]) if mode == 'anim' and len(args) > 3 else 24
FRAMES = int(args[2]) if mode == 'anim' else 1
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, FRAMES

# ---------------------------------------------------------------- ship (real length ~295 m)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets/models/lng-carrier.glb'))
ship = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); ship.select_set(True); bpy.context.view_layer.objects.active = ship
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
dims = ship.dimensions
k = 295 / max(dims)
ship.scale = (k, k, k)
bpy.ops.object.transform_apply(scale=True)
# sit the hull so roughly 11 m is below the waterline
zmin = min((ship.matrix_world @ Vector(c)).z for c in ship.bound_box)
ship.location.z -= zmin + 16
for m in ship.data.materials:  # model came with one PBR material; keep it, make it a little glossier
    b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    if b: b.inputs['Roughness'].default_value = 0.45

# ---------------------------------------------------------------- ocean
bpy.ops.mesh.primitive_plane_add(size=10)
sea = bpy.context.object; sea.name = 'Ocean'
oc = sea.modifiers.new('Ocean', 'OCEAN')
oc.geometry_mode = 'GENERATE'; oc.repeat_x = oc.repeat_y = 8
oc.spatial_size = 160; oc.resolution = 14; oc.wave_scale = 2.6; oc.choppiness = 1.6
oc.wind_velocity = 14; oc.wave_alignment = 0.4; oc.wave_direction = 0.8
oc.time = 1.0
oc.keyframe_insert('time', frame=1)
oc.time = 1.0 + FRAMES / FPS
oc.keyframe_insert('time', frame=max(2, FRAMES))
for fc in (sea.animation_data.action.fcurves if sea.animation_data else []):
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
sea.location = (-160 * 8 / 2, -160 * 8 / 2, 0)  # generated grid starts at the origin: centre it on the ship
# a flat far sea out to the horizon with the same material
bpy.ops.mesh.primitive_plane_add(size=20000, location=(0, 0, -0.6)); far = bpy.context.object
bpy.ops.object.select_all(action='DESELECT'); sea.select_set(True); bpy.context.view_layer.objects.active = sea
wm = bpy.data.materials.new('Sea'); wm.use_nodes = True
b = wm.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.005, 0.02, 0.05, 1)
b.inputs['Roughness'].default_value = 0.06
b.inputs['IOR'].default_value = 1.33
sea.data.materials.append(wm); far.data.materials.append(wm)
bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- sky: low golden sun, navy above (channel palette)
w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True
nt = w.node_tree; sky = nt.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(1.2); sky.sun_rotation = math.radians(250)
sky.altitude = 50; sky.air_density = 1.4; sky.dust_density = 2.5
nt.links.new(sky.outputs['Color'], nt.nodes['Background'].inputs['Color'])
nt.nodes['Background'].inputs['Strength'].default_value = 0.3
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.data.energy = 4.0; sun.data.color = (1.0, 0.72, 0.42); sun.data.angle = math.radians(1.2)
sun.rotation_euler = (math.radians(86), 0, math.radians(250 + 90))

# ---------------------------------------------------------------- camera: low over the water, slow push along the bow
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 32; cam.data.sensor_width = 36
target = bpy.data.objects.new('Target', None); sc.collection.objects.link(target)
c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
cam.data.dof.use_dof = True; cam.data.dof.focus_object = target; cam.data.dof.aperture_fstop = 8
# ship's long axis is Y; bow at -Y: start ahead of the bow, slide back along the deck
p0, p1 = Vector((190, -300, 34)), Vector((175, -170, 28))
t0, t1 = Vector((0, -70, 14)), Vector((0, -10, 16))
for f, p, t in ((1, p0, t0), (max(2, FRAMES), p1, t1)):
    cam.location = p; cam.keyframe_insert('location', frame=f)
    target.location = t; target.keyframe_insert('location', frame=f)
if mode == 'still':
    f = int(args[2]) if len(args) > 2 else 1
    sc.frame_set(f)

# ---------------------------------------------------------------- render
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 8; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.adaptive_threshold = 0.05
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 2
sc.render.use_persistent_data = True
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.15
sc.render.use_motion_blur = mode == 'anim'
if mode == 'still':
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
else:
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
    sc.render.filepath = out
    bpy.ops.render.render(animation=True)
