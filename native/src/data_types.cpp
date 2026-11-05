#include "espresso/core.hpp"
#include <algorithm>
#include <functional>
#include <regex>
#include <sstream>

namespace espresso
{
bool queue_node(const json &n) { return n.value("delivery", "snapshot") != "snapshot"; }
json trigger_ids(const json &t)
{
    if (t.value("trigger", "periodic") == "queues")
        return t.value("queueIds", json::array());
    if (t.value("trigger", "periodic") == "queue")
        return json::array({t.value("queueId", "")});
    return json::array();
}
bool multi_watches(const json &p, const std::string &id)
{
    for (const auto &t : p["nodes"])
        if (t["kind"] == "task" && t.value("trigger", "periodic") == "queues")
            for (const auto &q : trigger_ids(t))
                if (q == id)
                    return true;
    return false;
}
bool constant_expression(const std::string &s)
{
    if (s.empty() || s.size() > 2000 || s.find_first_of("\r\n;{}#\\") != std::string::npos ||
        s.find('\0') != std::string::npos)
        return false;
    if (s.find("//") != std::string::npos || s.find("/*") != std::string::npos ||
        s.find("*/") != std::string::npos)
        return false;
    return std::regex_match(s, std::regex("[A-Za-z0-9_:'\".()+*/%<>=!&|^~? ,\\-]+"));
}
std::string period_value(const json &t)
{
    const auto expression = t.value("periodExpression", "");
    return expression.empty() ? std::to_string(t["periodMs"].get<int>()) : "(" + expression + ")";
}
void check_extensions(const json &p)
{
    const auto types = p.value("types", json::array());
    require(types.is_array() && types.size() <= 100, "A project supports up to 100 data types.");
    std::set<std::string> ids;
    auto fields = [&](const json &list)
    {
        require(list.is_array() && list.size() <= 100, "A type supports up to 100 fields.");
        for (const auto &f : list)
        {
            require(f.is_object() && has_string(f, "id") && has_string(f, "name") &&
                        has_string(f, "type") && has_string(f, "initialValue"),
                    "Invalid type field.");
            require(!f.contains("arrayLength") || f["arrayLength"].is_number_integer(),
                    "Array length must be an integer.");
        }
    };
    for (const auto &t : types)
    {
        require(t.is_object() && has_string(t, "id") && !t["id"].get<std::string>().empty() &&
                    ids.insert(t["id"]).second && has_string(t, "name") && has_string(t, "kind"),
                "Invalid or duplicate data type ID.");
        require(t["kind"] == "struct" || t["kind"] == "enum" || t["kind"] == "external",
                "Unknown data type kind.");
        require(t.contains("fields"), "Data types need a fields array.");
        fields(t["fields"]);
        require(has_string(t, "cppType") && t.contains("headers") && t["headers"].is_array() &&
                    t["headers"].size() <= 32 && t.contains("libraryIds") &&
                    t["libraryIds"].is_array() && t["libraryIds"].size() <= 32,
                "Invalid external type settings.");
        for (const auto &h : t["headers"])
            require(h.is_string() && h.get_ref<const std::string &>().size() <= 240,
                    "Invalid type include header.");
        require(t.contains("values") && t["values"].is_array() && t["values"].size() <= 100,
                "Invalid enum members.");
        for (const auto &v : t["values"])
            require(v.is_object() && has_string(v, "id") && has_string(v, "name") &&
                        has_string(v, "value"),
                    "Invalid enum member.");
    }
    if (p.contains("configFile"))
    {
        const auto &file = p["configFile"];
        require(file.is_object() && has_string(file, "path") &&
                    has_string(file, "content", 128 * 1024),
                "Invalid config file.");
        const std::string path = file["path"], folded = lower(path);
        require(safe_relative(path) && std::regex_match(path, std::regex(".*\\.(h|hpp)")) &&
                    folded.rfind("generated/", 0) != 0 && folded.rfind("tasks/", 0) != 0 &&
                    folded.rfind("shared/", 0) != 0,
                "Use a config .h/.hpp path outside generated/, tasks/ and shared/.");
    }
    check_preserved(p);
    for (const auto &n : p["nodes"])
    {
        if (n["kind"] == "struct")
        {
            fields(n["fields"]);
            for (const auto *key : {"capacityExpression", "capacityLiteral", "configNamespace"})
                require(!n.contains(key) || has_string(n, key, 2000),
                        "Invalid queue capacity config.");
            require(!n.contains("configKeys") ||
                        (n["configKeys"].is_array() && n["configKeys"].size() <= 1),
                    "Invalid queue config inventory.");
            require(!n.contains("payloadTypeId") || has_string(n, "payloadTypeId"),
                    "Invalid payload type reference.");
        }
        else
        {
            for (const auto *key :
                 {"periodExpression", "priorityExpression", "stackExpression", "coreExpression"})
                require(!n.contains(key) || has_string(n, key, 2000),
                        "Invalid runtime setting expression.");
            if (n.contains("configValues"))
            {
                require(n["configValues"].is_object() && n["configValues"].size() <= 4,
                        "Invalid runtime literal inventory.");
                for (const auto &[key, value] : n["configValues"].items())
                    require(runtime_setting(key) &&
                                has_string(n["configValues"], key.c_str(), 2000),
                            "Invalid runtime literal.");
            }
            for (const auto *phase : {"setup", "loop"})
                for (const auto &step : n[phase])
                {
                    for (const auto *key :
                         {"timeoutExpression", "timeoutLiteral", "timeoutSetting"})
                        require(!step.contains(key) || has_string(step, key, 2000),
                                "Invalid queue timeout setting.");
                }
            require(!n.contains("queueIds") ||
                        (n["queueIds"].is_array() && n["queueIds"].size() <= 64),
                    "Select up to 64 input queues.");
            for (const auto &id : n.value("queueIds", json::array()))
                require(id.is_string(), "Invalid input queue ID.");
            require(!n.contains("configNamespace") || has_string(n, "configNamespace"),
                    "Invalid config namespace.");
            require(!n.contains("configKeys") ||
                        (n["configKeys"].is_array() && n["configKeys"].size() <= 1024),
                    "Invalid config setting inventory.");
            for (const auto &name : n.value("configKeys", json::array()))
                require(name.is_string(), "Invalid config setting name.");
            const auto params = n.value("parameters", json::array());
            require(params.is_array() && params.size() <= 64,
                    "A task supports up to 64 parameters.");
            for (const auto &v : params)
                require(v.is_object() && has_string(v, "name") && has_string(v, "label") &&
                            has_string(v, "description", 8000) && has_string(v, "value", 2000),
                        "Invalid task parameter.");
            for (const auto &v : params)
                require(!v.contains("type") || has_string(v, "type"), "Invalid setting type.");
        }
    }
}
json validate_types(const json &p)
{
    json out = validate_config(p);
    auto issue = [&](const std::string &message, const std::string &id = "") {
        out.push_back({{"severity", "error"}, {"message", message}, {"nodeId", id}});
    };
    std::map<std::string, json> types;
    std::set<std::string> names, libs;
    for (const auto &l : p.value("libraries", json::array()))
        libs.insert(l["id"]);
    for (const auto &t : p.value("types", json::array()))
    {
        types[t["id"]] = t;
        if (!identifier(t["name"]) || !names.insert(t["name"]).second)
            issue("Data types need unique, valid C++ names: " + t["name"].get<std::string>());
        if (t["kind"] == "external" &&
            !std::regex_match(
                t["cppType"].get<std::string>(),
                std::regex("(?:::)?[A-Za-z][A-Za-z0-9_]*(?:::[A-Za-z][A-Za-z0-9_]*)*")))
            issue("Enter a qualified external C++ type, such as BNO055::Data.");
        for (const auto &id : t["libraryIds"])
            if (!id.is_string() || !libs.count(id.get<std::string>()))
                issue("Data type references a missing library.");
        for (const auto &h : t["headers"])
            if (!h.get<std::string>().empty() && !safe_relative(h.get<std::string>()))
                issue("Use relative include paths for external type headers.");
        if (t["kind"] == "enum")
        {
            std::set<std::string> members;
            if (t["values"].empty())
                issue("Enum " + t["name"].get<std::string>() + " needs at least one member.");
            for (const auto &v : t["values"])
                if (!identifier(v["name"]) || !members.insert(v["name"]).second ||
                    !initial_value("int32_t", v["value"]))
                    issue("Enum members need unique valid names and int32 values.");
        }
    }
    auto check_fields = [&](const json &fields, const std::string &owner, const std::string &nid)
    {
        std::set<std::string> members;
        for (const auto &f : fields)
        {
            const std::string name = f["name"], type = f["type"], value = f["initialValue"];
            if (!identifier(name) || name == owner || !members.insert(name).second)
                issue("Invalid or duplicate field name: " + name, nid);
            const bool array = f.contains("arrayLength");
            if (array &&
                (f["arrayLength"].get<int64_t>() < 1 || f["arrayLength"].get<int64_t>() > 4096))
                issue("Array length must be 1–4,096.", nid);
            if (type.rfind("type:", 0) == 0)
            {
                const auto id = type.substr(5);
                if (!types.count(id))
                {
                    issue("Field " + name + " references a missing data type.", nid);
                    continue;
                }
                if (!value.empty() && value != "{}")
                {
                    bool member = false;
                    if (!array && types.at(id)["kind"] == "enum")
                        for (const auto &v : types.at(id)["values"])
                            if (v["name"] == value)
                                member = true;
                    if (!member)
                        issue("Use {} for structured/array defaults, or an enum member name.", nid);
                }
            }
            else if (array)
            {
                if (!initial_value(type, "0") && type != "bool")
                    issue("Unknown array element type: " + type, nid);
                if (!value.empty() && value != "{}")
                    issue("Arrays use {} initialisation. Populate values in task code.", nid);
            }
            else if (!initial_value(type, value))
                issue("Invalid type or initial value for field " + name + ".", nid);
        }
    };
    for (const auto &[id, t] : types)
        if (t["kind"] == "struct")
            check_fields(t["fields"], t["name"], "");
    for (const auto &n : p["nodes"])
        if (n["kind"] == "struct")
        {
            const auto type = n.value("payloadTypeId", "");
            if (!type.empty() && !types.count(type))
                issue("Select an existing payload type.", n["id"]);
            if (type.empty())
                check_fields(n["fields"], n["typeName"], n["id"]);
        }
    std::map<std::string, int> state;
    std::function<void(const std::string &)> visit = [&](const std::string &id)
    {
        if (state[id] == 1)
        {
            issue("Data types contain a recursive value dependency.");
            return;
        }
        if (state[id] == 2 || !types.count(id))
            return;
        state[id] = 1;
        if (types.at(id)["kind"] == "struct")
            for (const auto &f : types.at(id)["fields"])
            {
                const std::string type = f["type"];
                if (type.rfind("type:", 0) == 0)
                    visit(type.substr(5));
            }
        state[id] = 2;
    };
    for (const auto &[id, t] : types)
        visit(id);
    for (const auto &n : p["nodes"])
        if (n["kind"] == "task")
        {
            for (const auto *key :
                 {"periodExpression", "priorityExpression", "stackExpression", "coreExpression"})
                if (!n.value(key, "").empty() && !constant_expression(n[key]))
                    issue("Runtime settings must be single C++ constant expressions.", n["id"]);
            for (const auto *phase : {"setup", "loop"})
                for (const auto &step : n[phase])
                    if (!step.value("timeoutExpression", "").empty() &&
                        !constant_expression(step["timeoutExpression"]))
                        issue("Queue timeout must be a C++ constant expression.", n["id"]);
            std::set<std::string> parameters;
            for (const auto &v : n.value("parameters", json::array()))
                if (!identifier(v["name"]) || !parameters.insert(v["name"]).second ||
                    !constant_expression(v["value"]))
                    issue("Parameters need unique C++ names and constant expressions.", n["id"]);
        }
    for (const auto &n : p["nodes"])
        if (n["kind"] == "struct" && !n.value("capacityExpression", "").empty() &&
            !constant_expression(n["capacityExpression"]))
            issue("Queue capacity must be a C++ constant expression.", n["id"]);
    return out;
}
std::vector<json> used_types(const json &p)
{
    std::map<std::string, json> types;
    for (const auto &t : p.value("types", json::array()))
        types[t["id"]] = t;
    std::set<std::string> seen;
    std::vector<json> result;
    std::function<void(const std::string &)> visit = [&](const std::string &id)
    {
        if (!types.count(id) || !seen.insert(id).second)
            return;
        const auto &t = types.at(id);
        if (t["kind"] == "struct")
            for (const auto &f : t["fields"])
            {
                const std::string ft = f["type"];
                if (ft.rfind("type:", 0) == 0)
                    visit(ft.substr(5));
            }
        result.push_back(t);
    };
    for (const auto &n : p["nodes"])
        if (n["kind"] == "struct")
        {
            if (!n.value("payloadTypeId", "").empty())
                visit(n["payloadTypeId"]);
            else
                for (const auto &f : n["fields"])
                {
                    const std::string ft = f["type"];
                    if (ft.rfind("type:", 0) == 0)
                        visit(ft.substr(5));
                }
        }
    return result;
}
std::set<std::string> type_libraries(const json &p)
{
    std::set<std::string> ids;
    for (const auto &t : used_types(p))
        for (const auto &id : t["libraryIds"])
            ids.insert(id);
    return ids;
}
std::string field_cpp(const json &p, const json &f)
{
    std::string type = f["type"], value = f["initialValue"];
    if (type.rfind("type:", 0) == 0)
    {
        for (const auto &t : p.value("types", json::array()))
            if (t["id"] == type.substr(5))
            {
                type = "::espresso::types::" + t["name"].get<std::string>();
                value = (value.empty() || value == "{}") ? "{}" : type + "::" + value;
                break;
            }
    }
    else if (!f.contains("arrayLength"))
    {
        // Reuse the established scalar literal generation (including int64 boundaries).
        extern std::string field_literal(const json &);
        value = field_literal(f);
    }
    if (f.contains("arrayLength"))
        value = "{}";
    if (value.empty())
        value = "{}";
    return "    " + type + " " + f["name"].get<std::string>() +
           (f.contains("arrayLength") ? "[" + std::to_string(f["arrayLength"].get<int>()) + "]"
                                      : "") +
           " = " + value + ";\n";
}
std::string types_header(const json &p)
{
    auto used = used_types(p);
    std::string out = "#pragma once\n#include <cstdint>\n#include <type_traits>\n";
    std::set<std::string> headers;
    for (const auto &t : used)
        if (t["kind"] == "external")
            for (const auto &h : t["headers"])
                if (!h.get<std::string>().empty())
                    headers.insert(h);
    for (const auto &h : headers)
        out += "#include \"" + h + "\"\n";
    out += "\nnamespace espresso::types {\n";
    for (const auto &t : used)
    {
        const std::string name = t["name"];
        if (t["kind"] == "external")
            out += "using " + name + " = " + t["cppType"].get<std::string>() + ";\n";
        else if (t["kind"] == "enum")
        {
            out += "enum class " + name + " : int32_t {\n";
            for (const auto &v : t["values"])
                out += "    " + v["name"].get<std::string>() + " = " +
                       v["value"].get<std::string>() + ",\n";
            out += "};\n";
        }
        else
        {
            out += "struct " + name + " {\n";
            for (const auto &f : t["fields"])
                out += field_cpp(p, f);
            out += "};\n";
        }
    }
    return out + "}\n";
}
std::string payload_header(const json &p, const json &n)
{
    std::string out =
        "#pragma once\n#include <cstdint>\n#include <type_traits>\n#include "
        "\"esp_err.h\"\n#include \"generated/data_types.hpp\"\n\nnamespace espresso::data {\n";
    const std::string name = n["typeName"], id = n.value("payloadTypeId", "");
    if (!id.empty())
    {
        for (const auto &t : p.value("types", json::array()))
            if (t["id"] == id)
                out += "using " + name + " = ::espresso::types::" + t["name"].get<std::string>() +
                       ";\n";
    }
    else
    {
        out += "struct " + name + " {\n";
        for (const auto &f : n["fields"])
            out += field_cpp(p, f);
        out += "};\n";
    }
    return out + "static_assert(std::is_trivially_copyable_v<" + name +
           ">, \"Payloads must be trivially copyable; queues copy bytes.\");\n}\n\n";
}
std::string queue_step_function(const json &p, const json &t, const json &selected)
{
    std::vector<json> steps;
    std::set<std::string> ids;
    auto append = [&](const json &task)
    {
        for (const auto *phase : {"setup", "loop"})
            for (const auto &step : task[phase])
                if (!placed_connection(step) && (step["kind"] == "send" || step["kind"] == "receive") &&
                    ids.insert(step["id"]).second)
                    steps.push_back(step);
    };
    // Adding setup connectors must not rename helpers used by preserved loop code.
    for (const auto &original : p.value("imported", json::object()).value("nodes", json::array()))
        if (original["id"] == t["id"])
            append(original);
    append(t);
    std::set<std::string> names;
    for (const auto &step : steps)
    {
        for (const auto &node : p["nodes"])
            if (node["id"] == step["structId"])
            {
                const auto base =
                    step["kind"].get<std::string>() + "_" + node["symbol"].get<std::string>();
                auto name = base;
                size_t suffix = 2;
                while (!names.insert(name).second)
                    name = base + "_" + std::to_string(suffix++);
                if (step["id"] == selected["id"])
                    return name;
                break;
            }
    }
    throw std::runtime_error("Queue step has no matching input/output helper.");
}

std::string parameter_header(const json &p, const json &t)
{
    std::string out = "#pragma once\n#include \"generated/project_headers.hpp\"\n";
    std::set<std::string> includes;
    bool receives = false;
    for (const auto *phase : {"setup", "loop"})
        for (const auto &step : t[phase])
            if (!placed_connection(step) && (step["kind"] == "send" || step["kind"] == "receive"))
            {
                receives |= step["kind"] == "receive";
                for (const auto &node : p["nodes"])
                    if (node["id"] == step["structId"])
                        includes.insert(node["symbol"]);
            }
    for (const auto &name : includes)
        out += "#include \"shared/" + name + ".hpp\"\n";
    if (receives)
        out += "#include <optional>\n";
    out += "\nnamespace espresso::tasks::" + t["symbol"].get<std::string>() +
           " {\nnamespace parameters = ::" + config_namespace(t) + ";\n";
    for (const auto *phase : {"setup", "loop"})
        for (const auto &step : t[phase])
            if (!placed_connection(step) && (step["kind"] == "send" || step["kind"] == "receive"))
                for (const auto &node : p["nodes"])
                    if (node["id"] == step["structId"])
                    {
                        const bool receive = step["kind"] == "receive";
                        const auto type =
                            "::espresso::data::" + node["typeName"].get<std::string>();
                        const auto function = queue_step_function(p, t, step);
                        out += "\n// Timeout in Config File: " + config_namespace(t) +
                               "::" + timeout_setting(t, phase, step) + "\ninline " +
                               (receive ? "std::optional<" + type + "> " : "bool ") + function +
                               (receive ? "()\n{\n" : "(const " + type + "& value)\n{\n");
                        out += "    constexpr auto timeout_ms = static_cast<int64_t>(parameters::" +
                               timeout_setting(t, phase, step) + ");\n";
                        out += "    static_assert(timeout_ms >= -1 && timeout_ms <= 3600000, "
                               "\"Timeout must be -1 or 0-3600000 ms\");\n";
                        out += "    const auto timeout = timeout_ms == -1 ? portMAX_DELAY : "
                               "pdMS_TO_TICKS(timeout_ms);\n";
                        const auto call = "::espresso::shared::" + step["kind"].get<std::string>() +
                                          "_" + node["symbol"].get<std::string>() +
                                          "(value, timeout)";
                        if (receive)
                            out += "    " + type + " value{};\n    if (!" + call +
                                   ") return std::nullopt;\n    return value;\n}\n";
                        else
                            out += "    return " + call + ";\n}\n";
                        break;
                    }
    return out + "}\n";
}
} // namespace espresso
