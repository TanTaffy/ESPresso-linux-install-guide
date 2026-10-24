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
- Import exported projects with implementation sections preserved by stable ID
- Manage local C/C++ libraries or public GitHub releases and assign them to tasks
- A CAN task preset marked with the Manchester Stinger bee
- ESP-IDF project export, with message IDs and payload packing left as TODOs

Each CAN export downloads the latest **stable published MSM_CAN release** and records its tag and commit in `msm_can.lock.json`. Internet access is required for CAN exports. Projects without a CAN preset export locally. There is no packet-configuration GUI or built-in code editor.

Exports create a new project folder and never overwrite existing handwritten code. Startup always opens a blank **New layout**; saved layouts and the pressure example are explicit choices.

## Import and preserve code

Exports include `espresso.project.json`. Write your implementation inside the generated `espresso:begin` / `espresso:end` sections, then use **Import project** to select that manifest. ESPresso checks the expected files, markers and generated structure before restoring the diagram and code. Task files provide sections for includes, helpers, persistent state, setup/loop variables and each placeholder; `main.cpp` has sections for shared initialisation and helpers.

Imported placeholders remain steps and show **Code present** when their section contains implementation. Their code follows the stable ID through renaming and reordering. Deleted steps/tasks retain their code in the layout; export places unused implementation in `espresso-recovered-code.txt` and shows a warning. The step inspector offers a read-only preview. Import captures a snapshot: re-import after further source edits. Export into a fresh folder.

Import supports manifests exported by version 0.2.0 onwards. Changes outside editable sections, missing files/markers and extra source files are rejected with the affected path. ESP-IDF build directories, Git metadata and generated sdkconfig files are ignored; the layout's target and `sdkconfig.defaults` remain the configuration source. Earlier skeletons have no preservation markers.

## Libraries

Use **Libraries → Local folder** to bundle a simple C/C++ source tree, or **GitHub release** to enter a public `owner/repository` and `latest` or a stable release tag. Specify task include headers and ESP-IDF component dependencies, then assign libraries under **Task steps → Libraries**. Only assigned libraries are exported. Local source is stored in saved layouts; GitHub source is resolved to a commit and downloaded on every export. Resolved versions are recorded in `espresso.libraries.lock.json`.

The manager generates component CMake files and preserves source directory paths. It supports source/header libraries up to 2 MB and 300 files per library, not custom build scripts or binary packages. Examples/tests/build folders are excluded. Write namespace calls, class instances and initialisation in the editable code sections. Assignment generates includes and linkage; C++ does not enforce per-task access. The CAN preset uses the built-in MSM_CAN entry and always fetches its latest stable release.

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
