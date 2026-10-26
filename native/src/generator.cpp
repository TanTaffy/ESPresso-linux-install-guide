#include "espresso/core.hpp"
#include <algorithm>
#include <set>
#include <sstream>
#include <vector>

namespace espresso
{
std::string cpp_literal(const std::string &s) { return json(s).dump(-1, ' ', false); }
std::string comment(const std::string &s)
{
    std::string out;
    for (char c : s)
        out += (c == '\n' || c == '\r') ? ' ' : c;
    return out;
}
std::string field_literal(const json &f)
{
    std::string v = f["initialValue"], type = f["type"];
    if (type == "float" || type == "double")
    {
        if (!v.empty() && (v.back() == 'f' || v.back() == 'F'))
            v.pop_back();
        if (v.find_first_of(".eE") == std::string::npos)
            v += ".0";
        if (type == "float")
            v += "f";
    }
    else if (type == "uint64_t")
        v += "ULL";
    else if (type == "int64_t")
    {
        if (v == "-9223372036854775808")
            v = "(-9223372036854775807LL - 1LL)";
        else
            v += "LL";
    }
    return v;
}
Files generate(const json &p)
{
    Files files;
    std::vector<json> tasks, structs;
    std::map<std::string, json> by_id;
    for (const auto &n : p["nodes"])
    {
        if (n["kind"] == "task")
            tasks.push_back(n);
        else
        {
            structs.push_back(n);
            by_id[n["id"].get<std::string>()] = n;
        }
    }
    std::set<std::string> used_libraries = type_libraries(p);
    for (const auto &t : tasks)
        for (const auto &id : task_library_ids(t))
            used_libraries.insert(id);
    for (const auto &lib : p.value("libraries", json::array()))
        if (used_libraries.count(lib["id"]))
        {
            const auto preserved = p.value("extraFiles", json::object());
            const auto prefix = "components/" + lib["name"].get<std::string>() + "/";
            bool snapshot = false;
            for (const auto &[name, bytes] : preserved.items())
                if (name.rfind(prefix, 0) == 0)
                {
                    snapshot = true;
                    break;
                }
            if (snapshot)
                continue;
            const auto content = library_preview(lib);
            files.insert(content.begin(), content.end());
        }
    files["CMakeLists.txt"] = "cmake_minimum_required(VERSION "
                              "3.16)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(" +
                              p["name"].get<std::string>() + ")\n";
    files["sdkconfig.defaults"] =
        "CONFIG_IDF_TARGET=" + cpp_literal(p["target"]) + "\nCONFIG_FREERTOS_HZ=1000\n";
    files[".gitignore"] = "build/\nsdkconfig\nsdkconfig.old\n";
    std::string cmake = "# espresso:begin sources\nset(ESPRESSO_SOURCES\n    \"main.cpp\"\n    "
                        "\"generated/task_runtime.cpp\"\n";
    for (const auto &t : tasks)
        cmake += "         \"tasks/" + t["symbol"].get<std::string>() + "_task.cpp\"\n";
    for (const auto &s : structs)
        cmake += "         \"shared/" + s["symbol"].get<std::string>() + ".cpp\"\n";
    cmake += ")\n# espresso:end sources\n\nidf_component_register(\n    SRCS ${ESPRESSO_SOURCES}\n "
             "   INCLUDE_DIRS \".\"\n# espresso:begin libraries\n";
    if (!used_libraries.empty())
    {
        cmake += "    PRIV_REQUIRES";
        for (const auto &lib : p.value("libraries", json::array()))
            if (used_libraries.count(lib["id"]))
                cmake += " " + lib["name"].get<std::string>();
        cmake += "\n";
    }
    cmake += "# espresso:end libraries\n)\n";
    files["main/CMakeLists.txt"] =
        p.value("buildFiles", json::object()).contains("main/CMakeLists.txt")
            ? merge_build(p["buildFiles"]["main/CMakeLists.txt"], cmake,
                          p.value("buildBases", json::object()).value("main/CMakeLists.txt", ""))
            : cmake;
    if (p.value("buildFiles", json::object()).contains("CMakeLists.txt"))
        files["CMakeLists.txt"] = p["buildFiles"]["CMakeLists.txt"];
    std::string project_headers = "#pragma once\n";
    // Library includes make template-provided setting types visible before Config.hpp.
    for (const auto &lib : p.value("libraries", json::array()))
        if (used_libraries.count(lib["id"]))
            for (const auto &h : lib["headers"])
                project_headers += "#include \"" + h.get<std::string>() + "\"\n";
    files["main/" + config_path(p)] = render_config(p);
    project_headers += "#include \"" + config_path(p) + "\"\n";
    files["main/generated/project_headers.hpp"] = project_headers;
    files["main/generated/data_types.hpp"] = types_header(p);
    std::string signals = "#pragma once\nnamespace espresso::generated {\n";
    for (const auto &q : structs)
        if (multi_watches(p, q["id"]))
            signals += "void signal_" + q["symbol"].get<std::string>() + "();\n";
    files["main/generated/data_signals.hpp"] = signals + "}\n";
    std::string main = "#include \"esp_err.h\"\n#include \"generated/task_runtime.hpp\"\n#include "
                       "\"generated/project_headers.hpp\"\n";
    for (const auto &s : structs)
        main += "#include \"shared/" + s["symbol"].get<std::string>() + ".hpp\"\n";
    main += region(p, region_key("appincludes", "main"), "");
    main += region(p, region_key("apphelpers", "main"), "");
    main += "\nextern \"C\" void app_main()\n{\n";
    for (const auto &s : structs)
        main += "    ESP_ERROR_CHECK(espresso::shared::init_" + s["symbol"].get<std::string>() +
                "());\n";
    main += region(p, region_key("appinit", "main"),
                   "    // TODO: Initialise shared hardware before starting tasks.\n", "    ");
    main += "    espresso::generated::start_tasks();\n}\n";
    files["main/main.cpp"] = main;
    files["main/generated/task_runtime.hpp"] =
        "#pragma once\n\nnamespace espresso::generated {\nvoid start_tasks();\n}\n";
    files["main/generated/task_runtime.cpp"] = event_runtime(tasks, by_id);
    auto &runtime_header = files["main/generated/task_runtime.hpp"];
    for (const auto &t : tasks)
        if (t.value("trigger", "periodic") == "notification")
            runtime_header += "namespace espresso::generated { void notify_" +
                              t["symbol"].get<std::string>() + "(); }\n";
    for (const auto &s : structs)
    {
        const std::string sym = s["symbol"], tn = s["typeName"];
        std::string header = payload_header(p, s);
        header += "namespace espresso::shared {\nesp_err_t init_" + sym + "();\ndata::" + tn +
                  " read_" + sym + "();\nvoid write_" + sym + "(const data::" + tn +
                  "& value);\n}\n";
        files["main/shared/" + sym + ".hpp"] = header;
        files["main/shared/" + sym + ".cpp"] =
            "#include \"" + sym +
            ".hpp\"\n#include \"freertos/FreeRTOS.h\"\n#include \"freertos/semphr.h\"\n\nnamespace "
            "{\n    espresso::data::" +
            tn +
            " snapshot{};\n    SemaphoreHandle_t mutex = nullptr;\n}\n\nnamespace espresso::shared "
            "{\nesp_err_t init_" +
            sym +
            "()\n{\n    if (mutex != nullptr) return ESP_ERR_INVALID_STATE;\n    mutex = "
            "xSemaphoreCreateMutex();\n    return mutex != nullptr ? ESP_OK : "
            "ESP_ERR_NO_MEM;\n}\n\ndata::" +
            tn + " read_" + sym +
            "()\n{\n    configASSERT(mutex != nullptr);\n    [[maybe_unused]] const BaseType_t "
            "taken = xSemaphoreTake(mutex, portMAX_DELAY);\n    configASSERT(taken == pdTRUE);\n   "
            " const auto value = snapshot;\n    xSemaphoreGive(mutex);\n    return "
            "value;\n}\n\nvoid write_" +
            sym + "(const data::" + tn +
            "& value)\n{\n    configASSERT(mutex != nullptr);\n    [[maybe_unused]] const "
            "BaseType_t taken = xSemaphoreTake(mutex, portMAX_DELAY);\n    configASSERT(taken == "
            "pdTRUE);\n    snapshot = value;\n    xSemaphoreGive(mutex);\n}\n}\n";
        if (queue_node(s))
        {
            const auto queue = queue_files(s, p);
            files["main/shared/" + sym + ".hpp"] =
                header.substr(0, header.find("namespace espresso::shared")) + queue.at("header");
            files["main/shared/" + sym + ".cpp"] = queue.at("source");
        }
    }
    for (const auto &t : tasks)
    {
        const std::string sym = t["symbol"];
        std::string task_header = "#pragma once\n";
        for (const auto &id : trigger_ids(t))
            task_header +=
                "#include \"shared/" + by_id.at(id)["symbol"].get<std::string>() + ".hpp\"\n";
        if (t.value("trigger", "periodic") == "queues")
            task_header += "#include <variant>\n";
        task_header += "\nnamespace espresso::tasks::" + sym + " {\n";
        if (t.value("trigger", "periodic") == "queues")
        {
            std::string variants;
            for (const auto &id : trigger_ids(t))
            {
                const auto &q = by_id.at(id);
                const std::string qs = q["symbol"];
                task_header += "struct " + qs +
                               "Event { ::espresso::data::" + q["typeName"].get<std::string>() +
                               " value; };\n";
                variants += (variants.empty() ? "" : ", ") + qs + "Event";
            }
            task_header += "using Event = std::variant<" + variants + ">;\n";
        }
        files["main/tasks/" + sym + "_task.hpp"] =
            task_header + "void setup();\nvoid loop(" + loop_parameters(t, by_id) + ");\n}\n";
        files["main/tasks/" + sym + "_parameters.hpp"] = parameter_header(p, t);
        std::string source =
            "#include \"" + sym + "_task.hpp\"\n#include \"" + sym + "_parameters.hpp\"\n";
        std::set<std::string> includes;
        const auto assigned = task_library_ids(t);
        for (const auto &lib : p.value("libraries", json::array()))
            if (std::find(assigned.begin(), assigned.end(), lib["id"]) != assigned.end())
                for (const auto &header : lib["headers"])
                    source += "#include \"" + header.get<std::string>() + "\"\n";
        for (const auto *phase : {"setup", "loop"})
            for (const auto &step : t[phase])
                if (step["kind"] != "placeholder" && step["kind"] != "notify")
                    includes.insert(by_id.at(step["structId"]).at("symbol"));
                else if (step["kind"] == "notify")
                    includes.insert("@runtime");
        for (const auto &s : includes)
            source += s == "@runtime" ? "#include \"generated/task_runtime.hpp\"\n"
                                      : "#include \"shared/" + s + ".hpp\"\n";
        source += region(p, region_key("includes", t["id"]), "");
        source += region(p, region_key("helpers", t["id"]), "");
        source += "\nnamespace espresso::tasks::" + sym + " {\n";
        source += region(p, region_key("state", t["id"]), "");
        for (const auto *phase : {"setup", "loop"})
        {
            source += "void " + std::string(phase) + "(" +
                      (std::string(phase) == "loop" ? loop_parameters(t, by_id) : "") + ")\n{\n";
            if (std::string(phase) == "loop" && !trigger_ids(t).empty())
                source += "    (void)event; // Message consumed by the queue-triggered runtime.\n";
            std::set<std::string> locals;
            for (const auto &step : t[phase])
                if (step["kind"] != "placeholder" && step["kind"] != "notify")
                {
                    const std::string local = step["localName"];
                    if (locals.insert(local).second)
                        source += "    [[maybe_unused]] ::espresso::data::" +
                                  by_id.at(step["structId"]).at("typeName").get<std::string>() +
                                  " " + local + "{};\n";
                }
            if (!locals.empty())
                source += "\n";
            source += region(p, region_key(std::string(phase) + "vars", t["id"]), "", "    ");
            for (const auto &step : t[phase])
            {
                source += "    // " + comment(step["name"]) + "\n";
                const std::string kind = step["kind"];
                if (kind == "placeholder")
                {
                    const auto body_start = source.size();
                    std::istringstream lines(step["note"].get<std::string>());
                    std::string line;
                    bool any = false;
                    while (std::getline(lines, line))
                    {
                        source += "    // TODO: " + comment(line) + "\n";
                        any = true;
                    }
                    if (!any)
                        source += "    // TODO: Implement this step.\n";
                    const auto body = source.substr(body_start);
                    source.resize(body_start);
                    source += region(p, region_key("step", step["id"]), body, "    ");
                }
                else if (kind == "notify")
                {
                    for (const auto &target : tasks)
                        if (target["id"] == step["taskId"])
                            source += "    ::espresso::generated::notify_" +
                                      target["symbol"].get<std::string>() + "();\n";
                }
                else
                {
                    const std::string ss = by_id.at(step["structId"]).at("symbol"),
                                      local = step["localName"];
                    if (kind == "send" || kind == "receive")
                    {
                        const auto timeout_ms =
                            "::" + config_namespace(t) + "::" + timeout_setting(t, phase, step);
                        const auto signed_timeout = "static_cast<int64_t>(" + timeout_ms + ")";
                        source += "    static_assert(" + signed_timeout + " >= -1 && " +
                                  signed_timeout +
                                  " <= 3600000, \"Timeout must be -1 or 0-3600000 ms\");\n";
                        const auto timeout = "(" + signed_timeout +
                                             " == -1 ? portMAX_DELAY : pdMS_TO_TICKS(" +
                                             timeout_ms + "))";
                        const auto call = "::espresso::shared::" + kind + "_" + ss + "(" + local +
                                          ", " + timeout + ")";
                        const auto failure = step.value("onFailure", "return");
                        if (failure == "return")
                            source += "    if (!" + call + ") return;\n";
                        else if (failure == "assert")
                            source += "    if (!" + call + ") { configASSERT(false); }\n";
                        else
                            source += "    (void)" + call +
                                      "; // Continue on failure; receive leaves the local value "
                                      "unchanged.\n";
                    }
                    else
                        source +=
                            kind == "read"
                                ? "    " + local + " = ::espresso::shared::read_" + ss + "();\n"
                                : "    ::espresso::shared::write_" + ss + "(" + local + ");\n";
                }
                source += "\n";
            }
            source += "}\n\n";
        }
        source += "}\n";
        files["main/tasks/" + sym + "_task.cpp"] = source;
    }
    add_recovered_code(p, files);
    files["espresso.layout.json"] = p.dump(2) + "\n";
    files["README.md"] =
        "# " + p["name"].get<std::string>() +
        "\n\nGenerated with ESPresso for ESP-IDF 5.5 or newer.\n\n1. Open this folder in your "
        "usual ESP-IDF environment.\n2. Run `idf.py set-target " +
        p["target"].get<std::string>() +
        "` and `idf.py build`.\n3. Fill in the TODO sections in `main/tasks/*_task.cpp` and add "
        "driver dependencies to `main/CMakeLists.txt`.\n4. Build, flash and monitor with ESP-IDF "
        "as usual.\n\nEach task owns setup() and loop(). setup() runs once inside the task. "
        "Periodic loops "
        "use vTaskDelayUntil(); queue-triggered loops receive one typed message as event; "
        "notification-triggered "
        "loops consume one counting notification per invocation (notification index 0). All queues "
        "and mutexes are created before tasks start, but task "
        "setup order is not guaranteed. Initialise shared hardware in app_main() before "
        "start_tasks().\n\nStruct helpers copy whole snapshots under a mutex. Intermediate samples "
        "may be skipped. FIFO queue helpers send and consume typed messages; consumers compete "
        "rather than broadcast. "
        "Queue timeouts are 0 (no wait), -1 (forever), or milliseconds; failed operations can skip "
        "remaining steps, continue, or assert. "
        "With assertions disabled, the assert policy continues on failure. A failed setup step "
        "that skips remaining steps still enters loop(). "
        "Snapshot writers publish the whole struct, "
        "including default values until you implement the placeholders.\n\nThe exported "
        "sdkconfig.defaults selects a 1 kHz FreeRTOS tick. Periods are in milliseconds and stacks "
        "are in bytes. Keep priorities in the default ESP-IDF range 1-24. Hardware APIs and "
        "sensor/CAN drivers are left for you to implement.\n\nSave the layout separately as a "
        ".espresso.json file. Exports always create a new directory and refuse to overwrite an "
        "existing project. Import espresso.project.json to restore the diagram and preserve code "
        "inside espresso:begin/end sections. Handwritten additions outside those sections are "
        "retained when layout changes are compatible. Config File settings live in " +
        config_path(p) +
        ". Add constants directly in the task namespace during development; importing the project "
        "exposes recognised scalar constants in task settings and preserves other declarations. "
        "Additional source, assets and custom build entries are retained. Keep the CMake "
        "source/library markers so new tasks can be registered. "
        "Export to a fresh folder. Removed sections with code are saved in "
        "espresso-recovered-code.txt. Configure library dependencies in ESPresso.\n";
    const auto overrides = p.value("sourceOverrides", json::object());
    for (const auto &[name, entry] : overrides.items())
    {
        if (files.count(name))
        {
            // Editable bodies may change; handwritten scaffolding is reused only when the
            // generated structure is still compatible with the imported layout.
            const auto old = entry["structure"].get<std::string>();
            extern std::string source_structure(const std::string &, const std::string &);
            require(
                source_structure(files[name], name) == old,
                name +
                    ": layout changes conflict with handwritten edits outside the marked sections. "
                    "Resolve those edits before exporting; the original source is retained.");
        }
        for (const auto &[generated_name, body] : files)
            require(name == generated_name || lower(name) != lower(generated_name),
                    "Handwritten source conflicts with generated path: " + name);
        files[name] = entry["content"];
    }
    return files;
}
} // namespace espresso
