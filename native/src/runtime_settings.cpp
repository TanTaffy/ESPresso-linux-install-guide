#include "espresso/core.hpp"
#include <algorithm>
#include <cctype>
#include <iomanip>
#include <regex>
#include <sstream>

namespace espresso
{
bool integer_constant(const std::string &value, int64_t &result)
{
    auto text = std::regex_replace(value, std::regex("'"), "");
    if (!std::regex_match(text, std::regex("[+-]?(?:[0-9]+|0[xX][0-9a-fA-F]+|0[bB][01]+)[uUlL]*")))
        return false;
    while (!text.empty() &&
           (text.back() == 'u' || text.back() == 'U' || text.back() == 'l' || text.back() == 'L'))
        text.pop_back();
    try
    {
        size_t offset = (text[0] == '-' || text[0] == '+') ? 1 : 0, used = 0;
        if (text.compare(offset, 2, "0b") == 0 || text.compare(offset, 2, "0B") == 0)
        {
            result =
                std::stoll(text.substr(offset + 2), &used, 2) * (offset && text[0] == '-' ? -1 : 1);
            return used == text.size() - offset - 2;
        }
        result = std::stoll(text, &used, 0);
        return used == text.size();
    }
    catch (...)
    {
        return false;
    }
}
bool runtime_setting(const std::string &name)
{
    return name == "PERIOD_MS" || name == "PRIORITY" || name == "STACK_BYTES" ||
           name == "CORE_AFFINITY";
}
std::string runtime_value(const json &task, const std::string &name)
{
    const std::string field = name == "PERIOD_MS"  ? "periodMs"
                              : name == "PRIORITY" ? "priority"
                                                   : "stackBytes";
    const std::string expression = name == "PERIOD_MS"     ? "periodExpression"
                                   : name == "PRIORITY"    ? "priorityExpression"
                                   : name == "STACK_BYTES" ? "stackExpression"
                                                           : "coreExpression";
    if (!task.value(expression, "").empty())
        return task[expression];
    const int64_t number =
        name == "CORE_AFFINITY"
            ? (task["core"] == "any" ? -1 : std::stoll(task["core"].get<std::string>()))
            : task[field].get<int64_t>();
    const auto literal = task.value("configValues", json::object()).value(name, "");
    int64_t previous;
    return integer_constant(literal, previous) && previous == number ? literal
                                                                     : std::to_string(number);
}
namespace
{
std::string timeout_value(const json &step)
{
    if (!step.value("timeoutExpression", "").empty())
        return step["timeoutExpression"];
    const auto literal = step.value("timeoutLiteral", "");
    int64_t number;
    return integer_constant(literal, number) && number == step.value("timeoutMs", 0)
               ? literal
               : std::to_string(step.value("timeoutMs", 0));
}
json setting(const std::string &name, const std::string &type, const std::string &value)
{
    return {{"name", name}, {"type", type}, {"value", value}, {"label", name}, {"description", ""}};
}
std::string key_base(const std::string &phase, const json &step)
{
    std::string key = phase + "_" + step["name"].get<std::string>();
    for (auto &c : key)
        c = std::isalnum(static_cast<unsigned char>(c))
                ? static_cast<char>(std::toupper(static_cast<unsigned char>(c)))
                : '_';
    key = std::regex_replace(key, std::regex("_+"), "_");
    if (key.size() > 45)
        key.resize(45);
    return key + "_TIMEOUT_MS";
}
} // namespace
std::string timeout_setting(const json &task, const std::string &phase, const json &step)
{
    if (step.contains("timeoutSetting"))
        return step["timeoutSetting"];
    const auto base = key_base(phase, step);
    size_t duplicates = 0;
    for (const auto &other : task[phase])
        if ((other["kind"] == "send" || other["kind"] == "receive") &&
            key_base(phase, other) == base)
            ++duplicates;
    if (duplicates < 2)
        return base;
    uint32_t hash = 2166136261u;
    for (unsigned char c : step["id"].get<std::string>())
        hash = (hash ^ c) * 16777619u;
    std::ostringstream suffix;
    suffix << std::hex << std::setw(8) << std::setfill('0') << hash;
    return base.substr(0, 40) + "_" + suffix.str();
}
json config_settings(const json &task)
{
    auto result = task.value("parameters", json::array());
    for (const auto *name : {"PERIOD_MS", "PRIORITY", "STACK_BYTES", "CORE_AFFINITY"})
        result.push_back(setting(name, name == std::string("CORE_AFFINITY") ? "int" : "unsigned",
                                 runtime_value(task, name)));
    for (const auto *phase : {"setup", "loop"})
        for (const auto &step : task[phase])
            if (step["kind"] == "send" || step["kind"] == "receive")
                result.push_back(
                    setting(timeout_setting(task, phase, step), "int", timeout_value(step)));
    return result;
}
std::string queue_namespace(const json &node)
{
    return node.value("configNamespace", "Config::queues::" + node["symbol"].get<std::string>());
}
json config_owners(const json &p)
{
    json result = json::array();
    for (const auto &node : p["nodes"])
    {
        if (node["kind"] == "task")
        {
            auto task = node;
            task["parameters"] = config_settings(node);
            result.push_back(task);
        }
        else if (node.value("delivery", "snapshot") == "queue")
        {
            auto owner = node;
            owner["configNamespace"] = queue_namespace(node);
            const auto literal = node.value("capacityLiteral", "");
            int64_t previous;
            const auto number = node.value("capacity", 8);
            const std::string value = !node.value("capacityExpression", "").empty()
                                          ? node["capacityExpression"].get<std::string>()
                                      : integer_constant(literal, previous) && previous == number
                                          ? literal
                                          : std::to_string(number);
            owner["parameters"] = json::array({setting("CAPACITY", "unsigned", value)});
            result.push_back(owner);
        }
    }
    return result;
}
bool builtin_setting(const json &task, const std::string &name)
{
    if (task["kind"] == "struct")
        return name == "CAPACITY";
    if (runtime_setting(name))
        return true;
    for (const auto *phase : {"setup", "loop"})
        for (const auto &step : task[phase])
            if ((step["kind"] == "send" || step["kind"] == "receive") &&
                timeout_setting(task, phase, step) == name)
                return true;
    return false;
}
void import_runtime_setting(json &task, const std::string &name, const std::string &value)
{
    task["configValues"][name] = value;
    const std::string field = name == "PERIOD_MS"  ? "periodMs"
                              : name == "PRIORITY" ? "priority"
                                                   : "stackBytes";
    const std::string expression = name == "PERIOD_MS"     ? "periodExpression"
                                   : name == "PRIORITY"    ? "priorityExpression"
                                   : name == "STACK_BYTES" ? "stackExpression"
                                                           : "coreExpression";
    int64_t number;
    if (integer_constant(value, number))
    {
        task.erase(expression);
        if (name == "CORE_AFFINITY")
            task["core"] = number == -1 ? "any" : std::to_string(number);
        else
            task[field] = number;
    }
    else
        task[expression] = value;
}
} // namespace espresso
