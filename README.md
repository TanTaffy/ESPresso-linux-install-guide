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

Use **Save layout** to save your diagram. After editing exported C++, use **Import edited code** and select `espresso.project.json` to bring those changes back into ESPresso. Re-exports create a fresh folder and preserve imported task code.

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
