"""GUI-independent shape objects and geometry for EucliDraw."""
from dataclasses import dataclass, field
import json
import math
from pathlib import Path

LIBRARY = {item['name']: item['paths'] for item in json.loads(
    Path(__file__).with_name('shape_library.json').read_text())}
REGULAR = {'equilateral_triangle': 3, 'square': 4, 'pentagon': 5,
           'hexagon': 6, 'heptagon': 7, 'octagon': 8, 'nonagon': 9,
           'decagon': 10, 'hendecagon': 11, 'dodecagon': 12}
LABELS = {'equilateral_triangle': '정삼각형', 'square': '정사각형',
          'rectangle': '직사각형', 'circle': '원', 'pentagon': '정오각형',
          'hexagon': '정육각형', 'custom_polygon': '직접 입력한 다각형',
          'regular_polygon': '정다각형 (변 개수 입력)', 'hexagram': '육각별',
          'vertical_ellipse': '세로 타원', 'horizontal_ellipse': '가로 타원'}

def positive(value, name):
    value = float(value)
    if not math.isfinite(value) or not 0 < value <= 10000:
        raise ValueError(f'{name}: 0보다 크고 10000 이하인 수를 입력하세요.')
    return value

def finite(value, name):
    value = float(value)
    if not math.isfinite(value) or abs(value) > 1000000:
        raise ValueError(f'{name}: -1000000부터 1000000 사이의 유한한 수를 입력하세요.')
    return value

def parse_vertices(text):
    """Vertices use mathematical coordinates: x right, y up."""
    try:
        vertices = [tuple(float(v.strip()) for v in row.split(','))
                    for row in text.split(';') if row.strip()]
    except ValueError:
        raise ValueError('꼭짓점은 x,y; x,y; x,y 형식으로 입력하세요.') from None
    if not 3 <= len(vertices) <= 200 or any(len(p) != 2 for p in vertices):
        raise ValueError('꼭짓점을 3~200개 입력하세요. 예: 0,0; 100,0; 50,80')
    for x, y in vertices:
        finite(x, '꼭짓점 X'); finite(y, '꼭짓점 Y')
    if len(set(vertices)) < 3:
        raise ValueError('서로 다른 꼭짓점이 최소 3개 필요합니다.')
    return vertices

def regular(n, side):
    if isinstance(n, bool) or int(n) != n or not 3 <= n <= 100:
        raise ValueError('변 개수는 3~100 사이의 정수여야 합니다.')
    radius = side / (2 * math.sin(math.pi / n))
    vertices = [(radius * math.cos(2*math.pi*i/n + math.pi/2),
                 radius * math.sin(2*math.pi*i/n + math.pi/2)) for i in range(n)]
    return [vertices + [vertices[0]]]

def geometry(kind, size=100, sides=5, vertices=None):
    size = positive(size, '크기')
    if kind in REGULAR or kind == 'regular_polygon':
        return regular(REGULAR.get(kind, sides), size)
    if kind == 'custom_polygon':
        vertices = parse_vertices(vertices)
        # User vertex coordinates are exact local units; size does not scale them.
        return [vertices + [vertices[0]]]
    if kind == 'rectangle':
        return [[(-size/2, -size/4), (size/2, -size/4),
                 (size/2, size/4), (-size/2, size/4), (-size/2, -size/4)]]
    if kind in ('circle', 'vertical_ellipse', 'horizontal_ellipse'):
        rx, ry = (size, size)
        if kind == 'vertical_ellipse': rx = size/2
        if kind == 'horizontal_ellipse': ry = size/2
        points = [(rx*math.cos(math.tau*i/360), ry*math.sin(math.tau*i/360))
                  for i in range(360)]
        return [points + [points[0]]]
    if kind not in LIBRARY:
        raise ValueError('지원하지 않는 도형입니다.')
    paths = LIBRARY[kind]
    points = [p for path in paths for p in path]
    cx = (min(x for x,y in points)+max(x for x,y in points))/2
    cy = (min(y for x,y in points)+max(y for x,y in points))/2
    return [[((x-cx)*size/100, (y-cy)*size/100) for x,y in path] for path in paths]

@dataclass
class ShapeObject:
    id: int
    kind: str
    x: float = 0
    y: float = 0
    size: float = 100
    angle: float = 0
    color: str = '#284bd5'
    width: float = 3
    sides: int = 5
    vertices: str = '0,0; 100,0; 50,80'
    name: str = ''
    paths: list = field(init=False, repr=False)

    def __post_init__(self):
        self.x = finite(self.x, 'X'); self.y = finite(self.y, 'Y')
        self.angle = finite(self.angle, '회전')
        self.width = positive(self.width, '선 두께')
        if self.width > 30: raise ValueError('선 두께는 30 이하로 입력하세요.')
        self.paths = geometry(self.kind, self.size, self.sides, self.vertices)
        if not self.name: self.name = LABELS.get(self.kind, self.kind.replace('_', ' '))

    def world_paths(self):
        a = math.radians(self.angle)
        c, s = math.cos(a), math.sin(a)
        return [[(self.x+x*c-y*s, self.y+x*s+y*c) for x,y in path]
                for path in self.paths]

class Scene:
    def __init__(self):
        self.objects = {}
        self.next_id = 1

    def add(self, **properties):
        obj = ShapeObject(self.next_id, **properties)
        self.objects[obj.id] = obj
        self.next_id += 1
        return obj

    def update(self, object_id, **properties):
        old = self.objects[object_id]
        values = {key: getattr(old, key) for key in ShapeObject.__dataclass_fields__
                  if key not in ('paths', 'id')}
        values.update(properties)
        candidate = ShapeObject(object_id, **values)
        self.objects[object_id] = candidate
        return candidate

    def move(self, object_id, dx, dy):
        old = self.objects[object_id]
        return self.update(object_id, x=old.x+dx, y=old.y+dy)

    def delete(self, object_id):
        self.objects.pop(object_id, None)
