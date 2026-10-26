#include "espresso/core.hpp"
#include <algorithm>
#include <cctype>
#include <regex>
#include <sstream>

namespace espresso
{
namespace
{
struct Token
{
    size_t begin, end;
    std::string text;
};
struct Constant
{
    std::string scope, name, type, value;
    size_t begin, end, type_begin, type_end, value_begin, value_end;
};
struct Scope
{
    std::string name;
    size_t open, close;
};
struct Parsed
{
    std::vector<Constant> constants;
    std::vector<Scope> scopes;
    std::map<std::string, std::set<std::string>> occupied;
};
std::string trim(const std::string &s)
{
    const auto a = s.find_first_not_of(" \r\n\t");
    return a == std::string::npos ? "" : s.substr(a, s.find_last_not_of(" \r\n\t") - a + 1);
}
bool letter(char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_'; }
std::vector<Token> lex(const std::string &s)
{
    std::vector<Token> out;
    int conditional = 0;
    for (size_t i = 0; i < s.size();)
    {
        const size_t start = i;
        if (std::isspace(static_cast<unsigned char>(s[i])))
        {
            ++i;
            continue;
        }
        if (s.compare(i, 2, "//") == 0)
        {
            i = s.find('\n', i);
            if (i == std::string::npos)
                break;
            continue;
        }
        if (s.compare(i, 2, "/*") == 0)
        {
            auto end = s.find("*/", i + 2);
            require(end != std::string::npos, "Config file has an unfinished comment.");
            i = end + 2;
            continue;
        }
        if (s[i] == '#')
        {
            size_t end = i;
            do
            {
                end = s.find('\n', end + 1);
            } while (end != std::string::npos && end > 0 && s[end - 1] == '\\');
            const auto line = s.substr(i, (end == std::string::npos ? s.size() : end) - i);
            std::smatch match;
            if (std::regex_search(line, match, std::regex("^#[ \\t]*(if|ifdef|ifndef|endif)\\b")))
            {
                // Ordinary include guards are transparent. Other conditional declarations
                // remain verbatim and are deliberately not presented as editable settings.
                std::smatch guard_name;
                bool guard = false;
                if (match[1] == "ifndef" && out.empty() &&
                    std::regex_search(line, guard_name,
                                      std::regex("^#[ \\t]*ifndef[ \\t]+([A-Za-z_][A-Za-z0-9_]*)")))
                {
                    const auto rest = s.substr(end == std::string::npos ? s.size() : end + 1);
                    guard =
                        std::regex_search(rest, std::regex("^[ \\r\\n\\t]*#[ \\t]*define[ \\t]+" +
                                                           guard_name[1].str() + "\\b"));
                }
                if (match[1] == "endif")
                {
                    if (conditional)
                        --conditional;
                }
                else if (!guard)
                    ++conditional;
            }
            i = end == std::string::npos ? s.size() : end + 1;
            continue;
        }
        if (conditional)
        {
            ++i;
            continue;
        }
        size_t raw = i;
        if (s.compare(raw, 2, "u8") == 0)
            raw += 2;
        else if (s[raw] == 'u' || s[raw] == 'U' || s[raw] == 'L')
            ++raw;
        if (s.compare(raw, 2, "R\"") == 0)
        {
            auto open = s.find('(', raw + 2);
            require(open != std::string::npos && open - raw <= 18,
                    "Config file has an unfinished raw string.");
            auto end = s.find(")" + s.substr(raw + 2, open - raw - 2) + "\"", open + 1);
            require(end != std::string::npos, "Config file has an unfinished raw string.");
            i = end + open - raw; // ')' + delimiter + '"'
        }
        else if (s[i] == '\"' || s[i] == '\'')
        {
            const char quote = s[i++];
            bool closed = false;
            while (i < s.size())
            {
                if (s[i] == '\\')
                {
                    i = std::min(i + 2, s.size());
                    continue;
                }
                if (s[i++] == quote)
                {
                    closed = true;
                    break;
                }
            }
            require(closed, "Config file has an unfinished quoted value.");
        }
        else if (letter(s[i]))
        {
            const bool number = std::isdigit(static_cast<unsigned char>(s[i]));
            while (i < s.size() && (letter(s[i]) || (number && (s[i] == '\'' || s[i] == '.'))))
                ++i;
        }
        else if (s.compare(i, 2, "::") == 0 || s.compare(i, 2, "==") == 0 ||
                 s.compare(i, 2, "!=") == 0 || s.compare(i, 2, "<=") == 0 ||
                 s.compare(i, 2, ">=") == 0)
            i += 2;
        else
            ++i;
        out.push_back({start, i, s.substr(start, i - start)});
    }
    return out;
}
Parsed parse(const std::string &s)
{
    Parsed out;
    const auto tokens = lex(s);
    struct Frame
    {
        std::string path;
        bool opaque;
        size_t scope;
    };
    std::vector<Frame> stack;
    std::string path;
    size_t statement = 0;
    int opaque = 0;
    for (size_t i = 0; i < tokens.size(); ++i)
    {
        const auto &token = tokens[i];
        if (!opaque && (token.text == "{" || token.text == ";"))
        {
            size_t first = statement;
            bool constant = false;
            while (first < i &&
                   (tokens[first].text == "inline" || tokens[first].text == "static" ||
                    tokens[first].text == "constexpr" || tokens[first].text == "const"))
            {
                constant =
                    constant || tokens[first].text == "constexpr" || tokens[first].text == "const";
                ++first;
            }
            if (constant)
            {
                size_t delimiter = first;
                while (delimiter < i && tokens[delimiter].text != "=" &&
                       tokens[delimiter].text != "[" && tokens[delimiter].text != "(")
                    ++delimiter;
                if (delimiter > first && identifier(tokens[delimiter - 1].text))
                    out.occupied[path].insert(tokens[delimiter - 1].text);
            }
            if (statement + 1 < i &&
                (tokens[statement].text == "struct" || tokens[statement].text == "class" ||
                 tokens[statement].text == "enum"))
                out.occupied[path].insert(tokens[statement + 1].text);
        }
        if (token.text == "{")
        {
            size_t first = statement;
            if (first < i && tokens[first].text == "inline")
                ++first;
            bool ns = !opaque && first < i && tokens[first].text == "namespace";
            std::string name;
            if (ns)
            {
                ++first;
                for (size_t j = first; j < i; ++j)
                    name += tokens[j].text;
                ns = !name.empty() &&
                     std::regex_match(
                         name, std::regex("[A-Za-z][A-Za-z0-9_]*(?:::[A-Za-z][A-Za-z0-9_]*)*"));
            }
            const auto previous = path;
            if (ns)
            {
                path += (path.empty() ? "" : "::") + name;
                out.scopes.push_back({path, token.end, s.size()});
            }
            else
                ++opaque;
            stack.push_back({previous, !ns, ns ? out.scopes.size() - 1 : 0});
            statement = i + 1;
        }
        else if (token.text == "}")
        {
            require(!stack.empty(), "Config file has an unmatched closing brace.");
            auto frame = stack.back();
            stack.pop_back();
            if (frame.opaque)
                --opaque;
            else
                out.scopes[frame.scope].close = token.begin;
            path = frame.path;
            statement = i + 1;
        }
        else if (token.text == ";")
        {
            if (!opaque && statement < i)
            {
                size_t first = statement;
                bool constant = false;
                while (first < i &&
                       (tokens[first].text == "inline" || tokens[first].text == "static" ||
                        tokens[first].text == "constexpr" || tokens[first].text == "const"))
                {
                    constant = constant || tokens[first].text == "constexpr" ||
                               tokens[first].text == "const";
                    ++first;
                }
                size_t equals = first;
                while (equals < i && tokens[equals].text != "=")
                    ++equals;
                if (constant && equals >= first + 2 && equals + 1 < i)
                {
                    const auto &name = tokens[equals - 1];
                    const auto type = trim(s.substr(tokens[first].begin,
                                                    tokens[equals - 2].end - tokens[first].begin));
                    const auto value = trim(s.substr(tokens[equals + 1].begin,
                                                     tokens[i - 1].end - tokens[equals + 1].begin));
                    if (identifier(name.text) && config_type(type) && constant_expression(value))
                        out.constants.push_back({path, name.text, type, value,
                                                 tokens[statement].begin, token.end,
                                                 tokens[first].begin, tokens[equals - 2].end,
                                                 tokens[equals + 1].begin, tokens[i - 1].end});
                }
            }
            statement = i + 1;
        }
    }
    require(stack.empty(), "Config file has an unfinished namespace or declaration.");
    // A declaration repeated under conditionals or in reopened namespaces is ambiguous.
    std::map<std::string, int> counts;
    for (const auto &c : out.constants)
        ++counts[c.scope + "::" + c.name];
    out.constants.erase(std::remove_if(out.constants.begin(), out.constants.end(),
                                       [&](const Constant &c)
                                       { return counts[c.scope + "::" + c.name] != 1; }),
                        out.constants.end());
    return out;
}
struct Edit
{
    size_t begin, end;
    std::string value;
};
std::string apply(std::string source, std::vector<Edit> edits)
{
    std::stable_sort(edits.begin(), edits.end(),
                     [](const Edit &a, const Edit &b) { return a.begin > b.begin; });
    for (const auto &e : edits)
        if (source.substr(e.begin, e.end - e.begin) != e.value)
            source.replace(e.begin, e.end - e.begin, e.value);
    return source;
}
size_t line_start(const std::string &source, size_t position)
{
    const auto newline = source.rfind('\n', position == 0 ? 0 : position - 1);
    return newline == std::string::npos ? 0 : newline + 1;
}
std::string leading_indent(const std::string &source, size_t position)
{
    const auto start = line_start(source, position);
    auto end = start;
    while (end < source.size() && (source[end] == ' ' || source[end] == '\t'))
        ++end;
    return source.substr(start, end - start);
}
std::string line_ending(const std::string &source, size_t from = 0)
{
    const auto newline = source.find('\n', from);
    return newline != std::string::npos && newline > 0 && source[newline - 1] == '\r' ? "\r\n"
                                                                                      : "\n";
}
std::string indentation_unit(const std::string &source, const Parsed &parsed)
{
    std::string unit = "    ";
    size_t shortest = source.size() + 1;
    auto offer = [&](const std::string &indent)
    {
        if (!indent.empty() && indent.size() < shortest)
        {
            unit = indent;
            shortest = indent.size();
        }
    };
    for (const auto &scope : parsed.scopes)
    {
        const auto parent = leading_indent(source, scope.close);
        offer(parent);
        for (const auto &c : parsed.constants)
            if (c.scope == scope.name && c.begin >= scope.open && c.end <= scope.close)
            {
                const auto child = leading_indent(source, c.begin);
                if (child.size() > parent.size() && child.compare(0, parent.size(), parent) == 0)
                    offer(child.substr(parent.size()));
            }
    }
    return unit;
}
std::string member_indent(const std::string &source, const Parsed &parsed, const Scope &scope,
                          const std::string &unit)
{
    for (const auto &c : parsed.constants)
        if (c.scope == scope.name && c.begin >= scope.open && c.end <= scope.close)
        {
            const auto start = line_start(source, c.begin);
            if (trim(source.substr(start, c.begin - start)).empty())
                return source.substr(start, c.begin - start);
        }
    const auto parent = leading_indent(source, scope.close);
    // A namespace containing only comments or unfamiliar C++ can still establish its style.
    auto line = source.find('\n', scope.open);
    while (line != std::string::npos && line + 1 < scope.close)
    {
        const auto start = line + 1, end = source.find('\n', start);
        const auto indent = leading_indent(source, start);
        const auto content = source.substr(
            start, (end == std::string::npos ? scope.close : std::min(end, scope.close)) - start);
        if (!trim(content).empty() && indent.size() > parent.size() &&
            indent.compare(0, parent.size(), parent) == 0)
            return indent;
        line = end;
    }
    return parent + unit;
}
} // namespace
bool config_type(const std::string &type)
{
    if (type == "auto")
        return true;
    return std::regex_match(
               type, std::regex("(?:::)?[A-Za-z][A-Za-z0-9_]*(?:::[A-Za-z][A-Za-z0-9_]*)*")) ||
           std::regex_match(type,
                            std::regex("(?:unsigned|signed)(?: (?:short|int|long|long long))?")) ||
           type == "long long" || type == "long double";
}
std::string config_namespace(const json &task)
{
    return task.value("configNamespace", "Config::" + task["symbol"].get<std::string>());
}
std::string config_path(const json &p)
{
    return p.value("configFile", json::object()).value("path", "config/Config.hpp");
}
std::string render_config(const json &p)
{
    auto source = p.value("configFile", json::object()).value("content", "");
    if (source.empty())
        source = "#pragma once\n#include <cstdint>\n\n";
    const auto parsed = parse(source);
    const auto unit = indentation_unit(source, parsed), newline = line_ending(source);
    std::vector<Edit> edits;
    std::string appended;
    for (const auto &task : config_owners(p))
    {
        const auto scope = config_namespace(task);
        const auto params = task.value("parameters", json::array());
        std::set<std::string> found;
        for (const auto &c : parsed.constants)
            if (c.scope == scope)
            {
                const auto match = std::find_if(params.begin(), params.end(),
                                                [&](const json &v) { return v["name"] == c.name; });
                const auto managed = task.value("configKeys", json::array());
                const bool owned =
                    std::find(managed.begin(), managed.end(), json(c.name)) != managed.end();
                if (match == params.end())
                {
                    if (owned)
                        edits.push_back({c.begin, c.end, ""});
                }
                else
                {
                    require(owned || (c.type == match->value("type", "auto") &&
                                      c.value == match->at("value")),
                            "Config constant " + scope + "::" + c.name +
                                " already exists. Import the config file first to edit it as a "
                                "task setting; its original value is retained.");
                    found.insert(c.name);
                    if (!builtin_setting(task, c.name))
                        edits.push_back({c.type_begin, c.type_end, match->value("type", "auto")});
                    edits.push_back({c.value_begin, c.value_end, match->at("value")});
                }
            }
        const auto block = std::find_if(parsed.scopes.rbegin(), parsed.scopes.rend(),
                                        [&](const Scope &s) { return s.name == scope; });
        const auto indent =
            block == parsed.scopes.rend() ? unit : member_indent(source, parsed, *block, unit);
        const auto ending =
            block == parsed.scopes.rend() ? newline : line_ending(source, block->open);
        std::string declarations;
        for (const auto &v : params)
            if (!found.count(v["name"]))
            {
                const auto occupied = parsed.occupied.find(scope);
                require(occupied == parsed.occupied.end() || !occupied->second.count(v["name"]),
                        "Config setting " + scope + "::" + v["name"].get<std::string>() +
                            " already exists in a declaration ESPresso cannot edit safely. Its "
                            "original code is retained.");
                const auto description = v.value("description", "");
                if (!description.empty())
                {
                    std::istringstream lines(description);
                    std::string line;
                    while (std::getline(lines, line))
                    {
                        if (!line.empty() && line.back() == '\r')
                            line.pop_back();
                        declarations += indent + "// " + line + ending;
                    }
                }
                declarations += indent + "inline constexpr " + v.value("type", "auto") + " " +
                                v["name"].get<std::string>() + " = " +
                                v["value"].get<std::string>() + ";" + ending;
            }
        if (block == parsed.scopes.rend())
            appended += (appended.empty() ? "" : newline) + "namespace " + scope + newline + "{" +
                        newline + declarations + "}" + newline;
        else if (!declarations.empty())
        {
            size_t at = block->close;
            const auto line = line_start(source, at);
            const bool own_line = trim(source.substr(line, at - line)).empty();
            if (own_line)
                at = line;
            edits.push_back({at, at,
                             own_line
                                 ? declarations
                                 : ending + declarations + leading_indent(source, block->close)});
        }
    }
    auto rendered = apply(source, edits);
    if (!appended.empty())
    {
        if (rendered.size() < newline.size() ||
            rendered.compare(rendered.size() - newline.size(), newline.size(), newline) != 0)
            rendered += newline;
        const auto blank = newline + newline;
        if (rendered.size() < blank.size() ||
            rendered.compare(rendered.size() - blank.size(), blank.size(), blank) != 0)
            rendered += newline;
        rendered += appended;
    }
    return rendered;
}
void import_config(json &p, const std::string &content)
{
    const auto parsed = parse(content);
    p["configFile"] = {{"path", config_path(p)}, {"content", content}};
    for (auto &node : p["nodes"])
    {
        if (node["kind"] == "struct")
        {
            if (node.value("delivery", "snapshot") != "queue")
                continue;
            node["configNamespace"] = queue_namespace(node);
            node["configKeys"] = json::array();
            for (const auto &c : parsed.constants)
                if (c.scope == queue_namespace(node) && c.name == "CAPACITY")
                {
                    int64_t number;
                    node["configKeys"].push_back(c.name);
                    if (integer_constant(c.value, number))
                    {
                        node["capacity"] = number;
                        node.erase("capacityExpression");
                        node["capacityLiteral"] = c.value;
                    }
                    else
                        node["capacityExpression"] = c.value;
                }
            continue;
        }
        auto &task = node;
        const auto previous = task.value("parameters", json::array());
        auto params = json::array(), keys = json::array();
        for (const auto &c : parsed.constants)
            if (c.scope == config_namespace(task))
            {
                keys.push_back(c.name);
                if (runtime_setting(c.name))
                {
                    import_runtime_setting(task, c.name, c.value);
                    continue;
                }
                bool timeout = false;
                for (const auto *phase : {"setup", "loop"})
                    for (auto &step : task[phase])
                        if ((step["kind"] == "send" || step["kind"] == "receive") &&
                            timeout_setting(task, phase, step) == c.name)
                        {
                            int64_t number;
                            step["timeoutSetting"] = c.name;
                            if (integer_constant(c.value, number))
                            {
                                step["timeoutMs"] = number;
                                step.erase("timeoutExpression");
                                step["timeoutLiteral"] = c.value;
                            }
                            else
                                step["timeoutExpression"] = c.value;
                            timeout = true;
                        }
                if (timeout)
                    continue;
                json v = {{"name", c.name},
                          {"type", c.type},
                          {"value", c.value},
                          {"label", c.name},
                          {"description", ""}};
                for (const auto &old : previous)
                    if (old["name"] == c.name)
                    {
                        v["label"] = old.value("label", c.name);
                        v["description"] = old.value("description", "");
                    }
                params.push_back(v);
            }
        task["configKeys"] = keys;
        task["parameters"] = params;
        task["configNamespace"] = config_namespace(task);
    }
}
json validate_config(const json &p)
{
    json issues = json::array();
    auto issue = [&](const std::string &m, const std::string &id = "") {
        issues.push_back({{"severity", "error"}, {"message", m}, {"nodeId", id}});
    };
    std::set<std::string> namespaces;
    for (const auto &t : config_owners(p))
    {
        const auto ns = config_namespace(t);
        bool valid =
            std::regex_match(ns, std::regex("[A-Za-z][A-Za-z0-9_]*(?:::[A-Za-z][A-Za-z0-9_]*)*"));
        std::istringstream names(std::regex_replace(ns, std::regex("::"), " "));
        std::string name;
        while (names >> name)
            valid = valid && identifier(name);
        if (!valid || !namespaces.insert(ns).second)
            issue("Tasks need distinct valid config namespaces.", t["id"]);
        const auto custom = std::find_if(p["nodes"].begin(), p["nodes"].end(),
                                         [&](const json &n) { return n["id"] == t["id"]; });
        for (const auto &v : custom->value("parameters", json::array()))
            if (builtin_setting(t, v["name"]))
                issue("Use the task/queue control for reserved config setting " +
                          v["name"].get<std::string>() + ".",
                      t["id"]);
        for (const auto &v : t["parameters"])
            if (!identifier(v["name"]))
                issue("Runtime and timeout setting names must be valid C++ identifiers.", t["id"]);
        std::set<std::string> setting_names;
        for (const auto &v : t["parameters"])
            if (!setting_names.insert(v["name"]).second)
                issue(
                    "Config setting names must be unique, including runtime and timeout settings.",
                    t["id"]);
        for (const auto &v : t.value("parameters", json::array()))
            if (!config_type(v.value("type", "auto")))
                issue("Use a scalar C++ type for config setting " + v["name"].get<std::string>() +
                          ".",
                      t["id"]);
    }
    if (issues.empty())
        try
        {
            render_config(p);
        }
        catch (const std::exception &e)
        {
            issue(e.what());
        }
    return issues;
}
} // namespace espresso
