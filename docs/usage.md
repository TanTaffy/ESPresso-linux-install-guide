# Using ESPresso

## Draw a layout

The app opens on a blank **New layout** each time. Use **Open** to load a saved layout, or **Pressure example** to load the ADC/CAN demonstration.

- Drag **Task** or **Shared struct** from the left palette, or click to add one. Drag a node to move it. Use the canvas controls or mouse wheel to zoom and the background to pan.
- Drag a task's output port to a struct's input to append a **publish** step to its loop. Drag a struct's output to a task's input to prepend a **read** step. Connecting an existing access step's port changes which struct it uses.
- Select a task to configure its name, stable C++ symbol, period, priority, stack size in bytes and core affinity. Double-click the task or choose **Edit setup & loop** to open its steps.
- Add placeholders, reads and publishes in either setup or loop. Reorder with the grip or arrows. A placeholder has a name and implementation note; these become TODO comments, not application code.
- Edit a struct's display name, C++ type, instance symbol and typed fields under **Shared structs**. Each field has a validated literal initial value. Read/write steps choose the struct and the local snapshot variable they use.
- Double-click a wire to remove it and its associated access step. Delete a selected node using its trash button or Delete. Deleting a struct also removes its access steps. Undo/redo supports these changes.
- Save/Open use `.taskflow.json` files, including node positions and step ordering. A separate recovery copy is kept in the Windows application-data directory. Ctrl+S saves, Ctrl+Shift+S saves as, Ctrl+Z undoes and Ctrl+Shift+Z redoes.

## Export an ESP-IDF project

In **Export**, choose a project/folder name and ESP32 target. The C++ engine reports invalid identifiers, duplicate symbols, invalid defaults, dangling references and incompatible task settings. Fix errors before exporting; warnings do not prevent export.

Choose **Choose folder & export** and select the parent folder. ESPresso creates a new folder named after the project. It refuses to overwrite an existing folder. It exports:

```text
CMakeLists.txt
sdkconfig.defaults
taskflow.layout.json
README.md
main/
  CMakeLists.txt
  main.cpp
  generated/task_runtime.hpp
  generated/task_runtime.cpp
  tasks/<symbol>_task.hpp
  tasks/<symbol>_task.cpp
  shared/<instance>.hpp
  shared/<instance>.cpp
```

Each FreeRTOS task calls its own setup() once, then loop() periodically using vTaskDelayUntil(). The generated project uses a 1 kHz tick so integer millisecond periods are represented accurately. Mutexes are created before tasks start. Task setup execution order is not guaranteed: initialise hardware used by multiple tasks in app_main() before starting them.

Each access step copies a complete struct under its mutex and releases the lock before the next step. Local snapshots are declared at the start of the phase. Multiple steps using the same local name and struct share that snapshot within one setup/loop call; snapshots do not persist between calls. Connections store the latest value, not a queue of every sample. Multiple writers replace the complete struct and receive a warning.

Open the exported project in your ESP-IDF environment, implement the TODOs in `main/tasks/`, add hardware/component dependencies in `main/CMakeLists.txt`, and run `idf.py build`. ESP32, ESP32-S3 and ESP32-C3 are offered. The pressure example is validated against ESP-IDF 5.5.2 on ESP32-S3. The app generates structure and can include MSM_CAN through its CAN task preset. Sensor implementations, message IDs and payload packing remain application code. It does not include a code editor, flashing or monitoring.

**Regeneration:** export to a fresh directory and merge using your normal tools. The app never patches existing handwritten C++ files.

## CAN task preset

Click or drag **CAN task** from the palette. A tiny Manchester Stinger bee marks this preset on the palette, canvas and task list. The preset adds an Initialise CAN setup placeholder, plus Pack CAN frame and Transmit frame loop placeholders. Connect shared structs in the usual way to insert read or publish steps. The pressure example also uses this preset.

The skeleton includes `MSM_CAN::TxFrame can_frame{}` and commented init/send calls. Choose RX/TX pins, a message ID and payload packing in your editor, then enable those calls. No packet-configuration GUI is provided, and the unedited skeleton transmits no frames. If multiple CAN tasks share the library, initialise its controller only once.

Every export containing a CAN preset uses the native C++ backend and Windows HTTPS APIs to resolve the latest **stable published GitHub release** of [MSM_CAN](https://github.com/ManchesterStingerMotorsports/MSM_CAN/releases). It resolves the release to a commit, downloads the source unchanged, generates `components/MSM_CAN/CMakeLists.txt`, and links the component. The tag, commit and source paths are recorded in `msm_can.lock.json`. CAN exports require internet access and fail without creating the export if the latest release cannot be downloaded. There is no bundled or cached-source fallback. Previews show the generated task code and mark library files for download during export; they do not make network requests on each edit.

Projects without a CAN preset export locally without an MSM_CAN dependency or network request. Older layouts remain compatible and ordinary tasks remain ordinary tasks; add the new preset when you want this integration.
