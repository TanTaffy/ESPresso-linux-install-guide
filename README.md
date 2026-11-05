# ESPresso

A Windows app for designing FreeRTOS tasks and exporting ESP-IDF C++ skeletons.

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

The exported README and file comments identify where to edit: task implementations, configuration and library source are the normal working areas; shared-hardware initialisation belongs in `main/main.cpp` when needed. Runtime, transport and task interface headers are generated support.

Use **Save as…** (Ctrl+Shift+S) to save a separate copy of a layout. On the next launch, ESPresso offers to recover your previous session; recovered layouts need to be saved to a layout file. Unreadable recovery files are preserved for troubleshooting.

Use the bug icon beside the theme selector to [report an issue on GitHub](https://github.com/Trovix/ESPresso/issues).

The packaged app checks GitHub for a newer stable Windows release once on launch. Choose **Download update** to open the official download in your browser, or **Not now** to continue. Offline checks stay quiet.

## Run from source

Requires Windows x64, Node.js 22.14+ and Visual Studio 2022 C++ Build Tools with CMake and a Windows SDK. The packaged app needs none of these.

```powershell
npm ci
npm run build
npm start
```

## Development checks

```powershell
npm test
npm run test:e2e
npm run format:check
```

With ESP-IDF activated, `npm run test:idf` builds a fresh export using the real SDK. `npm run package` creates the portable Windows app.

[MIT license](LICENSE). Independent project, not affiliated with or endorsed by Espressif Systems.
