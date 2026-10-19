# Development

## Requirements

- Windows x64
- Node.js 22.14 or newer, with npm
- Visual Studio 2022 Build Tools, including **Desktop development with C++**, CMake and a Windows SDK
- Internet access for installation and live MSM_CAN exports

The build helper locates Visual Studio and its bundled CMake with `vswhere`. No Python runtime is used by ESPresso. ESP-IDF has its own Python environment when compiling exported firmware.

## Start

```powershell
npm ci
npm run build
npm start
```

`npm run dev` rebuilds and launches the desktop app. The renderer currently uses a production Vite build; there is no separate development web server to run.

## Repository layout

```text
electron/                 Desktop window, IPC bridge and native-process transport
src/
  components/             Reusable interface and canvas components
  editor/                 Diagram/session state and interactions
  screens/                Task, struct and export screens
  model.ts                Shared TypeScript contracts
native/
  include/espresso/       Native module interfaces
  src/                    C++ implementation modules
  third_party/nlohmann/   Vendored JSON library and its license
  main.cpp                Native process entry point
public/brand/             Runtime images
branding/                 Original artwork and Windows icon
scripts/                  Build, formatting, packaging and firmware verification
tests/                    Native and Electron integration tests
examples/                 Saved layouts that can be opened in the app
docs/                     Usage and architecture
.github/workflows/        Windows CI checks
```

`build/`, `dist/`, `dist-electron/`, `release/`, `node_modules/` and `test-results/` are generated and excluded from Git. Layout files exported by users do not belong in the source tree unless deliberately added as examples.

## Checks

```powershell
npm run typecheck
npm run format:check
npm test
npm run build:ui
npm run test:e2e
```

The default native and desktop suites are offline. The desktop test launches an isolated app window and checks blank startup, the CAN preset, dragging, connections, step ordering, struct editing, save/open, undo/redo and actual native folder export. It uses an ordinary-task export fixture to avoid GitHub API dependencies. Tests use temporary directories; screenshots go to `test-results/`.

To include the separate native live-source download test:

```powershell
$env:ESPRESSO_LIVE_CAN = '1'
npm test
Remove-Item Env:ESPRESSO_LIVE_CAN
```

With `ESPRESSO_LIVE_CAN=1`, `npm run test:e2e` also exports an actual CAN project and checks its downloaded source/version record. This requires internet access and is subject to GitHub's anonymous API rate limit. A failed download fails the live check; it never falls back to an older release.

The GitHub Actions workflow runs offline native and desktop tests, formatting checks and the renderer/desktop-shell build on Windows. Live checks are explicit local integration checks so public GitHub API availability does not make ordinary CI unreliable.

## Formatting

Run `npm run format` for TypeScript, JavaScript, CSS, JSON, Markdown and workflow files. C++ uses the root `.clang-format` configuration; use `clang-format -i` on files you change. Third-party code and binary assets are left untouched.

## Firmware build verification

After building the backend, `node scripts/validate-idf.mjs` exercises the actual exporter, including a fresh CAN release download, and creates a disposable fixture under `build/idf-validation/pressure-node`. From an activated ESP-IDF shell:

```powershell
node scripts/validate-idf.mjs
idf.py -C build/idf-validation/pressure-node build
```

The pressure example has been built with ESP-IDF 5.5.2 for ESP32-S3. The verification helper only refreshes its disposable build fixture; the app's real exporter never overwrites an existing project directory.

## Packaging

```powershell
npm run package
```

The portable executable is written to `release/ESPresso-<version>-Windows.exe`. It includes the native backend and needs no Node.js or compiler installation on the target machine. The current build is unsigned. The packaging script uses moderate compression to keep rebuild times practical.

To run the desktop workflow against the unpacked packaged build:

```powershell
$env:TASKFLOW_E2E_BINARY = "$PWD\release\win-unpacked\ESPresso.exe"
npm run test:e2e
Remove-Item Env:TASKFLOW_E2E_BINARY
```
