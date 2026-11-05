#include "espresso/core.hpp"
#include <algorithm>
#include <sstream>

namespace espresso
{
namespace
{
json pick(const json &item, std::initializer_list<const char *> keys)
{
    json result = json::object();
    for (const auto *key : keys)
        result[key] = item.value(key, json(nullptr));
    return result;
}
json step_interface(const json &step)
{
    return pick(step, {"id", "name", "kind", "note", "structId", "localName", "taskId", "onFailure",
                       "timeoutSetting", "placement"});
}
json library_interface(const json &library)
{
    return pick(library,
                {"id", "name", "source", "repository", "version", "headers", "dependencies"});
}
} // namespace
void capture_import(json &p)
{
    json libraries = json::array();
    for (const auto &lib : p.value("libraries", json::array()))
    {
        auto definition = lib;
        definition.erase("files");
        libraries.push_back(definition);
    }
    p["imported"] = {{"target", p["target"]},
                     {"configPath", config_path(p)},
                     {"nodes", p["nodes"]},
                     {"types", p.value("types", json::array())},
                     {"libraries", libraries}};
}
json validate_imported(const json &p)
{
    json out = json::array();
    if (!p.contains("imported"))
        return out;
    const auto &base = p["imported"];
    require(base.is_object() && base.contains("nodes") && base["nodes"].is_array() &&
                base["nodes"].size() <= 200 && base.contains("types") && base["types"].is_array() &&
                base["types"].size() <= 200 && base.contains("libraries") &&
                base["libraries"].is_array() && base["libraries"].size() <= 100 &&
                has_string(base, "target") && has_string(base, "configPath"),
            "Invalid imported project record.");
    auto issue = [&](const std::string &message, const std::string &id = "") {
        out.push_back({{"severity", "error"}, {"message", message}, {"nodeId", id}});
    };
    if (base["target"] != p["target"] || base["configPath"] != config_path(p))
        issue("The imported target and config file path are read-only.");
    for (const auto &original : base["nodes"])
    {
        const std::string id = original.at("id");
        const auto current = std::find_if(p["nodes"].begin(), p["nodes"].end(),
                                          [&](const json &n) { return n["id"] == id; });
        if (current == p["nodes"].end())
        {
            issue("Imported tasks and data cannot be deleted.", id);
            continue;
        }
        const bool task = original["kind"] == "task";
        const auto contract = [&](const json &node)
        {
            return task ? pick(node, {"kind", "symbol", "configNamespace", "trigger", "queueId",
                                      "queueIds"})
                        : pick(node, {"kind", "symbol", "typeName", "configNamespace", "delivery",
                                      "payloadTypeId", "fields"});
        };
        if (contract(*current) != contract(original))
        {
            issue("Imported C++ symbols, payload definitions and trigger interfaces are read-only.",
                  id);
            continue;
        }
        if (!task)
            continue;
        for (const auto *phase : {"setup", "loop"})
        {
            json existing = json::array(), expected = json::array();
            std::set<std::string> ids;
            for (const auto &step : original[phase])
            {
                ids.insert(step["id"]);
                expected.push_back(step_interface(step));
            }
            for (const auto &step : (*current)[phase])
                if (ids.count(step["id"]))
                    existing.push_back(step_interface(step));
                else if (step["kind"] == "placeholder")
                    issue("Only new input/output connectors can be added to imported tasks.", id);
                else if (placed_connection(step))
                {
                    const auto path = "main/tasks/" + current->at("symbol").get<std::string>() + "_task.cpp";
                    if (!p.value("sourceFiles", json::object()).contains(path))
                        issue("Import the task source before adding automatic loop connectors.", id);
                }
            if (existing != expected)
                issue("Imported steps and connections cannot be edited, reordered or removed.", id);
        }
        const auto assigned = task_library_ids(*current);
        for (const auto &lib : task_library_ids(original))
            if (std::find(assigned.begin(), assigned.end(), lib) == assigned.end())
                issue("Imported library assignments cannot be removed.", id);
        const auto parameters = current->value("parameters", json::array());
        for (const auto &parameter : original.value("parameters", json::array()))
            if (std::none_of(parameters.begin(), parameters.end(),
                             [&](const json &v)
                             {
                                 return v["name"] == parameter["name"] &&
                                        v.value("type", "auto") == parameter.value("type", "auto");
                             }))
                issue("Imported config setting names and types are read-only; their values remain "
                      "editable.",
                      id);
    }
    const auto types = p.value("types", json::array()),
               libraries = p.value("libraries", json::array());
    for (const auto &type : base["types"])
        if (std::find(types.begin(), types.end(), type) == types.end())
            issue("Imported data types are read-only.");
    for (const auto &lib : base["libraries"])
        if (std::none_of(libraries.begin(), libraries.end(),
                         [&](const json &v)
                         { return library_interface(v) == library_interface(lib); }))
            issue("Imported library definitions are read-only.");
    return out;
}
std::string connection_code(const json &p, const json &task, const json &step,
                            const std::string &phase)
{
    const std::string kind = step["kind"];
    if (kind == "notify")
        for (const auto &target : p["nodes"])
            if (target["id"] == step["taskId"])
                return "#include \"generated/task_runtime.hpp\"\n\n// Add inside " + phase +
                       "().\nespresso::generated::notify_" + target["symbol"].get<std::string>() +
                       "();\n";
    for (const auto &data : p["nodes"])
        if (data["id"] == step.value("structId", ""))
        {
            const std::string sym = data["symbol"], local = step["localName"];
            std::string result =
                "#include \"shared/" + sym + ".hpp\"\n\n// Add inside " + phase + "().\n";
            if (kind == "read")
                return result + "auto " + local + " = espresso::shared::read_" + sym + "();\n";
            result +=
                "espresso::data::" + data["typeName"].get<std::string>() + " " + local + "{};\n";
            if (kind == "write")
                return result + "// Fill in " + local + ".\nespresso::shared::write_" + sym + "(" +
                       local + ");\n";
            const auto function = "::espresso::tasks::" + task["symbol"].get<std::string>() +
                                  "::" + queue_step_function(p, task, step);
            result = "#include \"tasks/" + task["symbol"].get<std::string>() +
                     "_parameters.hpp\"\n\n// Add inside " + phase + "().\n";
            if (kind == "receive")
                return result + "if (const auto " + local + " = " + function +
                       "())\n{\n    // Use *" + local +
                       ": the oldest message was removed from the queue.\n}\nelse\n{\n    "
                       "// No message arrived before the configured timeout.\n}\n";
            return result + "espresso::data::" + data["typeName"].get<std::string>() + " " + local +
                   "{};\n// Fill in " + local + ".\nif (!" + function + "(" + local +
                   "))\n{\n    // Queue stayed full until the configured timeout.\n}\n";
        }
    return "";
}
json pending_connections(const json &p)
{
    json result = json::object();
    for (const auto &task : p["nodes"])
        if (task["kind"] == "task")
            for (const auto *phase : {"setup", "loop"})
                for (const auto &step : task[phase])
                    if (step.value("requiresCode", false) && !placed_connection(step))
                        result[step["id"].get<std::string>()] =
                            connection_code(p, task, step, phase);
    return result;
}
} // namespace espresso
