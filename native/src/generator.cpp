#include "espresso/core.hpp"
#include <algorithm>
#include <array>
#include <cstdint>
#include <set>
#include <sstream>
#include <vector>

namespace espresso
{
namespace
{
constexpr std::array<const char *, 12> coffee_puns = {
    "This code tastes like coffee!",
    "May your coffee be strong and your latency low.",
    "Grounds for a great project.",
    "Brewed to run",
    "A latte tasks, only 1 chip",
    "Bean there, built that.",
    "A fresh pot of parallel problems",
    "Every task deserves a coffee break.",
    "This project has bean brewing.",
    "Bean busy making tasks.",
    "A little chip with a latte potential.",
    "Wake up and smell the semaphores (and coffee)"};

std::string task_pun(const std::string &id)
{
    // Task IDs are random UUIDs. A stable hash keeps their selection unchanged
    // across preview, export and import, including manifest baseline generation.
    uint64_t hash = 14695981039346656037ULL;
    for (unsigned char c : id)
        hash = (hash ^ c) * 1099511628211ULL;
    return coffee_puns[hash % coffee_puns.size()];
}

void add_skeleton_headers(const json &p, Files &files)
{
    const auto builds = p.value("buildFiles", json::object());
    for (auto &[name, text] : files)
    {
        // Keep third-party sources and handwritten configuration/build files verbatim.
        if (name.rfind("components/", 0) == 0 || builds.contains(name) ||
            (name == "main/" + config_path(p) &&
             !p.value("configFile", json::object()).value("content", "").empty()))
            continue;
        const auto extension = fs::path(name).extension().string();
        if (extension == ".cpp" || extension == ".hpp" || extension == ".h")
        {
            std::string header;
            const auto owner = task_file_owner(p, name);
            if (!owner.empty() && extension == ".cpp")
                header = "//" + task_pun(owner) + "\n";
            std::string role = "// ESPresso: GENERATED FILE. Change wiring in ESPresso; keep this file unchanged.\n";
            if (!owner.empty() && extension == ".cpp")
                role = "// ESPresso: USER FILE. Implement task logic here; keep setup()/loop() signatures unchanged.\n";
            else if (name == "main/" + config_path(p))
                role = "// ESPresso: USER CONFIG. Edit hardware settings and constants here; keep task namespaces.\n";
            else if (name == "main/main.cpp")
                role = "// ESPresso: USER INITIALISATION. Initialise shared hardware before start_tasks().\n";
            text = header + "//" + skeleton_credit + "\n\n" + role + text;
        }
        else if (fs::path(name).filename() == "CMakeLists.txt" || extension == ".cmake" ||
                 name == "sdkconfig.defaults" || name == ".gitignore")
        {
            std::string role;
            if (name == "main/CMakeLists.txt")
                role = "# ESPresso: USER BUILD. Append custom sources/dependencies; keep the generated include and variables.\n";
            else if (name.rfind("main/generated/", 0) == 0)
                role = "# ESPresso: GENERATED FILE. Configure tasks and libraries in ESPresso.\n";
            text = "#" + std::string(skeleton_credit) + "\n\n" + role + text;
        }
        else if (extension == ".md")
            text = "<!--" + std::string(skeleton_credit) + "-->\n\n" + text;
    }
}
} // namespace

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
namespace
{
// Wrap generated prose only. Template bodies and preserved source stay verbatim.
std::string prose_comment(const std::string &text, const std::string &indent = "",
                          const std::string &label = "")
{
    std::istringstream lines(text);
    std::string out, line;
    bool first = true;
    while (std::getline(lines, line))
    {
        const std::string prefix = indent + "// ";
        std::string current = prefix + (first ? label : "");
        std::istringstream words(line);
        std::string word;
        bool any = false;
        while (words >> word)
        {
            if (any && current.size() + 1 + word.size() > 96)
            {
                out += current + "\n";
                current = prefix + (first ? std::string(label.size(), ' ') : "");
                any = false;
            }
            if (any)
                current += ' ';
            current += word;
            any = true;
        }
        out += any ? current + "\n" : indent + "//\n";
        first = false;
    }
    return out;
}

std::string payload_comments(const json &p, const json &node, const std::string &indent)
{
    std::string out = indent + "// " + node["typeName"].get<std::string>() +
                      " payload (declared field defaults):\n";
    auto fields = node["fields"];
    std::vector<json> definitions;
    std::set<std::string> described;
    const auto types = p.value("types", json::array());
    auto reference = [&](const std::string &id)
    {
        if (described.insert(id).second)
            for (const auto &type : types)
                if (type["id"] == id)
                    definitions.push_back(type);
    };
    const auto payload = node.value("payloadTypeId", "");
    if (!payload.empty())
    {
        fields = json::array();
        for (const auto &type : types)
            if (type["id"] == payload)
            {
                described.insert(payload);
                if (type["kind"] == "struct")
                    fields = type["fields"];
                else
                    definitions.push_back(type);
            }
    }
    for (const auto &field : fields)
    {
        auto declaration = field_cpp(p, field);
        declaration = declaration.substr(4, declaration.size() - 5);
        out += indent + "//   " + comment(declaration) + "\n";
        const std::string type = field["type"];
        if (type.rfind("type:", 0) == 0)
            reference(type.substr(5));
    }
    if (fields.empty() && definitions.empty())
        out += indent + "//   No fields.\n";
    for (const auto &type : definitions)
    {
        const std::string name = type["name"];
        if (type["kind"] == "struct")
        {
            out += indent + "//   Nested " + comment(name) + ":\n";
            for (const auto &field : type["fields"])
            {
                auto declaration = field_cpp(p, field);
                declaration = declaration.substr(4, declaration.size() - 5);
                out += indent + "//     " + comment(declaration) + "\n";
            }
            out += indent + "//   Further nested declarations: generated/data_types.hpp.\n";
        }
        else if (type["kind"] == "enum")
        {
            out += indent + "//   Enum " + comment(name) + ":\n";
            for (const auto &value : type["values"])
                out += indent + "//     " + comment(value["name"]) + " = " +
                       comment(value["value"]) + "\n";
        }
        else
        {
            out += indent + "//   External " + comment(type["cppType"]) +
                   ": member layout and "
                   "defaults are defined in its header.\n";
            for (const auto &header : type["headers"])
                out += indent + "//   See " + comment(header) + ".\n";
        }
    }
    return out;
}

std::string lifecycle_comment(const json &task, const std::map<std::string, json> &data,
                              const std::string &phase)
{
    if (phase == "setup")
        return "// Runs once inside this task, after shared queues and mutexes are initialised.\n"
               "// Other tasks may be running their setup at the same time.\n";
    const auto trigger = task.value("trigger", "periodic");
    if (trigger == "notification")
        return "// Runs once per pending task notification (notification index 0).\n";
    if (trigger == "queues")
        return "// Runs when any selected queue or mailbox has a message.\n"
               "// event identifies the input and contains its message, already removed from that input.\n";
    if (trigger == "queue")
        return "// Runs when a message arrives from " +
               comment(data.at(task.at("queueId"))["symbol"]) +
               ".\n// event is that message, already removed from the queue or mailbox.\n";
    return prose_comment("Runs repeatedly at the period configured by " + config_namespace(task) +
                         "::PERIOD_MS (milliseconds).");
}
} // namespace

Files generate(const json &p, json *diagnostics)
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
    std::string cmake = "# Generated by ESPresso.\nset(ESPRESSO_SOURCES\n    \"main.cpp\"\n    "
                        "\"generated/task_runtime.cpp\"\n";
    for (const auto &t : tasks)
        cmake += "    \"tasks/" + t["symbol"].get<std::string>() + "_task.cpp\"\n";
    for (const auto &s : structs)
        cmake += "    \"shared/" + s["symbol"].get<std::string>() + ".cpp\"\n";
    cmake += ")\n\nset(ESPRESSO_REQUIRES";
    for (const auto &lib : p.value("libraries", json::array()))
        if (used_libraries.count(lib["id"]))
            cmake += " " + lib["name"].get<std::string>();
    files["main/generated/project.cmake"] = cmake + ")\n";
    files["main/CMakeLists.txt"] =
        "include(\"${CMAKE_CURRENT_LIST_DIR}/generated/project.cmake\")\n\nidf_component_register(\n"
        "    SRCS ${ESPRESSO_SOURCES}\n    INCLUDE_DIRS \".\"\n"
        "    PRIV_REQUIRES ${ESPRESSO_REQUIRES}\n)\n";
    const auto build_files = p.value("buildFiles", json::object());
    for (const auto &[name, content] : build_files.items())
    {
        if (name == "main/CMakeLists.txt")
            check_build(content);
        files[name] = content;
    }
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
    main += base_code(p, region_key("appincludes", "main"), "");
    main += base_code(p, region_key("apphelpers", "main"), "");
    main += "\nextern \"C\" void app_main()\n{\n";
    main += "    espresso::generated::init_shared();\n";
    main += base_code(p, region_key("appinit", "main"),
                      "    // TODO: Initialise shared hardware before starting tasks.\n");
    main += "    espresso::generated::start_tasks();\n}\n";
    files["main/main.cpp"] = main;
    files["main/generated/task_runtime.hpp"] = "#pragma once\n\nnamespace espresso::generated "
                                               "{\nvoid init_shared();\nvoid start_tasks();\n}\n";
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
        std::set<std::string> task_types;
        for (const auto &id : trigger_ids(t))
        {
            const std::string tn = by_id.at(id)["typeName"];
            if (task_types.insert(tn).second)
                task_header += "using ::espresso::data::" + tn + ";\n";
        }
        if (!task_types.empty())
            task_header += "\n";
        if (t.value("trigger", "periodic") == "queues")
        {
            std::string variants;
            for (const auto &id : trigger_ids(t))
            {
                const auto &q = by_id.at(id);
                const std::string qs = q["symbol"];
                task_header += payload_comments(p, q, "");
                task_header +=
                    "struct " + qs + "Event { " + q["typeName"].get<std::string>() + " value; };\n";
                variants += (variants.empty() ? "" : ", ") + qs + "Event";
            }
            task_header += "using Event = std::variant<" + variants + ">;\n";
        }
        files["main/tasks/" + sym + "_task.hpp"] =
            task_header + lifecycle_comment(t, by_id, "setup") + "void setup();\n" +
            lifecycle_comment(t, by_id, "loop") + "void loop(" + loop_parameters(t, by_id) +
            ");\n}\n";
        files["main/tasks/" + sym + "_parameters.hpp"] = parameter_header(p, t);
        const auto connections = imported_connection_header(p, t);
        if (!connections.empty()) files["main/generated/" + sym + "_connections.hpp"] = connections;
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
        source += "// ESPresso: USER INCLUDES. Add driver/library headers below.\n";
        source += base_code(p, region_key("includes", t["id"]), "");
        source += "// ESPresso: USER HELPERS. Add helper functions and types below.\n";
        source += base_code(p, region_key("helpers", t["id"]), "");
        source += "\nnamespace espresso::tasks::" + sym + " {\n";
        bool added_types = false;
        std::set<std::string> task_functions;
        for (const auto *phase : {"setup", "loop"})
            for (const auto &step : t[phase])
                if (!placed_connection(step) && step["kind"] != "placeholder" && step["kind"] != "notify")
                {
                    const auto &data = by_id.at(step["structId"]);
                    const std::string tn = data["typeName"], ss = data["symbol"];
                    if (task_types.insert(tn).second)
                    {
                        source += "using ::espresso::data::" + tn + ";\n";
                        added_types = true;
                    }
                    if (step["kind"] == "read" || step["kind"] == "write")
                        task_functions.insert(
                            "::espresso::shared::" + step["kind"].get<std::string>() + "_" + ss);
                }
                else if (step["kind"] == "notify")
                    for (const auto &target : tasks)
                        if (target["id"] == step["taskId"])
                            task_functions.insert("::espresso::generated::notify_" +
                                                  target["symbol"].get<std::string>());
        for (const auto &function : task_functions)
            source += "using " + function + ";\n";
        if (added_types || !task_functions.empty())
            source += "\n";
        source += "// ESPresso: USER STATE. Add persistent task-owned objects and variables below.\n";
        source += base_code(p, region_key("state", t["id"]), "");
        for (const auto *phase : {"setup", "loop"})
        {
            source += lifecycle_comment(t, by_id, phase) + "void " + std::string(phase) + "(" +
                      (std::string(phase) == "loop" ? loop_parameters(t, by_id) : "") + ")\n{\n";
            if (std::string(phase) == "loop" && !trigger_ids(t).empty())
            {
                if (t.value("trigger", "periodic") == "queue")
                    source += payload_comments(p, by_id.at(t.at("queueId")), "    ");
                else
                    source += "    // Payload fields for each event alternative are listed in " +
                              sym + "_task.hpp.\n";
                source +=
                    "    // Use event directly; receiving again would take a different message.\n"
                    "    (void)event;\n";
            }
            std::set<std::string> locals;
            for (const auto &step : t[phase])
                if (!placed_connection(step) && step["kind"] != "placeholder" && step["kind"] != "notify")
                {
                    const std::string local = step["localName"];
                    if (locals.insert(local).second)
                        source += payload_comments(p, by_id.at(step["structId"]), "    ") +
                                  "    // Local working copy; publish or send explicitly to share "
                                  "changes.\n"
                                  "    // Initialised on each call; it does not retain values "
                                  "between calls.\n"
                                  "    [[maybe_unused]] " +
                                  by_id.at(step["structId"]).at("typeName").get<std::string>() +
                                  " " + local + "{};\n";
                }
            if (!locals.empty())
                source += "\n";
            source += "    // ESPresso: USER LOCALS. Add variables shared by implementation steps below.\n";
            source += base_code(p, region_key(std::string(phase) + "vars", t["id"]), "");
            for (const auto &step : t[phase])
            {
                if (placed_connection(step)) continue;
                const std::string kind = step["kind"];
                if (kind != "placeholder")
                    source += prose_comment(comment(step["name"]), "    ");
                if (kind == "placeholder")
                {
                    source += "    // ESPresso: USER IMPLEMENTATION. Fill in this step below.\n";
                    const auto body = base_code(p, region_key("step", step["id"]), "");
                    const bool implemented = contains_code(body);
                    source += prose_comment(comment(step["name"]), "    ", implemented ? "" : "TODO: ");
                    if (!implemented)
                        source += prose_comment(step["note"], "    ");
                    source += body;
                }
                else if (kind == "notify")
                {
                    for (const auto &target : tasks)
                        if (target["id"] == step["taskId"])
                            source += "    notify_" + target["symbol"].get<std::string>() + "();\n";
                }
                else
                {
                    const std::string ss = by_id.at(step["structId"]).at("symbol"),
                                      local = step["localName"];
                    if (kind == "send" || kind == "receive")
                    {
                        const auto function = queue_step_function(p, t, step);
                        const auto failure = step.value("onFailure", "return");
                        const auto skipped =
                            std::string(phase) == "setup"
                                ? "skip remaining setup steps; loop() still starts."
                                : "skip remaining steps in this loop iteration.";
                        source += prose_comment("Timeout: " + config_namespace(t) +
                                  "::" + timeout_setting(t, phase, step) +
                                  " (ms; 0 = no wait, -1 = wait forever).", "    ");
                        if (kind == "receive")
                        {
                            std::string received = "received";
                            while (locals.count(received))
                                received += "_message";
                            source += by_id.at(step["structId"]).value("delivery", "snapshot") ==
                                              "mailbox"
                                          ? "    // Take the unread mailbox message; no value "
                                            "means none arrived in time.\n"
                                          : "    // Take the oldest waiting message from the "
                                            "queue; each message goes to one receiver.\n";
                            source += "    if (const auto " + received + " = " + function + "())\n";
                            source += "        " + local + " = *" + received + ";\n";
                            if (failure == "return")
                                source += "    else\n        // No message arrived: " +
                                          std::string(skipped) + "\n        return;\n";
                            else if (failure == "assert")
                                source += "    else\n        // No message: assert if enabled; "
                                          "otherwise keep the local value and continue.\n"
                                          "        configASSERT(false);\n";
                            else
                                source += "    // On timeout, keep the previous local value and "
                                          "continue.\n";
                        }
                        else
                        {
                            const auto call = function + "(" + local + ")";
                            source += by_id.at(step["structId"]).value("delivery", "snapshot") ==
                                              "mailbox"
                                          ? "    // Replace the unread mailbox message without "
                                            "waiting; timeout is ignored.\n"
                                          : "    // Add this message to the queue.\n";
                            if (failure == "return")
                            {
                                source += "    // If sending fails, " + std::string(skipped) + "\n";
                                source += "    if (!" + call + ") return;\n";
                            }
                            else if (failure == "assert")
                            {
                                source += "    // If sending fails, assert if enabled; otherwise "
                                          "drop the message and continue.\n";
                                source += "    if (!" + call + ") { configASSERT(false); }\n";
                            }
                            else
                                source +=
                                    "    (void)" + call + "; // Drop the message on timeout.\n";
                        }
                    }
                    else
                    {
                        source += kind == "read"
                                      ? "    // Copy the latest shared snapshot; reading does not "
                                        "remove or modify it.\n"
                                      : "    // Publish the complete local snapshot under its "
                                        "mutex, including unchanged defaults.\n";
                        source += kind == "read" ? "    " + local + " = read_" + ss + "();\n"
                                                 : "    write_" + ss + "(" + local + ");\n";
                    }
                }
                source += "\n";
            }
            source += "}\n\n";
        }
        source += "}\n";
        files["main/tasks/" + sym + "_task.cpp"] = source;
    }
    auto layout = p;
    layout["generatorCredit"] = skeleton_credit;
    files["espresso.layout.json"] = layout.dump(2) + "\n";
    files[".vscode/settings.json"] =
        "//" + std::string(skeleton_credit) +
        "\n\n{\n  \"C_Cpp.default.compileCommands\": \"${workspaceFolder}/build/compile_commands.json\"\n}\n";
    files["README.md"] =
        "# " + p["name"].get<std::string>() +
        "\n\nGenerated with ESPresso for ESP-IDF 5.5 or newer.\n\n1. Open this folder in your "
        "usual ESP-IDF environment.\n2. Run `idf.py set-target " +
        p["target"].get<std::string>() +
        "` and `idf.py build`.\n3. Fill in the TODO sections in `main/tasks/*_task.cpp` and add "
        "driver dependencies to `main/CMakeLists.txt`.\n4. Build, flash and monitor with ESP-IDF "
        "as usual.\n\n## Where to edit\n\n"
        "| Files | Expected changes |\n| --- | --- |\n"
        "| `main/tasks/*_task.cpp` | Implement TODO steps; add your headers, helpers, state and local variables in the labelled areas. Keep setup/loop signatures. |\n"
        "| `main/" + config_path(p) + "` | Edit hardware settings, calibration and constants. Keep task namespaces. |\n"
        "| `components/<library>/` | Modify library source when needed; imported library changes are preserved. |\n"
        "| `main/main.cpp` | Initialise shared hardware before start_tasks() when needed. |\n"
        "| `main/CMakeLists.txt` | Append custom source files or dependencies; keep the generated include and registration variables. |\n"
        "| `main/generated/`, `main/shared/`, task `*_task.hpp` and `*_parameters.hpp` | Generated support. Change data, wiring and task settings in ESPresso. |\n\n"
        "Imported tasks have limited functionality: new connectors can run at the start or end of loop(). "
        "An early return skips end connectors. Use incoming samples and populate outgoing values in your "
        "implementation; adding a connector does not implement your application logic. "
        "Unusual loop definitions may need manual integration; ESPresso reports conflicts without changing the original file.\n\n"
        "Each task owns setup() and loop(). setup() runs once inside the task. "
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
        "as whole task files. Imported task files are kept exactly as written; step edits do "
        "not rearrange existing code. Config File settings live in " +
        config_path(p) +
        ". Add constants directly in the task namespace during development; importing the project "
        "exposes recognised scalar constants in task settings and preserves other declarations. "
        "Additional source, assets and custom build entries are retained. Generated build "
        "lists live in main/generated/project.cmake; add custom sources and dependencies to "
        "ESPRESSO_SOURCES and ESPRESSO_REQUIRES in main/CMakeLists.txt before registration. "
        "Export to a fresh folder. Imported tasks and interfaces are protected. New start/end "
        "connectors are inserted on export; legacy manual connectors use connection-updates.md when present. Configure library "
        "dependencies in ESPresso.\n";
    const auto pending = pending_connections(p);
    if (!pending.empty())
    {
        std::string guide = "# Connections requiring code updates\n\nAdd these includes and calls "
                            "in your editor. Task files are preserved unchanged.\n\n";
        for (const auto &task : p["nodes"])
            if (task["kind"] == "task")
                for (const auto *phase : {"setup", "loop"})
                    for (const auto &step : task[phase])
                        if (pending.contains(step["id"]))
                        {
                            guide += "## " + comment(task["name"]) + " / " + phase +
                                     "(): " + comment(step["name"]) + "\n\n```cpp\n" +
                                     pending[step["id"]].get<std::string>() + "```\n\n";
                            if (diagnostics)
                                diagnostics->push_back(
                                    {{"severity", "warning"},
                                     {"message", "New connector requires a code update. See "
                                                 "connection-updates.md."},
                                     {"nodeId", task["id"]}});
                        }
        files["connection-updates.md"] = guide;
    }
    add_skeleton_headers(p, files);
    preserve_sources(p, files);
    return files;
}
} // namespace espresso
