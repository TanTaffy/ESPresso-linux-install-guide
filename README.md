# ESPresso

A desktop app for designing FreeRTOS tasks and exporting ESP-IDF C++ skeletons.

ESPresso opens directly on the canvas. Click the project name in the header to change its name or board in **Project settings**.

[Download the latest Windows app](https://github.com/Trovix/ESPresso/releases/latest) — portable executable and SHA-256 checksum.

## Build a program

1. Name your project and choose an ESP32 board.
2. Add tasks and choose when they run: an interval, frequency, incoming data or notification.
3. Connect typed data between tasks. Use latest-value mailboxes, FIFO queues or shared snapshots.
4. Add implementation steps and libraries, then review and export the skeleton.
5. Open the exported folder in your editor, fill in the TODOs and build with ESP-IDF 5.5 or newer. The Export screen provides build commands.

The pressure example samples every 100 ms and wakes CAN with the latest unread pressure value.

Use **Save layout** to save your diagram. After editing exported C++, use **Import edited code** and choose the exported project folder or its `espresso.project.json` file. Selecting the exported `espresso.layout.json` or root `CMakeLists.txt` also finds the project manifest beside it. Keep that manifest with the project. Re-exports create a fresh folder and preserve imported task code.

Re-import accepts UTF-8 BOMs and Windows line endings, preserves edited `.gitignore` and `sdkconfig.defaults` files, and regenerates missing documentation or VS Code settings. Build output and Git metadata are excluded; additional source files are retained. Imported layouts are marked unsaved and included in session recovery.

Imported tasks have limited functionality: add connectors at the **start or end of `loop()`**. ESPresso adds their transport code on export and preserves the existing loop body. Early returns skip end connectors. Use received values and populate outgoing samples in your implementation. New library assignments add their headers and build dependencies. Existing flow, data definitions and triggers remain protected.

The exported README identifies where to edit: task implementations, configuration and library source are the normal working areas; shared-hardware initialisation belongs in `main/main.cpp` when needed. Task comments keep the implementation TODOs and short action labels. Runtime, transport and task interface headers are generated support.

Mailbox sends use plain calls. FIFO sends also use plain calls at the end of a function; when later steps follow, **Skip remaining steps** keeps a failure check. **Assert success** always keeps its check. Adding end connectors to an imported task restores the check around a recognised final FIFO send when needed.

Use **Save as…** (Ctrl+Shift+S) to save a separate copy of a layout. On the next launch, ESPresso offers to recover your previous session; recovered layouts need to be saved to a layout file. Unreadable recovery files are preserved for troubleshooting.

Use the bug icon beside the theme selector to [report an issue on GitHub](https://github.com/Trovix/ESPresso/issues).

The packaged app checks GitHub for a newer stable release for its OS and CPU architecture once on launch. Choose **Download update** to open the official download in your browser, or **Not now** to continue. Offline checks stay quiet.

## Run from source

Requires Node.js 22.14+, CMake 3.20+ and a C++17 compiler. On Windows, install Visual Studio C++ Build Tools with CMake and a Windows SDK; on macOS, use Xcode Command Line Tools; on Linux, use GCC or Clang. macOS/Linux also need libcurl 7.85+ development files (`libcurl4-openssl-dev` on Ubuntu 24.04; the macOS SDK includes libcurl). Packaged apps do not need the build toolchain. Linux packages use the system libcurl and desktop libraries; CI builds against Ubuntu 24.04.

The first Windows build downloads and statically links a pinned libcurl release using Windows certificate verification. Later builds reuse the source in `build/native/_deps`. GitHub library downloads use the HTTP client adapted from [Icarus](https://github.com/Trovix/icarus).

```powershell
npm ci
npm run build
npm start
```

CMake selects the host's default toolchain. For a fresh build, `CMAKE_GENERATOR` and `CXX` can select another generator or compiler; `CMAKE` can select the CMake executable. Existing build directories retain their cached toolchain. Executables use `build/native/bin/Release/espresso-core` (`.exe` on Windows), with the same layout for Visual Studio, Xcode, Ninja and Makefiles.

## Development checks

```powershell
npm test
npm run test:e2e
npm run format:check
```

With ESP-IDF activated, `npm run test:idf` builds a fresh export using the real SDK.

`npm run package` builds for the current OS and CPU architecture. Build on each target machine rather than cross-compiling the native backend. Packages appear in `release/`:

- Windows x64: portable `.exe`.
- macOS x64/ARM64: `.zip` containing `ESPresso.app`. These builds are ad-hoc signed, without Apple Developer ID notarization.
- Linux x64/ARM64: `.tar.gz`; extract it and run `espresso-desktop`. A compatible glibc, libcurl and Electron desktop libraries are required (Ubuntu 24.04 is the CI baseline).

`npm run test:packaged` exercises the unpacked package. `node scripts/checksum.mjs` writes its SHA-256 checksum. On headless Linux, run desktop tests under `xvfb-run -a`.

Every PR builds, tests and packages all five OS/architecture combinations. Tag releases use the same checks and publish all packages together only after every job passes.

The native backend can also be built directly:

```sh
cmake -S native -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --config Release
```

The Export screen detects ESP-IDF through `IDF_PATH`, `IDF_TOOLS_PATH` and common install folders, and generates PowerShell or Bash/Zsh commands. VS Code is found through `PATH` and common install locations; `ESPRESSO_EDITOR` can point to its executable or CLI script. Paths containing spaces and apostrophes are supported.

[MIT license](LICENSE). Independent project, not affiliated with or endorsed by Espressif Systems.
