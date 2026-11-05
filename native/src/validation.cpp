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
bool valid_icon(const json &value)
{
    if (!value.is_string())
        return false;
    const auto text = value.get<std::string>();
    if (text.find('\0') != std::string::npos)
        return false;
    if (text.rfind("data:", 0) != 0)
        return text.size() <= 64;
    const auto comma = text.find(',');
    if (comma == std::string::npos)
        return false;
    const auto header = text.substr(0, comma);
    if (header != "data:image/png;base64" && header != "data:image/jpeg;base64" &&
        header != "data:image/webp;base64")
        return false;
    const auto size = text.size() - comma - 1;
    if (!size || size % 4 || size > 180 * 1024)
        return false;
    size_t padding = 0;
    for (size_t i = comma + 1; i < text.size(); ++i)
    {
        const char c = text[i];
        if (c == '=')
        {
            ++padding;
            if (padding > 2 || i < text.size() - 2)
                return false;
        }
        else if (padding || !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
                              (c >= '0' && c <= '9') || c == '+' || c == '/'))
            return false;
    }
    return size / 4 * 3 - padding <= 128 * 1024;
}
void check_shape(const json &p)
{
    require(p.is_object() && p.value("version", 0) == 1,
            "Unsupported project format. Expected an ESPresso version 1 project.");
    require(has_string(p, "name") && has_string(p, "target"),
            "Project name and target are required.");
    require(p.contains("nodes") && p["nodes"].is_array() && p["nodes"].size() <= 200,
            "A project supports up to 200 nodes.");
    check_libraries(p);
    if (p.contains("code"))
    {
        require(p["code"].is_object() && p["code"].size() <= 6000, "Invalid template base code.");
        size_t total = 0;
        for (const auto &[key, value] : p["code"].items())
        {
            require(std::regex_match(key, std::regex("[a-z]+-[0-9a-f]+")) && value.is_string(),
                    "Invalid template base code key.");
            const auto text = value.get<std::string>();
            total += text.size();
            require(text.find('\0') == std::string::npos && (text.empty() || text.back() == '\n'),
                    "Invalid implementation text.");
        }
        require(total <= 2 * 1024 * 1024, "Template base code exceeds 2 MB.");
    }
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
            require(!n.contains("preset"),
                    "Task presets were replaced by ordinary templates. Create a new layout.");
            for (const auto *key : {"periodMs", "priority", "stackBytes"})
                require(n.contains(key) && n[key].is_number_integer(),
                        std::string("Missing task setting: ") + key);
            require(has_string(n, "core"), "Missing core affinity.");
            require(!n.contains("trigger") ||
                        (has_string(n, "trigger") &&
                         (n["trigger"] == "periodic" || n["trigger"] == "queue" ||
                          n["trigger"] == "notification" || n["trigger"] == "queues")),
                    "Unknown task trigger.");
            require(!n.contains("queueId") || has_string(n, "queueId"), "Invalid trigger queue.");
            require(!n.contains("description") || has_string(n, "description", 8000),
                    "Invalid task description.");
            require(!n.contains("icon") || valid_icon(n["icon"]),
                    "Use an emoji/symbol or a PNG, JPEG or WebP icon up to 128 KB.");
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
                    require(!s.contains("action"), "Special step actions were replaced by template "
                                                   "code. Create a new layout.");
                    const auto type = s["kind"].get<std::string>();
                    require(type == "placeholder" || type == "read" || type == "write" ||
                                type == "send" || type == "receive" || type == "notify",
                            "Unknown step type.");
                    if (type == "notify")
                        require(has_string(s, "taskId"), "A notification needs a target task.");
                    else if (type != "placeholder")
                        require(has_string(s, "structId") && has_string(s, "localName"),
                                "A shared-data step needs a struct and local snapshot name.");
                    require(!s.contains("timeoutMs") || s["timeoutMs"].is_number_integer(),
                            "Queue timeout must be an integer.");
                    require(!s.contains("placement") ||
                                (has_string(s, "placement") &&
                                 (s["placement"] == "start" || s["placement"] == "end") &&
                                 std::string(phase) == "loop" && type != "placeholder"),
                            "Imported connectors must be placed at the start or end of loop().");
                    require(!s.contains("onFailure") ||
                                (has_string(s, "onFailure") &&
                                 (s["onFailure"] == "continue" || s["onFailure"] == "return" ||
                                  s["onFailure"] == "assert")),
                            "Unknown queue failure behaviour.");
                }
            }
        }
        else if (kind == "struct")
        {
            require(has_string(n, "typeName"), "Struct type name is required.");
            require(!n.contains("delivery") ||
                        (has_string(n, "delivery") &&
                         (n["delivery"] == "snapshot" || n["delivery"] == "queue" ||
                          n["delivery"] == "mailbox")),
                    "Unknown data delivery mode.");
            require(!n.contains("capacity") || n["capacity"].is_number_integer(),
                    "Queue capacity must be an integer.");
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
    check_extensions(p);
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
    json out = validate_types(p);
    for (const auto &issue : validate_imported(p)) out.push_back(issue);
    auto issue = [&](const std::string &severity, const std::string &message,
                     const std::string &node = "") {
        out.push_back({{"severity", severity}, {"message", message}, {"nodeId", node}});
    };
    if (!std::regex_match(p["name"].get<std::string>(), std::regex("[A-Za-z][A-Za-z0-9_-]{0,63}")))
        issue("error", "Project name must start with a letter and use letters, digits, hyphens or "
                       "underscores.");
    const std::string target = p["target"];
    if (target != "esp32s3" && target != "esp32" && target != "esp32c3")
        issue("error", "Select a supported ESP32 target.");
    std::map<std::string, json> structs;
    std::set<std::string> task_symbols, struct_symbols, type_names;
    size_t tasks = 0;
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
            if (n.value("delivery", "snapshot") == "queue" &&
                n.value("capacityExpression", "").empty() &&
                (n.value("capacity", int64_t(8)) < 1 || n.value("capacity", int64_t(8)) > 4096))
                issue("error", "Queue capacity must be between 1 and 4,096 messages.", nid);
            if (!struct_symbols.insert(lower(sym)).second)
                issue("error", "Shared instance symbols must be unique: " + sym, nid);
            const std::string tn = n["typeName"];
            if (!identifier(tn))
                issue("error", "Invalid C++ struct type name: " + tn, nid);
            if (!type_names.insert(tn).second)
                issue("error", "Struct type names must be unique: " + tn, nid);
            if (n["fields"].empty() && n.value("payloadTypeId", "").empty())
                issue("warning", "Struct " + tn + " has no fields.", nid);
        }
        else
        {
            ++tasks;
            if (!task_symbols.insert(lower(sym)).second)
                issue("error", "Task symbols must be unique: " + sym, nid);
            const auto period = n["periodMs"].get<int64_t>(),
                       priority = n["priority"].get<int64_t>(),
                       stack = n["stackBytes"].get<int64_t>();
            if (n.value("periodExpression", "").empty() && (period < 1 || period > 3600000))
                issue("error", "Task period must be between 1 and 3,600,000 ms.", nid);
            if (n.value("priorityExpression", "").empty() && (priority < 1 || priority > 24))
                issue("error", "Task priority must be between 1 and 24.", nid);
            if (n.value("stackExpression", "").empty() &&
                (stack < 1024 || stack > 1048576 || stack % 4))
                issue("error",
                      "Stack size must be a multiple of 4 between 1,024 and 1,048,576 bytes.", nid);
            const std::string core = n["core"];
            if (core != "any" && core != "0" && core != "1")
                issue("error", "Invalid core affinity.", nid);
            if (n.value("coreExpression", "").empty() && target == "esp32c3" && core == "1")
                issue("error", "ESP32-C3 has one core. Select Core 0 or Any core.", nid);
            if (n["loop"].empty())
                issue("warning", "Task " + n["name"].get<std::string>() + " has an empty loop.",
                      nid);
        }
    }
    if (!tasks)
        issue("error", "Add at least one task before exporting.");
    std::map<std::string, std::set<std::string>> writers, readers;
    for (const auto &n : p["nodes"])
        if (n["kind"] == "task")
        {
            const std::string nid = n["id"];
            const auto inputs = trigger_ids(n);
            if (n.value("trigger", "periodic") == "queues" && inputs.empty())
                issue("error", "Select at least one input queue or mailbox.", nid);
            std::set<std::string> selected;
            for (const auto &input : inputs)
            {
                const std::string qid = input;
                if (!selected.insert(qid).second)
                    issue("error", "Select each input only once.", nid);
                if (!structs.count(qid) || !queue_node(structs.at(qid)))
                    issue("error", "Choose an existing queue or mailbox to trigger this task.",
                          nid);
                else
                    readers[qid].insert(nid);
            }
            for (const auto *phase : {"setup", "loop"})
            {
                std::map<std::string, std::string> locals;
                for (const auto &step : n[phase])
                    if (step["kind"] != "placeholder")
                    {
                        if (placed_connection(step))
                        {
                            bool imported = false;
                            if (p.contains("imported"))
                                for (const auto &original : p["imported"]["nodes"])
                                    imported |= original["id"] == n["id"];
                            if (!imported) issue("error", "Start/end connector placement is only available on imported tasks.", nid);
                        }
                        if (step["kind"] == "notify")
                        {
                            const auto target_task = std::find_if(
                                p["nodes"].begin(), p["nodes"].end(),
                                [&](const json &t)
                                { return t["id"] == step["taskId"] && t["kind"] == "task"; });
                            if (target_task == p["nodes"].end() ||
                                target_task->value("trigger", "periodic") != "notification")
                                issue("error",
                                      "Notification target must be a notification-triggered task.",
                                      nid);
                            continue;
                        }
                        const std::string sid = step["structId"], local = step["localName"];
                        if (!structs.count(sid))
                            issue("error",
                                  "Step " + step["name"].get<std::string>() +
                                      " needs a shared struct.",
                                  nid);
                        if (!identifier(local))
                            issue("error", "Invalid local snapshot name: " + local, nid);
                        if (std::string(phase) == "loop" && !trigger_ids(n).empty() &&
                            local == "event")
                            issue("error",
                                  "Queue-triggered loops reserve event for the received message.",
                                  nid);
                        const bool queue_step = step["kind"] == "send" || step["kind"] == "receive";
                        if (step["kind"] == "receive" && std::string(phase) == "loop" &&
                            n.value("trigger", "periodic") == "queue" &&
                            n.value("queueId", "") == sid)
                            issue("warning",
                                  "This loop already receives its trigger message as event. This "
                                  "receive consumes another message.",
                                  nid);
                        if (structs.count(sid) && queue_step != queue_node(structs.at(sid)))
                            issue("error",
                                  "Use send/receive steps for queues and read/publish steps for "
                                  "snapshots.",
                                  nid);
                        if (queue_step && step.value("timeoutExpression", "").empty() &&
                            (step.value("timeoutMs", int64_t(0)) < -1 ||
                             step.value("timeoutMs", int64_t(0)) > 3600000))
                            issue("error", "Queue timeout must be -1 (forever) or 0–3,600,000 ms.",
                                  nid);
                        if (queue_step && std::string(phase) == "setup" &&
                            step.value("onFailure", "return") == "return")
                            issue("warning",
                                  "A failed queue operation skips remaining setup steps; the task "
                                  "still enters its loop.",
                                  nid);
                        if (locals.count(local) && locals[local] != sid)
                            issue("error",
                                  "Snapshot name " + local + " is used for different structs in " +
                                      phase + "().",
                                  nid);
                        locals[local] = sid;
                        (step["kind"] == "write" || step["kind"] == "send" ? writers : readers)[sid]
                            .insert(nid);
                    }
            }
        }
    for (const auto &[id, n] : structs)
    {
        if (queue_node(n))
        {
            if (readers[id].size() > 1)
                issue("warning",
                      n["name"].get<std::string>() +
                          " has competing consumers. Each message is received by only one task.",
                      id);
            if (writers[id].empty())
                issue("warning",
                      n["name"].get<std::string>() +
                          " has no sender; consumers wait until code sends a message.",
                      id);
            if (readers[id].empty())
                issue("warning",
                      n["name"].get<std::string>() + " has no consumer; its queue may fill.", id);
            continue;
        }
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
