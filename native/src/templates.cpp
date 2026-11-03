#include "espresso/core.hpp"
#include <chrono>
#include <set>

namespace espresso
{
void check_templates(const json &templates)
{
    require(templates.is_array() && templates.size() <= 64,
            "A template library supports up to 64 task types.");
    require(templates.dump().size() <= 8 * 1024 * 1024, "Template library exceeds 8 MB.");
    std::set<std::string> ids;
    for (const auto &entry : templates)
    {
        require(entry.is_object() && has_string(entry, "id") && has_string(entry, "name") &&
                    !entry["id"].get<std::string>().empty() &&
                    !entry["name"].get<std::string>().empty() &&
                    has_string(entry, "description", 8000) && entry.contains("icon") &&
                    valid_icon(entry["icon"]) && ids.insert(entry["id"]).second,
                "Invalid template name, description, icon or ID.");
        require(entry.contains("task") && entry["task"].is_object() &&
                    entry["task"].value("kind", "") == "task",
                "A template needs a task.");
        const auto &task = entry["task"];
        require(trigger_ids(task).empty() && task.value("trigger", "periodic") != "queues",
                "Choose periodic or notification triggering for a reusable template; connect "
                "queues after adding a task.");
        for (const auto *phase : {"setup", "loop"})
            for (const auto &step : task.at(phase))
                require(
                    step.value("kind", "") == "placeholder",
                    "Templates contain placeholders; connect project data after adding the task.");
        json p = {{"version", 1},
                  {"name", "template-check"},
                  {"target", "esp32s3"},
                  {"nodes", json::array({task})},
                  {"libraries", entry.at("libraries")},
                  {"code", entry.at("code")}};
        normalize_project(p);
        const auto diagnostics = validate(p);
        require(!has_errors(diagnostics), "Fix template settings: " + diagnostics.dump());
        generate(p); // Validate the template scaffold before storing it.
    }
}

json instantiate_template(const json &project, const json &entry, const json &position)
{
    check_templates(json::array({entry}));
    require(position.is_object() && position.contains("x") && position.contains("y"),
            "Choose a canvas position.");
    auto p = project, task = entry.at("task");
    const std::string prefix =
        "template-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());
    const std::string old_id = task["id"], id = prefix + "-task";
    task["id"] = id;
    task["position"] = position;
    task["name"] = entry["name"];
    task["description"] = entry["description"];
    task["icon"] = entry["icon"];
    const std::string base_symbol = task["symbol"];
    std::string symbol = base_symbol;
    int suffix = 2;
    auto used = [&](const std::string &s)
    {
        for (const auto &n : p["nodes"])
            if (n["kind"] == "task" && lower(n["symbol"]) == lower(s))
                return true;
        return false;
    };
    while (used(symbol))
        symbol = base_symbol.substr(0, 56) + "_" + std::to_string(suffix++);
    task["symbol"] = symbol;
    task.erase("configNamespace");
    task.erase("configKeys");
    task.erase("codeNamesLocked");
    if (!p.contains("code"))
        p["code"] = json::object();
    auto copy_code = [&](const std::string &kind, const std::string &from, const std::string &to)
    {
        const auto key = region_key(kind, from);
        if (entry["code"].contains(key))
            p["code"][region_key(kind, to)] = entry["code"][key];
    };
    for (const char *kind : {"includes", "helpers", "state", "setupvars", "loopvars"})
        copy_code(kind, old_id, id);
    size_t step_index = 0;
    for (const auto *phase : {"setup", "loop"})
        for (auto &step : task[phase])
        {
            const std::string from = step["id"],
                              to = prefix + "-step-" + std::to_string(step_index++);
            copy_code("step", from, to);
            step["id"] = to;
        }
    auto libs = p.value("libraries", json::array());
    auto assigned = task_library_ids(task);
    for (const auto &lib : entry["libraries"])
    {
        bool found = false;
        for (const auto &existing : libs)
            if (existing["id"] == lib["id"] || lower(existing["name"]) == lower(lib["name"]))
            {
                auto a = existing, b = lib;
                a.erase("id");
                b.erase("id");
                require(existing["id"] == lib["id"] || a == b,
                        "Template library conflicts with project library " +
                            existing["name"].get<std::string>() +
                            ". Rename or align the library settings first.");
                for (auto &lib_id : assigned)
                    if (lib_id == lib["id"])
                        lib_id = existing["id"];
                found = true;
                break;
            }
        if (!found)
            libs.push_back(lib);
    }
    task["libraryIds"] = assigned;
    p["libraries"] = libs;
    p["nodes"].push_back(task);
    normalize_project(p);
    check_shape(p);
    return p;
}
} // namespace espresso
