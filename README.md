# ESPresso

A Windows desktop app for drawing FreeRTOS tasks and shared structs, then exporting an ESP-IDF C++ skeleton.

Drag tasks and structs onto a canvas, connect readers and writers, and add ordered placeholders to each task's setup() and loop(). The native C++ backend handles validation, layout files and firmware generation. React and Electron provide the desktop interface.

## Run

Use a packaged `ESPresso-<version>-Windows.exe`, or build from source:

```powershell
npm ci
npm run build
npm start
```

Source builds require Windows x64, Node.js 22.14+ and Visual Studio 2022 C++ Build Tools with CMake and a Windows SDK. The packaged app needs no separate Python, Node.js or compiler installation.

## What it does

- Draggable tasks and shared structs, with read/write connections
- Per-task setup/loop placeholders, timing, priority, stack size and core affinity
- Mutex-protected snapshot structs with typed fields and initial values
- Save/open layouts, recovery copies and undo/redo
- A CAN task preset marked with the Manchester Stinger bee
- ESP-IDF project export, with message IDs and payload packing left as TODOs

Each CAN export downloads the latest **stable published MSM_CAN release** and records its tag and commit in `msm_can.lock.json`. Internet access is required for CAN exports. Projects without a CAN preset export locally. There is no packet-configuration GUI or built-in code editor.

Exports create a new project folder and never overwrite existing handwritten code. Startup always opens a blank **New layout**; saved layouts and the pressure example are explicit choices.

## Checks

```powershell
npm test
npm run typecheck
npm run format:check
npm run build:ui
npm run test:e2e
```

Native and desktop tests are offline by default. Set `ESPRESSO_LIVE_CAN=1` to additionally exercise a real CAN release download/export. Windows CI runs the offline checks and application build.

## Implementation

`src/` contains the renderer, `electron/` the desktop shell and `native/` the C++ backend. Native code is split into validation, generation, presets, storage, release downloads and request dispatch. Build output and packaged executables are excluded from the repository.

The app uses the supplied ESPresso cup as its Windows icon and a plain text wordmark in the interface. Original artwork is retained in `branding/`; runtime assets are in `public/brand/`. Layouts use `.espresso.json` and generated C++ uses the `espresso` namespace.

Application code is under the [MIT license](LICENSE). The vendored nlohmann JSON license is retained with its source. User-supplied branding and downloaded MSM_CAN source retain their own provenance; exported CAN projects include the upstream source attribution.
