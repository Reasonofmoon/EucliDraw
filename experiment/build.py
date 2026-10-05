import ast, json, math
from pathlib import Path
base = Path(__file__).resolve().parent
src = (base.parent / 'EucliDraw.py').read_text()
nodes = [n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and 147 <= n.lineno <= 536 and n.name != 'circle_input']
class Trace:
    def __init__(self):
        self.x=self.y=self.heading=0.; self.down=True; self.paths=[]; self.paths.append([[0.,0.]])
    def seth(self,h): self.heading=h
    def fd(self,d): self.goto(self.x+d*math.cos(math.radians(self.heading)),self.y+d*math.sin(math.radians(self.heading)))
    def goto(self,x,y=None):
        x,y=x if y is None else (x,y)
        if self.down: self.paths[-1].append([x,y])
        self.x,self.y=x,y
    def pos(self): return (self.x,self.y)
    def penup(self): self.down=False
    def pendown(self):
        if not self.down: self.paths.append([[self.x,self.y]])
        self.down=True
    def circle(self,r):
        cx=self.x-r*math.sin(math.radians(self.heading)); cy=self.y+r*math.cos(math.radians(self.heading))
        initial=math.atan2(self.y-cy,self.x-cx)
        for i in range(1,361):
            angle=initial+2*math.pi*i/360
            self.goto(cx+abs(r)*math.cos(angle),cy+abs(r)*math.sin(angle))
ns={'pi':math.pi}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'geometry','exec'),ns)
shapes=[]
for node in nodes:
    t=Trace(); ns['t']=t
    if node.name=='hexagram':
        points=[(100*math.cos(math.radians(i*60)),100*math.sin(math.radians(i*60))) for i in range(6)]
        for group in [(0,2,4,0),(1,3,5,1)]:
            t.penup(); t.goto(points[group[0]]); t.pendown()
            for j in group[1:]: t.goto(points[j])
    elif node.name=='circle': ns[node.name](100)
    else: ns[node.name]()
    paths=[p for p in t.paths if len(p)>1]
    assert paths and all(math.isfinite(v) for p in paths for point in p for v in point)
    shapes.append({'name':node.name,'paths':paths})
html=(base/'template.html').read_text().replace('__SHAPE_DATA__',json.dumps(shapes))
(base/'index.html').write_text(html)
print(f'Built {len(shapes)} shapes: {base / "index.html"}')
