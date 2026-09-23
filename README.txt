SPPC VISIT - OFFLINE WEBSITE

Page 2 now contains an embedded copy of the geometry from Road(2).kml.
This means the KML layout does NOT need to be fetched by JavaScript and the
layout can be displayed when index.html/layout.html is opened locally.

Files:
- index.html       Page 1
- layout.html      Page 2
- layout.js        Page 2 controls
- kml-data.js      Embedded geometry extracted from Road(2).kml
- styles.css       Page styling
- kml/Road(2).kml Original KML, retained unchanged
- videos/          Local videos

Page 2 features:
- Entire project layout shown initially
- Touch/mouse pan
- Zoom in/out
- Mouse wheel zoom
- Fit entire layout
- GPS current-location button

NOTE:
Browser GPS permissions may require a secure context. If GPS is blocked when
opening the files directly, run a local server with:
  Windows: python -m http.server 8000
  macOS/Linux: python3 -m http.server 8000
Then open http://localhost:8000
This local server does not require internet.
