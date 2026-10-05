EucliDraw is a Python-based educational tool that brings 2D Euclidean geometry to life through intuitive shape visualization. Using the built-in turtle graphics module, users can input the name of a polygon (e.g., triangle, square, hexagon), and the program draws it while displaying its geometric properties.

🎯 Features

🟢 Interactive user input to choose shapes by name

🟢 Built-in library of polygons with customizable side lengths

🟢 Dynamic visualization using Python's turtle module

🟢 Easy to extend with new shapes and styles

🟢 Beginner-friendly code — ideal for learning Python and geometry together

🧮 Supported Shapes
Triangle

Square

Pentagon

Hexagon

Octagon

…and more!
## 🔄 Recent Updates to EucliDraw

### 🧩 GUI Enhancements
- Introduced a menu bar to provide more control and customization:
  - **Canvas**
    - Clear Canvas
  - **Visibility of Pointer**
    - Show Pointer
    - Hide Pointer
  - **Appearance of Pointer**
    - Classic
    - Arrow
    - Turtle
    - Square
    - Triangle
    - Circle
- Added a **Start** button to begin shape rendering

### 🐢 Embedded Turtle Graphics
- Turtle graphics now run inside the GUI canvas window
- Real-time feedback and visualization within the EucliDraw interface

### 📧 Error Reporting System
- If a user enters an invalid shape or incorrect input:
  - The app displays an error message
  - An automatic email report is generated
    - Includes which input field triggered the error
    - Logs user-entered data for troubleshooting

### 🎯 Other Improvements
- Smoother UX with more intuitive interactions
- Bug fixes and logic refinements to support the expanded GUI

### Updates
-Introduced support for concave polygons.
- Added: star polygons (polygrams), sector and segment of a circle, quatrefoil, heart, and annulus  
- Made some tweaks and adjustments to improve structure and drawing accuracy

## Presentation
Extract EucliDraw_Overview.zip for ppt

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Object editor

Launch the upgraded native Tkinter editor:

```bash
python3 EucliDraw_experiment.py
```

On Debian or Ubuntu, install `python3-tk` if Tkinter is unavailable. The editor
uses only the Python standard library and does not require email credentials.
The original `EucliDraw.py` remains available as the legacy Turtle application.

- Choose a shape, enter its properties, and click **새 도형 추가** to create an object.
- Click a shape or select it in the object list. Drag inside its bounding box to
  move it. The X/Y fields update as it moves; X points right and Y points up.
- Edit the name, size, X/Y, rotation in degrees, stroke color, or line width,
  then click **선택한 도형에 적용**. Changes affect only the selected object.
- Choose **정다각형 (변 개수 입력)** to specify 3–100 sides. Size means side length
  for regular polygons and radius for circles. Ellipse size is its major radius.
- Choose **직접 입력한 다각형** and enter local vertices, for example
  `0,0; 100,0; 50,80`. The editor closes the polygon automatically. Its size is
  controlled by vertex coordinates; the size field does not scale custom vertices.
- Use **선택한 도형 삭제** to delete the selected object. With the canvas focused,
  arrow keys move it by five units, Delete removes it, and Escape deselects it.

Regular polygons, circles, rectangles, and ellipses use calculated geometry.
Other shapes retain the original approximate paths, with the hexagram indexing
error corrected. The UI marks those legacy shapes as requiring separate
mathematical verification. One canvas unit equals one screen pixel. Objects are
kept in memory for the current session; closing the window discards the scene.

Run the object and interaction logic checks without a display:

```bash
python3 -m unittest discover -s tests -v
```

## Web math editor checkpoint

The browser-based first milestone adds mathematical coordinates, dynamic midpoints,
undo/redo, autosave, file import/export, and SVG output. Run it with Node.js 24+:

```bash
cd web
npm run dev
```

Open http://127.0.0.1:4173. See [web/README.md](web/README.md) for supported tools,
validation results, current limitations, and test instructions. The app has no
external runtime dependencies. The Python object editor remains available.
