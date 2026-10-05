import math
import unittest
from scene import Scene, geometry, parse_vertices, LIBRARY
from editor import Editor
from types import SimpleNamespace

class SceneTests(unittest.TestCase):
    def test_objects_move_independently(self):
        scene=Scene();a=scene.add(kind='square');b=scene.add(kind='circle',x=200)
        original=list(a.world_paths()[0]); moved=scene.move(a.id,35,-20)
        self.assertEqual((b.x,b.y),(200,0))
        for old,new in zip(original,moved.world_paths()[0]):
            self.assertAlmostEqual(new[0]-old[0],35)
            self.assertAlmostEqual(new[1]-old[1],-20)
    def test_regular_polygon_side_lengths_and_closure(self):
        for n in [3,4,5,6,12,100]:
            path=geometry('regular_polygon',80,n)[0]
            self.assertEqual(len(path),n+1);self.assertEqual(path[0],path[-1])
            for a,b in zip(path,path[1:]):self.assertAlmostEqual(math.dist(a,b),80)
    def test_rotation_and_translation(self):
        obj=Scene().add(kind='custom_polygon',vertices='0,0; 100,0; 0,50',angle=90,x=30,y=40)
        points=obj.world_paths()[0]
        self.assertAlmostEqual(points[1][0],30);self.assertAlmostEqual(points[1][1],140)
        self.assertAlmostEqual(points[2][0],-20)
    def test_failed_edit_preserves_existing_object(self):
        scene=Scene();obj=scene.add(kind='square',size=70)
        with self.assertRaises(ValueError):scene.update(obj.id,size=float('nan'),x=50)
        self.assertIs(scene.objects[obj.id],obj);self.assertEqual(obj.x,0)
    def test_invalid_input(self):
        for size in [0,-2,float('nan'),float('inf'),10001]:
            with self.assertRaises(ValueError):geometry('circle',size)
        for n in [2,101,4.5]:
            with self.assertRaises(ValueError):geometry('regular_polygon',100,n)
        for text in ['0,0;1,1','0,0;1,1;nan,2','0,0;1,2,3;2,1','abc','0,0;0,0;0,0']:
            with self.assertRaises(ValueError):parse_vertices(text)
    def test_delete_and_id_stability(self):
        scene=Scene();a=scene.add(kind='square');b=scene.add(kind='square')
        scene.delete(a.id);c=scene.add(kind='square')
        self.assertEqual(list(scene.objects),[b.id,c.id]);self.assertGreater(c.id,b.id)
    def test_all_available_shapes_render_finite_paths(self):
        for kind in LIBRARY:
            obj=Scene().add(kind=kind)
            for path in obj.world_paths():
                self.assertGreaterEqual(len(path),2)
                self.assertTrue(all(math.isfinite(v) for point in path for v in point))
    def test_drag_converts_screen_y_and_updates_fields(self):
        scene=Scene();a=scene.add(kind='square');b=scene.add(kind='circle',x=300)
        class Var:
            def set(self,value):self.value=value
        view=SimpleNamespace(scene=scene,selected=a.id,drag_point=(100,100),
                             inputs={'x':Var(),'y':Var()},render=lambda:None)
        Editor.drag(view,SimpleNamespace(x=125,y=80))
        self.assertEqual((scene.objects[a.id].x,scene.objects[a.id].y),(25,20))
        self.assertEqual((b.x,b.y),(300,0));self.assertEqual(view.inputs['y'].value,'20')
    def test_hit_uses_topmost_object_and_ignores_grid(self):
        canvas=SimpleNamespace(find_overlapping=lambda *a:(1,2,3),
            gettags=lambda item:{1:('grid',),2:('object:1',),3:('object:2',)}[item])
        self.assertEqual(Editor.hit(SimpleNamespace(canvas=canvas),10,10),2)

if __name__=='__main__':unittest.main()
