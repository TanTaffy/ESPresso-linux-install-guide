#include "espresso/core.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <limits>
#include <regex>
#include <set>
#include <stdexcept>

namespace espresso
{
void require(bool condition, const std::string &message)
{
    if (!condition)
        throw std::runtime_error(message);
}
bool has_string(const json &j, const char *key, size_t maximum)
{
    return j.contains(key) && j[key].is_string() &&
           j[key].get_ref<const std::string &>().size() <= maximum &&
           j[key].get_ref<const std::string &>().find('\0') == std::string::npos;
}
void check_shape(const json &p)
{
    require(p.is_object() && p.value("version", 0) == 1,
            "Unsupported project format. Expected an ESPresso version 1 project.");
    require(has_string(p, "name") && has_string(p, "target"),
            "Project name and target are required.");
    require(p.contains("nodes") && p["nodes"].is_array() && p["nodes"].size() <= 200,
            "A project supports up to 200 nodes.");
    std::set<std::string> ids;
    auto id = [&](const json &item)
    {
        require(has_string(item, "id") && !item["id"].get<std::string>().empty(),
                "Every item needs an ID.");
        require(ids.insert(item["id"].get<std::string>()).second, "Duplicate item ID.");
    };
    for (const auto &n : p["nodes"])
    {
        require(n.is_object(), "Invalid node.");
        id(n);
        require(has_string(n, "kind") && has_string(n, "name") && has_string(n, "symbol"),
                "Invalid node metadata.");
        require(n.contains("position") && n["position"].is_object() &&
                    n["position"].contains("x") && n["position"]["x"].is_number() &&
                    n["position"].contains("y") && n["position"]["y"].is_number(),
                "Invalid node position.");
        require(std::isfinite(n["position"]["x"].get<double>()) &&
                    std::isfinite(n["position"]["y"].get<double>()),
                "Node positions must be finite.");
        const auto kind = n["kind"].get<std::string>();
        if (kind == "task")
        {
            require(!n.contains("preset") || (has_string(n, "preset") && n["preset"] == "msm_can"),
                    "Unknown task preset.");
            for (const auto *key : {"periodMs", "priority", "stackBytes"})
                require(n.contains(key) && n[key].is_number_integer(),
                        std::string("Missing task setting: ") + key);
            require(has_string(n, "core"), "Missing core affinity.");
            for (const auto *phase : {"setup", "loop"})
            {
                require(n.contains(phase) && n[phase].is_array() && n[phase].size() <= 250,
                        "A task phase supports up to 250 steps.");
                for (const auto &s : n[phase])
                {
                    id(s);
                    require(has_string(s, "name") && has_string(s, "kind") &&
                                has_string(s, "note", 8000),
                            "Invalid step.");
                    const auto type = s["kind"].get<std::string>();
                    require(type == "placeholder" || type == "read" || type == "write",
                            "Unknown step type.");
                    if (s.contains("action"))
                    {
                        require(has_string(s, "action") && n.value("preset", "") == "msm_can" &&
                                    type == "placeholder",
                                "CAN actions must belong to CAN preset placeholders.");
                        const std::string action = s["action"];
                        require((action == "msm_can_init" && std::string(phase) == "setup") ||
                                    (action == "msm_can_send" && std::string(phase) == "loop"),
                                "Invalid CAN preset action or phase.");
                    }
                    if (type != "placeholder")
                        require(has_string(s, "structId") && has_string(s, "localName"),
                                "A shared-data step needs a struct and local snapshot name.");
                }
            }
        }
        else if (kind == "struct")
        {
            require(has_string(n, "typeName"), "Struct type name is required.");
            require(n.contains("fields") && n["fields"].is_array() && n["fields"].size() <= 100,
                    "A struct supports up to 100 fields.");
            for (const auto &f : n["fields"])
            {
                id(f);
                require(has_string(f, "name") && has_string(f, "type") &&
                            has_string(f, "initialValue"),
                        "Invalid struct field.");
            }
        }
        else
            throw std::runtime_error("Unknown node type.");
    }
}
std::string lower(std::string s)
{
    for (auto &c : s)
        c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return s;
}
bool identifier(const std::string &s)
{
    static const std::regex syntax("[A-Za-z][A-Za-z0-9_]{0,63}");
    static const std::set<std::string> reserved = {"alignas",
                                                   "alignof",
                                                   "and",
                                                   "and_eq",
                                                   "asm",
                                                   "atomic_cancel",
                                                   "atomic_commit",
                                                   "atomic_noexcept",
                                                   "auto",
                                                   "bitand",
                                                   "bitor",
                                                   "bool",
                                                   "break",
                                                   "case",
                                                   "catch",
                                                   "char",
                                                   "char8_t",
                                                   "char16_t",
                                                   "char32_t",
                                                   "class",
                                                   "compl",
                                                   "concept",
                                                   "const",
                                                   "consteval",
                                                   "constexpr",
                                                   "constinit",
                                                   "const_cast",
                                                   "continue",
                                                   "co_await",
                                                   "co_return",
                                                   "co_yield",
                                                   "decltype",
                                                   "default",
                                                   "delete",
                                                   "do",
                                                   "double",
                                                   "dynamic_cast",
                                                   "else",
                                                   "enum",
                                                   "explicit",
                                                   "export",
                                                   "extern",
                                                   "false",
                                                   "float",
                                                   "for",
                                                   "friend",
                                                   "goto",
                                                   "if",
                                                   "inline",
                                                   "int",
                                                   "long",
                                                   "mutable",
                                                   "namespace",
                                                   "new",
                                                   "noexcept",
                                                   "not",
                                                   "not_eq",
                                                   "nullptr",
                                                   "operator",
                                                   "or",
                                                   "or_eq",
                                                   "private",
                                                   "protected",
                                                   "public",
                                                   "reflexpr",
                                                   "register",
                                                   "reinterpret_cast",
                                                   "requires",
                                                   "return",
                                                   "short",
                                                   "signed",
                                                   "sizeof",
                                                   "static",
                                                   "static_assert",
                                                   "static_cast",
                                                   "struct",
                                                   "switch",
                                                   "synchronized",
                                                   "template",
                                                   "this",
                                                   "thread_local",
                                                   "throw",
                                                   "true",
                                                   "try",
                                                   "typedef",
                                                   "typeid",
                                                   "typename",
                                                   "union",
                                                   "unsigned",
                                                   "using",
                                                   "virtual",
                                                   "void",
                                                   "volatile",
                                                   "wchar_t",
                                                   "while",
                                                   "xor",
                                                   "xor_eq",
                                                   "std"};
    return std::regex_match(s, syntax) && s.find("__") == std::string::npos && !reserved.count(s);
}
bool initial_value(const std::string &type, const std::string &value)
{
    if (type == "bool")
        return value == "true" || value == "false";
    if (type == "float" || type == "double")
    {
        static const std::regex number(
            "[-+]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?[fF]?");
        if (!std::regex_match(value, number))
            return false;
        try
        {
            const double d = std::stod(value);
            return std::isfinite(d) &&
                   (type == "double" || std::abs(d) <= std::numeric_limits<float>::max());
        }
        catch (...)
        {
            return false;
        }
    }
    static const std::map<std::string, int> bits = {
        {"uint8_t", 8}, {"uint16_t", 16}, {"uint32_t", 32}, {"uint64_t", 64},
        {"int8_t", 8},  {"int16_t", 16},  {"int32_t", 32},  {"int64_t", 64}};
    auto it = bits.find(type);
    if (it == bits.end())
        return false;
    static const std::regex integer("-?(?:0|[1-9][0-9]*)");
    if (!std::regex_match(value, integer))
        return false;
    try
    {
        const int b = it->second;
        if (type[0] == 'u')
        {
            if (value[0] == '-')
                return false;
            auto v = std::stoull(value);
            return b == 64 || v <= ((1ULL << b) - 1);
        }
        auto v = std::stoll(value);
        return b == 64 || (v >= -(1LL << (b - 1)) && v <= ((1LL << (b - 1)) - 1));
    }
    catch (...)
    {
        return false;
    }
}
json validate(const json &p)
{
    check_shape(p);
    json out = json::array();
    auto issue =
        [&](const std::string &severity, const std::string &message, const std::string &node = "")
    { out.push_back({{"severity", severity}, {"message", message}, {"nodeId", node}}); };
    if (!std::regex_match(p["name"].get<std::string>(), std::regex("[A-Za-z][A-Za-z0-9_-]{0,63}")))
        issue("error", "Project name must start with a letter and use letters, digits, hyphens or "
                       "underscores.");
    const std::string target = p["target"];
    if (target != "esp32s3" && target != "esp32" && target != "esp32c3")
        issue("error", "Select a supported ESP32 target.");
    std::map<std::string, json> structs;
    std::set<std::string> task_symbols, struct_symbols, type_names;
    size_t tasks = 0, can_tasks = 0;
    for (const auto &n : p["nodes"])
    {
        const std::string nid = n["id"], sym = n["symbol"];
        if (n["name"].get<std::string>().empty())
            issue("error", "Give every node a display name.", nid);
        if (std::regex_match(lower(sym), std::regex("(?:con|prn|aux|nul|com[1-9]|lpt[1-9])")))
            issue("error", "This symbol is reserved by Windows: " + sym, nid);
        if (!identifier(sym))
            issue("error",
                  "Invalid C++ symbol: " + sym +
                      ". Use a non-reserved identifier starting with a letter.",
                  nid);
        if (n["kind"] == "struct")
        {
            structs[nid] = n;
            if (!struct_symbols.insert(lower(sym)).second)
                issue("error", "Shared instance symbols must be unique: " + sym, nid);
            const std::string tn = n["typeName"];
            if (!identifier(tn))
                issue("error", "Invalid C++ struct type name: " + tn, nid);
            if (!type_names.insert(tn).second)
                issue("error", "Struct type names must be unique: " + tn, nid);
            std::set<std::string> fields;
            for (const auto &f : n["fields"])
            {
                const std::string name = f["name"];
                if (!identifier(name) || name == tn)
                    issue("error", "Invalid field name: " + name, nid);
                if (!fields.insert(name).second)
                    issue("error", "Duplicate struct field: " + name, nid);
                if (!initial_value(f["type"], f["initialValue"]))
                    issue("error", "Invalid type or initial value for field " + name + ".", nid);
            }
            if (n["fields"].empty())
                issue("warning", "Struct " + tn + " has no fields.", nid);
        }
        else
        {
            ++tasks;
            if (n.value("preset", "") == "msm_can")
                ++can_tasks;
            if (!task_symbols.insert(lower(sym)).second)
                issue("error", "Task symbols must be unique: " + sym, nid);
            const auto period = n["periodMs"].get<int64_t>(),
                       priority = n["priority"].get<int64_t>(),
                       stack = n["stackBytes"].get<int64_t>();
            if (period < 1 || period > 3600000)
                issue("error", "Task period must be between 1 and 3,600,000 ms.", nid);
            if (priority < 1 || priority > 24)
                issue("error", "Task priority must be between 1 and 24.", nid);
            if (stack < 1024 || stack > 1048576 || stack % 4)
                issue("error",
                      "Stack size must be a multiple of 4 between 1,024 and 1,048,576 bytes.", nid);
            const std::string core = n["core"];
            if (core != "any" && core != "0" && core != "1")
                issue("error", "Invalid core affinity.", nid);
            if (target == "esp32c3" && core == "1")
                issue("error", "ESP32-C3 has one core. Select Core 0 or Any core.", nid);
            if (n["loop"].empty())
                issue("warning", "Task " + n["name"].get<std::string>() + " has an empty loop.",
                      nid);
        }
    }
    if (!tasks)
        issue("error", "Add at least one task before exporting.");
    if (can_tasks > 1)
        issue("warning",
              "MSM_CAN uses one shared controller. Initialise it from only one CAN task.");
    std::map<std::string, std::set<std::string>> writers, readers;
    for (const auto &n : p["nodes"])
        if (n["kind"] == "task")
        {
            for (const auto *phase : {"setup", "loop"})
            {
                std::map<std::string, std::string> locals;
                for (const auto &step : n[phase])
                    if (step["kind"] != "placeholder")
                    {
                        const std::string sid = step["structId"], local = step["localName"],
                                          nid = n["id"];
                        if (!structs.count(sid))
                            issue("error",
                                  "Step " + step["name"].get<std::string>() +
                                      " needs a shared struct.",
                                  nid);
                        if (!identifier(local))
                            issue("error", "Invalid local snapshot name: " + local, nid);
                        if (n.value("preset", "") == "msm_can" && local == "can_frame")
                            issue("error",
                                  "The CAN preset reserves can_frame for its transmit frame. "
                                  "Choose another snapshot name.",
                                  nid);
                        if (locals.count(local) && locals[local] != sid)
                            issue("error",
                                  "Snapshot name " + local + " is used for different structs in " +
                                      phase + "().",
                                  nid);
                        locals[local] = sid;
                        (step["kind"] == "write" ? writers : readers)[sid].insert(nid);
                    }
            }
        }
    for (const auto &[id, n] : structs)
    {
        if (writers[id].size() > 1)
            issue("warning",
                  n["name"].get<std::string>() +
                      " has multiple writers. Each publish replaces the whole snapshot.",
                  id);
        if (writers[id].empty() && !readers[id].empty())
            issue("warning",
                  n["name"].get<std::string>() +
                      " has readers but no writer; readers receive its initial values.",
                  id);
        if (writers[id].empty() && readers[id].empty())
            issue("warning", n["name"].get<std::string>() + " is not connected to a task.", id);
    }
    return out;
}
bool has_errors(const json &diagnostics)
{
    return std::any_of(diagnostics.begin(), diagnostics.end(),
                       [](const json &d) { return d["severity"] == "error"; });
}
} // namespace espresso
