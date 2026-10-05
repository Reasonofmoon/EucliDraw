"""Native Tkinter object editor. Run: python3 EucliDraw_experiment.py"""
import tkinter as tk
from tkinter import ttk, messagebox, colorchooser
from scene import Scene, LIBRARY, LABELS, REGULAR

class Editor:
    def __init__(self, root):
        self.root = root
        self.scene = Scene()
        self.selected = None
        self.drag_point = None
        root.title('EucliDraw — 도형 객체 편집기')
        root.geometry('1200x800')
        root.minsize(920, 650)
        style = ttk.Style(root)
        style.configure('TButton', padding=7)
        outer = ttk.Frame(root, padding=12)
        outer.pack(fill='both', expand=True)
        sidebar = ttk.Frame(outer, width=290)
        sidebar.pack(side='left', fill='y', padx=(0,12))
        workspace = ttk.Frame(outer)
        workspace.pack(side='right', fill='both', expand=True)
        ttk.Label(sidebar, text='EucliDraw', font=('',20,'bold')).pack(anchor='w')
        ttk.Label(sidebar, text='도형 추가 → 클릭 선택 → 드래그 이동').pack(anchor='w', pady=(4,12))
        kinds = ['regular_polygon', 'custom_polygon'] + list(LIBRARY)
        self.labels = {LABELS.get(k,k.replace('_',' ')): k for k in kinds}
        self.kind = tk.StringVar(value='정사각형')
        ttk.Label(sidebar, text='도형 종류').pack(anchor='w')
        self.combo = ttk.Combobox(sidebar, textvariable=self.kind,
                                  values=list(self.labels), state='readonly', width=31)
        self.combo.pack(fill='x', pady=(3,8))
        self.combo.bind('<<ComboboxSelected>>', self.kind_changed)
        form = ttk.Frame(sidebar)
        form.pack(fill='x')
        self.inputs = {}
        for row,(key,label,default) in enumerate([
            ('name','이름','정사각형'), ('size','크기 / 원의 반지름','100'),
            ('x','중심 X (오른쪽 +)','0'), ('y','중심 Y (위쪽 +)','0'),
            ('angle','회전 각도 (도)','0'), ('width','선 두께','3'),
            ('sides','정다각형 변 개수','5'), ('color','선 색상','#284bd5')]):
            ttk.Label(form,text=label).grid(row=row,column=0,sticky='w',pady=4)
            var=tk.StringVar(value=default); self.inputs[key]=var
            ttk.Entry(form,textvariable=var,width=17).grid(row=row,column=1,sticky='ew',padx=(8,0))
        form.columnconfigure(1,weight=1)
        ttk.Button(sidebar,text='색상 선택',command=self.choose_color).pack(fill='x',pady=6)
        ttk.Label(sidebar,text='직접 입력할 꼭짓점 (X,Y; X,Y; …)').pack(anchor='w',pady=(6,2))
        self.vertices=tk.Text(sidebar,height=3,width=31)
        self.vertices.insert('1.0','0,0; 100,0; 50,80')
        self.vertices.pack(fill='x')
        ttk.Label(sidebar,text='꼭짓점은 도형의 기준점에 대한 좌표입니다.\n직접 입력한 도형은 크기 대신 좌표를 수정하세요.',wraplength=290).pack(anchor='w',pady=5)
        ttk.Button(sidebar,text='새 도형 추가',command=self.add).pack(fill='x',pady=(8,4))
        ttk.Button(sidebar,text='선택한 도형에 적용',command=self.apply).pack(fill='x',pady=4)
        ttk.Button(sidebar,text='선택한 도형 삭제',command=self.delete).pack(fill='x',pady=4)
        ttk.Label(sidebar,text='도형 목록',font=('',11,'bold')).pack(anchor='w',pady=(12,4))
        self.listbox=tk.Listbox(sidebar,height=6,exportselection=False)
        self.listbox.pack(fill='both',expand=True)
        self.listbox.bind('<<ListboxSelect>>',self.list_select)
        ttk.Label(workspace,text='선택 테두리 내부를 드래그해 이동하세요. 빈 곳 클릭은 선택 해제합니다.').pack(anchor='w',pady=(0,8))
        self.canvas=tk.Canvas(workspace,bg='#fafcff',highlightthickness=1,
                              highlightbackground='#ccd6e4',takefocus=True)
        self.canvas.pack(fill='both',expand=True)
        self.status=tk.StringVar(value='새 도형을 추가하세요. X/Y와 크기를 직접 입력할 수 있습니다.')
        ttk.Label(workspace,textvariable=self.status,wraplength=750).pack(fill='x',pady=(8,0))
        self.canvas.bind('<Configure>',lambda e:self.render())
        self.canvas.bind('<Button-1>',self.press)
        self.canvas.bind('<B1-Motion>',self.drag)
        self.canvas.bind('<ButtonRelease-1>',self.release)
        self.canvas.bind('<Delete>',lambda e:self.delete())
        self.canvas.bind('<Escape>',lambda e:self.select(None))
        self.canvas.bind('<Left>',lambda e:self.nudge(-5,0))
        self.canvas.bind('<Right>',lambda e:self.nudge(5,0))
        self.canvas.bind('<Up>',lambda e:self.nudge(0,5))
        self.canvas.bind('<Down>',lambda e:self.nudge(0,-5))

    def kind_changed(self,event=None):
        self.inputs['name'].set(self.kind.get())

    def properties(self):
        try:
            p={k:v.get().strip() for k,v in self.inputs.items()}
            for key in ['size','x','y','angle','width']: p[key]=float(p[key])
            p['sides']=int(p['sides'])
            self.root.winfo_rgb(p['color'])
            p['kind']=self.labels[self.kind.get()]
            p['vertices']=self.vertices.get('1.0','end').strip()
            return p
        except (ValueError,tk.TclError,KeyError):
            raise ValueError('숫자 입력과 색상을 확인하세요. 색상 예: #284bd5') from None

    def choose_color(self):
        color=colorchooser.askcolor(parent=self.root)[1]
        if color:self.inputs['color'].set(color)

    def add(self):
        try: obj=self.scene.add(**self.properties())
        except ValueError as e:messagebox.showerror('입력 확인',str(e),parent=self.root);return
        self.select(obj.id)

    def apply(self):
        if self.selected is None:
            self.status.set('먼저 수정할 도형을 클릭하거나 목록에서 선택하세요.');return
        try:self.scene.update(self.selected,**self.properties())
        except ValueError as e:messagebox.showerror('입력 확인',str(e),parent=self.root);return
        self.select(self.selected)

    def select(self,object_id):
        self.selected=object_id
        if object_id is not None:
            obj=self.scene.objects[object_id]
            label=next(label for label,kind in self.labels.items() if kind==obj.kind)
            self.kind.set(label)
            for key,var in self.inputs.items():
                value=getattr(obj,key)
                var.set(f'{value:g}' if isinstance(value,(int,float)) else value)
            self.vertices.delete('1.0','end');self.vertices.insert('1.0',obj.vertices)
            legacy=obj.kind not in ('regular_polygon','custom_polygon','rectangle','circle','vertical_ellipse','horizontal_ellipse') and obj.kind not in REGULAR
            self.status.set(f'선택: {obj.name} (#{obj.id}) · 드래그 또는 방향키로 이동'+(' · 원본 근사 도형: 수학적 정확성은 별도 확인이 필요합니다.' if legacy else ''))
        else:self.status.set('선택 해제됨. 새 도형을 추가하거나 기존 도형을 클릭하세요.')
        self.refresh_list();self.render()

    def refresh_list(self):
        self.listbox.delete(0,'end')
        for i,obj in enumerate(self.scene.objects.values()):
            self.listbox.insert('end',f'#{obj.id}  {obj.name}')
            if obj.id==self.selected:self.listbox.selection_set(i)

    def list_select(self,event):
        choice=self.listbox.curselection()
        if choice:self.select(list(self.scene.objects)[choice[0]])

    def render(self):
        c=self.canvas;c.delete('all')
        w,h=c.winfo_width(),c.winfo_height()
        self.origin=(w/2,h/2)
        c.create_line(0,h/2,w,h/2,fill='#dce4ee',tags='grid')
        c.create_line(w/2,0,w/2,h,fill='#dce4ee',tags='grid')
        c.create_text(w/2+8,h/2+12,text='0,0',anchor='w',fill='#8694a8',tags='grid')
        for obj in self.scene.objects.values():
            tag=f'object:{obj.id}'
            for path in obj.world_paths():
                points=[v for x,y in path for v in (w/2+x,h/2-y)]
                c.create_line(*points,fill=obj.color,width=obj.width,tags=(tag,),joinstyle='round')
        if self.selected is not None:
            box=c.bbox(f'object:{self.selected}')
            if box:
                x1,y1,x2,y2=box
                c.create_rectangle(x1-8,y1-8,x2+8,y2+8,outline='#e89024',dash=(5,3),tags='selection')

    def hit(self,x,y):
        # Stroke hits take priority; empty interiors use reverse object stacking order.
        for item in reversed(self.canvas.find_overlapping(x-5,y-5,x+5,y+5)):
            for tag in self.canvas.gettags(item):
                if tag.startswith('object:'):return int(tag.split(':')[1])
        for obj in reversed(list(self.scene.objects.values())):
            box=self.canvas.bbox(f'object:{obj.id}')
            if box and box[0]-8<=x<=box[2]+8 and box[1]-8<=y<=box[3]+8:return obj.id
        return None

    def press(self,event):
        self.canvas.focus_set()
        self.select(self.hit(event.x,event.y))
        self.drag_point=(event.x,event.y) if self.selected is not None else None

    def drag(self,event):
        if self.selected is None or self.drag_point is None:return
        dx,dy=event.x-self.drag_point[0],self.drag_point[1]-event.y
        try:obj=self.scene.move(self.selected,dx,dy)
        except ValueError:return
        self.drag_point=(event.x,event.y)
        self.inputs['x'].set(f'{obj.x:g}');self.inputs['y'].set(f'{obj.y:g}')
        self.render()

    def release(self,event):self.drag_point=None

    def nudge(self,dx,dy):
        if self.selected is not None:
            try:self.scene.move(self.selected,dx,dy)
            except ValueError:return
            self.select(self.selected)

    def delete(self):
        if self.selected is not None:
            self.scene.delete(self.selected);self.select(None)

def main():
    root=tk.Tk()
    Editor(root)
    root.mainloop()

if __name__=='__main__':main()
