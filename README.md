# ESPresso

A Windows desktop app for drawing FreeRTOS tasks and shared structs, then exporting an ESP-IDF C++ skeleton.

ESPresso is an independent project made by me, its not affiliated with or endorsed by Espressif Systems.

Drag tasks and structs onto a canvas, connect readers and writers, and add ordered placeholders to each task's setup() and loop(). The native C++ backend handles validation, layout files and firmware generation. React and Electron provide the desktop interface.

## Run

Use a packaged `ESPresso-<version>-Windows.exe`, or build from source:

The latest Windows package and SHA-256 checksum are available on the [GitHub releases page](https://github.com/Trovix/ESPresso/releases/latest).

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
- Typed FIFO queues with capacity, send/receive timeouts and failure behaviour
- Periodic, single/multi-input queue triggers and counting-notification task loops
- Latest-value mailboxes that overwrite unread samples
- Array fields, nested structs, enums and external/library payload types
- Reusable custom task types with base code, default libraries, descriptions and icons
- A read-only Config File overview, settings on every task, and C++ timing expressions
- Save/open layouts, recovery copies and undo/redo
- Import exported projects with implementation sections preserved by stable ID
- Manage local C/C++ libraries or public GitHub releases and assign them to tasks
- CAN supplied as an ordinary editable task template, with MSM_CAN supplied as an ordinary default library
- ESP-IDF project export, with message IDs and payload packing left as TODOs

The canvas palette contains **Task**, **Task from template**, **Queue** and **Shared struct**. Task from template opens a searchable list of task types. CAN uses the same template mechanism as user-created types, including its bee icon and base code. MSM_CAN uses the ordinary GitHub library mechanism with `latest` selected by default. Libraries are downloaded only when used by a task or payload type, and resolved releases are recorded in `espresso.libraries.lock.json`.

Task implementation and configuration headers stay in your usual editor. ESPresso edits the layout and reusable task definitions.

Exports create a new project folder and never overwrite existing handwritten code. Startup always opens a blank **New layout**; saved layouts and the pressure example are explicit choices. The pressure example includes a Johnson-derived `config/Config.hpp` for ADC A and CAN, with ADC timing and task settings using its constants. Its sample rate is 10 Hz (100 ms).

## Import and preserve code

Exports include `espresso.project.json`. Write your implementation inside the generated `espresso:begin` / `espresso:end` sections, then use **Import project** to select that manifest. ESPresso checks the expected files, markers and generated structure before restoring the diagram and code. Task files provide sections for includes, helpers, persistent state, setup/loop variables and each placeholder; `main.cpp` has sections for shared initialisation and helpers.

Imported placeholders remain steps and show **Code present** when their section contains implementation. Their code follows the stable ID through renaming and reordering. Deleted steps/tasks retain their code in the layout; export places unused implementation in `espresso-recovered-code.txt` and shows a warning. The step inspector offers a read-only preview. Import captures a snapshot: re-import after further source edits. Export into a fresh folder.

Import preserves configuration, additional source files, assets (including binary files), root and component build customisations, README notes and sdkconfig. Build output and Git metadata are excluded. Imported library source is retained exactly, including local edits, instead of being downloaded again. Files are stored in the layout so later exports remain self-contained.

CMake source/dependency markers let ESPresso register new tasks while keeping handwritten entries and build code. Keep those markers intact. Task implementation in marked sections follows stable IDs. Handwritten additions outside those sections are also retained when the generated structure remains compatible. If a layout edit conflicts with that structure or an existing file name, ESPresso reports the conflict and retains the original code; resolve it before exporting. Limits are checked explicitly rather than dropping files.

## Queues and event-driven tasks

Add **Queue** from the canvas palette and edit its typed fields and capacity under **Shared structs**. **Delivery** switches a data node between a latest snapshot, FIFO queue or latest-value mailbox, updating its access steps. Sending appends a message; receiving removes one. Multiple consumers compete for messages.

Add **Send queue** or **Receive queue** steps, or connect their canvas ports. Set a timeout of `0` for no wait, `-1` for a blocking wait, or a positive number of milliseconds. On failure, skip remaining steps, continue (drop an unsent message or retain the local receive value), or assert. Assertions disabled in the firmware mean the assert policy continues on failure. Skipping the remainder of setup still proceeds to loop.

Select **Loop trigger → Queue message** and a trigger queue to block until a message arrives. The generated `loop(const data::Type& event)` receives that message; do not add another receive step for the same message. Select **Task notification** for a loop that runs once per counting notification. A **Notify task** step or a task-to-task connection sends a notification. All handles exist before setup starts; setup order itself is not guaranteed. Generated notification loops use notification index 0. Connect notification sources in task code, not interrupt handlers.

Choose **Latest-value mailbox** in a queue's delivery settings to hold one unread value. Sending never blocks: it replaces an older unread value using `xQueueOverwrite`. Receiving consumes it, so a task waits for a new value after reading the current one. Snapshot reads remain repeatable and independent of task wakeups.

Select **Any selected queue / mailbox** to wake on several inputs. The generated `Event` is a `std::variant` with a distinct `<queue_symbol>Event` wrapper per source, even if sources share a payload type. For example:

```cpp
if (const auto* sample = std::get_if<imuEvent>(&event)) {
    // sample->value is the IMU payload.
}
```

The runtime scans inputs in rotation, consumes one value per loop invocation, then waits on a coalescing semaphore when all inputs are empty. Use the generated send helpers so waiting tasks are signalled. These helpers are for task context; they do not provide ISR entry points.

## Data types

Use **Data types** to define reusable structs and enums, or register a qualified external type such as `BNO055::Data` with its include headers and libraries. Select it as a shared node's **Payload definition**, or use it inside another struct. Fields support fixed arrays of 1–4,096 elements. Arrays and nested values use `{}` initialisation; enum fields can use a member name. Circular value dependencies and missing types are rejected.

The generator orders type definitions by dependency and exports libraries used by payload types automatically. Generated payloads have a `std::is_trivially_copyable` check because FreeRTOS queues copy bytes. External types should contain value data, not owning pointers or dynamic containers. Firmware compilation checks external C++ declarations and expression types.

## Custom task types

Use **Task types → New task type** or **Save as task type** on a task. Set a description, an emoji/symbol or uploaded image icon (PNG/JPEG/WebP up to 128 KB), default task settings, default libraries, includes, helpers, persistent state, base setup/loop code and ordered placeholder steps with implementation. Use static or anonymous-namespace helpers when the same type can appear more than once. Add libraries through the Libraries screen before selecting them as defaults.

Each saved task type is one `.espresso-task.json` file in **Documents/ESPresso/Task templates**. **Open templates folder** opens it. Users can add or edit JSON files directly and click **Refresh templates**, or reopen the canvas's **Task from template** picker. The folder includes authoring instructions. Invalid files are reported individually while valid templates remain available.

CAN is installed into that folder on first use as an ordinary definition from `defaults/task-templates/can.espresso-task.json`. Edit, duplicate or delete it like any other task type. Deleted defaults stay deleted. Each task created from a template gets independent IDs and code; subsequent template changes do not alter existing tasks. The project's existing library definition takes precedence when its ID matches a template default. Different IDs with conflicting component names are reported. Project-specific connections are left out when capturing a type; reconnect data after adding its task. Configure queue triggers in the project.

## Config File and task settings

Every task, including a base task, has **Config settings → Add setting**. Give a setting a C++ name, type, value and optional label/description. ESPresso writes the constant into that task's namespace in `main/config/Config.hpp`. New task namespaces follow their C++ symbols, for example `Config::adc` and `Config::gps`. After importing a project, namespace bindings remain stable so renaming a task does not invalidate handwritten configuration references. Templates prepopulate the same settings; there is no separate template-only parameter system.

Task runtime controls also live in the config file: `PERIOD_MS`, `PRIORITY`, `STACK_BYTES` and `CORE_AFFINITY` (`-1` for any core, `0` or `1` for a specific core). The generated FreeRTOS runtime uses these constants. On import, edited literals update the task controls; C++ expressions stay visible as expression controls and are checked by the firmware compiler. A period may reference a custom sample-rate constant, keeping one timing definition.

FIFO queue capacity lives in `Config::queues::<symbol>::CAPACITY`. Send/receive steps expose named `..._TIMEOUT_MS` constants in their task namespace. Import restores those values into the corresponding queue and step controls. Mailboxes retain their fixed single-slot capacity. Invalid imported values are diagnosed and retained for correction. ESP-IDF build settings remain in the preserved sdkconfig files.

New declarations follow the existing namespace indentation and line endings, including nested namespaces, tabs and CRLF. Existing handwritten text stays intact.

The **Config File** page is a read-only preview. It starts with an otherwise empty file and creates task namespaces automatically. Task settings modify individual declarations without rewriting surrounding text. Use `parameters::SPI_PIN` inside a task, or its fully qualified `Config::adc::SPI_PIN` constant. An optional **Period expression** such as `1'000 / Config::adc::SAMPLE_RATE_HZ` uses those same constants.

After exporting, add constants to the appropriate namespace as you implement the firmware. **Import project** reads them back into task settings, including changes to existing values. Recognition covers unambiguous scalar `const`/`constexpr` declarations using `type NAME = expression;`. Arrays, functions, custom declarations and conditional code remain preserved verbatim. Expressions are retained as C++ text and checked by your firmware compiler. **Import config file** can also read an existing file without importing a whole project; it binds constants in the current tasks' namespaces.

Typical round trip: draw ADC and CAN → export → implement drivers and add SPI constants → import → add GPS and its settings → export to a fresh folder. Existing code, configuration and additional files are retained. App-added settings are editable and removable on any task. A removed task's configuration namespace remains in the file so handwritten settings survive.

## Libraries

Use **Libraries → Local folder** to bundle a simple C/C++ source tree, or **GitHub release** to enter a public `owner/repository` and `latest` or a stable release tag. Specify task include headers and ESP-IDF component dependencies, then assign libraries under **Task steps → Libraries**. Only used libraries are fetched for a fresh project. Imported component snapshots are preserved on re-export. Local source is stored in saved layouts; Fresh GitHub libraries are resolved to a commit during export; imported source snapshots retain the source you have already developed. Resolved versions are recorded in `espresso.libraries.lock.json`.

The manager generates component CMake files and preserves source directory paths. It supports source/header libraries up to 2 MB and 300 files per library, not custom build scripts or binary packages. Example/test source files and examples/tests/build folders are excluded. Write namespace calls, class instances and initialisation in the editable code sections. Assignment generates includes and linkage; C++ does not enforce per-task access. MSM_CAN has no protected ID, required assignment or special download rules. Its default definition is in `defaults/libraries/msm-can.espresso-library.json`.

The **Documents/ESPresso/Libraries** folder contains one `.espresso-library.json` file per reusable library definition. New layouts start with those libraries available; existing layouts keep their own copies. **Open libraries folder** opens the directory, and **Refresh libraries** reloads its list. Use **Save to libraries folder for future layouts** when saving a library to update a default. MSM_CAN is installed on first use as an ordinary, editable and removable library. Only used libraries are fetched for a fresh project. Imported component snapshots are preserved on re-export. Deleting a default file leaves it deleted.

## Checks

```powershell
npm test
npm run typecheck
npm run format:check
npm run build:ui
npm run test:e2e
```

Native and desktop tests are offline by default. `npm test` also compiles exported C++ against a small host test harness and exercises queue/event behaviour; this does not replace testing on an ESP32. Desktop checks cover template persistence across restarts and configuration preservation. Set `ESPRESSO_LIVE_CAN=1` to additionally exercise a real CAN release download/export. Windows CI runs the offline checks and application build.

Version tags such as `v0.7.0` also run the Windows release workflow. It checks the tag against package.json, builds the portable app, tests the packaged binary, stores a workflow artifact and publishes the executable with its SHA-256 checksum. Release notes live in `releases/<tag>.md`; tags without a notes file use generated notes.

## Implementation

`src/` contains the renderer, `electron/` the desktop shell and `native/` the C++ backend. Native code is split into validation, generation, template catalogs, storage, release downloads and request dispatch. Build output and packaged executables are excluded from the repository.

The app uses the supplied ESPresso cup as its Windows icon and a plain text wordmark in the interface. Original artwork is retained in `branding/`; runtime assets are in `public/brand/`. Layouts use `.espresso.json` and generated C++ uses the `espresso` namespace.

Application code is under the [MIT license](LICENSE). The vendored nlohmann JSON license is retained with its source. User-supplied branding and downloaded MSM_CAN source retain their own provenance; exported CAN projects include the upstream source attribution.
