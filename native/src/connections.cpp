#include "espresso/core.hpp"
#include <algorithm>
#include <cctype>
#include <sstream>

namespace espresso
{
bool placed_connection(const json &step)
{
    return step.contains("placement");
}
std::string connection_helper(const json &step)
{
    return "io_" + region_key("step", step["id"]).substr(5);
}
namespace
{
struct Token
{
    size_t begin, end;
    std::string text;
    int conditional;
};
bool word(char c)
{
    return std::isalnum(static_cast<unsigned char>(c)) || c == '_';
}
std::vector<Token> tokenize(const std::string &source)
{
    std::vector<Token> result;
    int conditional = 0;
    for (size_t i = source.compare(0, 3, "\xEF\xBB\xBF") == 0 ? 3 : 0; i < source.size();)
    {
        if (std::isspace(static_cast<unsigned char>(source[i]))) { ++i; continue; }
        const size_t start = i;
        if (source.compare(i, 2, "//") == 0)
        {
            do
            {
                i = source.find('\n', i);
                if (i == std::string::npos) { i = source.size(); break; }
                const size_t last = i && source[i - 1] == '\r' ? i - 1 : i;
                ++i;
                if (!last || source[last - 1] != '\\') break;
            } while (i < source.size());
            continue;
        }
        if (source.compare(i, 2, "/*") == 0)
        {
            const auto end = source.find("*/", i + 2);
            require(end != std::string::npos, "Unfinished C++ comment; imported code is unchanged.");
            i = end + 2;
            continue;
        }
        if (source[i] == '#')
        {
            do
            {
                i = source.find('\n', i);
                if (i == std::string::npos) { i = source.size(); break; }
                const size_t last = i && source[i - 1] == '\r' ? i - 1 : i;
                ++i;
                if (!last || source[last - 1] != '\\') break;
            } while (i < source.size());
            const auto directive = source.substr(start, i - start);
            size_t at = directive.find_first_not_of(" \t", 1), end = at;
            if (at == std::string::npos) at = end = directive.size();
            while (end < directive.size() && word(directive[end])) ++end;
            const auto command = directive.substr(at, end - at);
            result.push_back({start, i, directive, conditional});
            if (command == "if" || command == "ifdef" || command == "ifndef") ++conditional;
            if (command == "endif") --conditional;
            require(conditional >= 0, "Unbalanced C++ conditionals; imported code is unchanged.");
            continue;
        }
        size_t raw = i;
        if (source.compare(raw, 2, "u8") == 0) raw += 2;
        else if (source[raw] == 'u' || source[raw] == 'U' || source[raw] == 'L') ++raw;
        if (source.compare(raw, 2, "R\"") == 0)
        {
            const auto open = source.find('(', raw + 2);
            require(open != std::string::npos && open - raw <= 18, "Invalid C++ raw string.");
            const auto suffix = ")" + source.substr(raw + 2, open - raw - 2) + "\"";
            const auto end = source.find(suffix, open + 1);
            require(end != std::string::npos, "Unfinished C++ raw string.");
            i = end + suffix.size();
            result.push_back({start, i, "@literal", conditional});
            continue;
        }
        // Apostrophes inside numeric literals are digit separators, not quotes.
        if (word(source[i]))
        {
            const bool numeric = std::isdigit(static_cast<unsigned char>(source[i]));
            while (i < source.size() && (word(source[i]) || (numeric && source[i] == '\''))) ++i;
        }
        else if (source[i] == '\"' || source[i] == '\'')
        {
            const char quote = source[i++];
            bool closed = false;
            while (i < source.size())
            {
                if (source[i] == '\\') { i = std::min(i + 2, source.size()); continue; }
                if (source[i++] == quote) { closed = true; break; }
            }
            require(closed, "Unfinished C++ string or character literal.");
            result.push_back({start, i, "@literal", conditional});
            continue;
        }
        else if (source.compare(i, 2, "::") == 0) i += 2;
        else ++i;
        require(source[i - 1] != '\\', "Line-spliced C++ needs manual connector integration.");
        result.push_back({start, i, source.substr(start, i - start), conditional});
    }
    require(conditional == 0, "Unbalanced C++ conditionals; imported code is unchanged.");
    return result;
}
struct Loop
{
    size_t open, close, include;
};
Loop locate_loop(const std::vector<Token> &tokens, const std::string &symbol)
{
    struct Scope { std::string path; bool opaque; size_t include; };
    std::vector<Scope> scopes;
    std::string scope;
    bool opaque = false;
    size_t statement = 0, include = 0;
    std::vector<Loop> found;
    for (size_t i = 0; i < tokens.size(); ++i)
    {
        const auto &token = tokens[i];
        if (!token.text.empty() && token.text[0] == '#') { statement = i + 1; continue; }
        if (token.text == "{")
        {
            bool names = statement < i && tokens[statement].text == "namespace";
            std::string suffix;
            if (names)
                for (size_t j = statement + 1; j < i; ++j)
                {
                    if (tokens[j].text != "::" && !word(tokens[j].text.front())) names = false;
                    suffix += tokens[j].text;
                }
            if (names && suffix.empty()) names = false;
            if (!opaque && !names && statement < i && tokens[statement].text == "void")
            {
                size_t name_end = statement + 1;
                std::string name;
                while (name_end < i && tokens[name_end].text != "(") name += tokens[name_end++].text;
                const auto qualified = scope.empty() ? name : scope + "::" + name;
                if (qualified == "espresso::tasks::" + symbol + "::loop")
                {
                    require(token.conditional == 0 && i > name_end && tokens[i - 1].text == ")",
                            "The imported loop definition uses conditional compilation or an unsupported signature. "
                            "Keep a single ordinary void loop(...) definition to add connectors automatically.");
                    size_t end = i + 1;
                    int depth = 1;
                    std::vector<int> branches;
                    for (; end < tokens.size() && depth; ++end)
                    {
                        const auto &text = tokens[end].text;
                        if (!text.empty() && text[0] == '#')
                        {
                            size_t begin = text.find_first_not_of(" \t", 1), finish = begin;
                            if (begin == std::string::npos) begin = finish = text.size();
                            while (finish < text.size() && word(text[finish])) ++finish;
                            const auto command = text.substr(begin, finish - begin);
                            if (command == "if" || command == "ifdef" || command == "ifndef") branches.push_back(depth);
                            else if (command == "else" || command == "elif" || command == "endif")
                            {
                                require(!branches.empty() && depth == branches.back(),
                                        "Conditional compilation changes the loop's brace structure. "
                                        "Keep balanced blocks inside each branch; the original file is unchanged.");
                                if (command == "endif") branches.pop_back();
                            }
                        }
                        if (tokens[end].text == "{") ++depth;
                        if (tokens[end].text == "}") --depth;
                    }
                    require(depth == 0 && branches.empty(), "The imported loop() has unbalanced or conditional braces.");
                    found.push_back({i, end - 1, scopes.empty() ? tokens[statement].begin : include});
                }
            }
            scopes.push_back({scope, opaque, include});
            if (scopes.size() == 1) include = tokens[statement].begin;
            if (names) scope += (scope.empty() ? "" : "::") + suffix;
            else opaque = true;
            statement = i + 1;
        }
        else if (token.text == "}")
        {
            require(!scopes.empty(), "The imported task file has unbalanced braces.");
            scope = scopes.back().path; opaque = scopes.back().opaque; include = scopes.back().include;
            scopes.pop_back(); statement = i + 1;
        }
        else if (token.text == ";") statement = i + 1;
    }
    require(scopes.empty(), "The imported task file has unbalanced braces.");
    require(found.size() == 1,
            "Could not identify one unambiguous loop() in the imported task namespace. "
            "Keep the exported loop function structure; the original file is unchanged.");
    return found.front();
}
const json *baseline_task(const json &p, const json &task)
{
    if (p.contains("imported"))
        for (const auto &node : p["imported"]["nodes"])
            if (node["id"] == task["id"]) return &node;
    return nullptr;
}
std::string io_code(const json &p, const json &task, const json &step, bool last)
{
    const std::string kind = step["kind"];
    if (kind == "notify") return "    ::espresso::generated::notify_"; // Resolved by caller.
    const std::string local = step["localName"];
    const auto call = "::espresso::tasks::" + task["symbol"].get<std::string>() +
                      "::connections::" + connection_helper(step);
    if (kind == "read") return "    " + local + " = " + call + "();\n";
    if (kind == "write") return "    " + call + "(" + local + ");\n";
    const auto failure = step.value("onFailure", "return");
    const auto fallback = failure == "return" ? "return;" : failure == "assert" ? "configASSERT(false);" : "/* Keep the local value and continue. */";
    if (kind == "send")
        for (const auto &data : p["nodes"])
            if (data["id"] == step["structId"])
                return send_statement(data, step, call + "(" + local + ")", last);
    const auto temporary = "espresso_received_" + connection_helper(step);
    return "    if (const auto " + temporary + " = " + call + "())\n        " + local + " = *" + temporary +
           ";\n    else { " + fallback + " }\n";
}
} // namespace
std::string imported_connection_header(const json &p, const json &task)
{
    std::string out = "#pragma once\n#include \"generated/project_headers.hpp\"\n#include \"generated/task_runtime.hpp\"\n#include <optional>\n";
    for (const auto &node : p["nodes"])
        if (node["kind"] == "struct") out += "#include \"shared/" + node["symbol"].get<std::string>() + ".hpp\"\n";
    out += "\nnamespace espresso::tasks::" + task["symbol"].get<std::string>() + "::connections {\n";
    bool any = false;
    for (const auto &step : task["loop"])
    {
        if (!placed_connection(step)) continue;
        any = true;
        const std::string kind = step["kind"];
        if (kind == "notify") continue;
        for (const auto &node : p["nodes"])
            if (node["id"] == step["structId"])
            {
                const auto type = "::espresso::data::" + node["typeName"].get<std::string>();
                const auto function = connection_helper(step);
                if (kind == "read")
                    out += "inline " + type + " " + function + "() { return ::espresso::shared::read_" + node["symbol"].get<std::string>() + "(); }\n";
                else if (kind == "write")
                    out += "inline void " + function + "(const " + type + "& value) { ::espresso::shared::write_" + node["symbol"].get<std::string>() + "(value); }\n";
                else
                {
                    const bool receive = kind == "receive";
                    out += "inline " + (receive ? "std::optional<" + type + "> " : "bool ") + function +
                           (receive ? "()\n{\n" : "(const " + type + "& value)\n{\n");
                    out += "    constexpr auto timeout_ms = static_cast<int64_t>(::" + config_namespace(task) + "::" + timeout_setting(task, "loop", step) + ");\n";
                    out += "    static_assert(timeout_ms >= -1 && timeout_ms <= 3600000, \"Timeout must be -1 or 0-3600000 ms\");\n";
                    out += "    const auto timeout = timeout_ms == -1 ? portMAX_DELAY : pdMS_TO_TICKS(timeout_ms);\n";
                    if (receive) out += "    " + type + " value{};\n";
                    const auto call = "::espresso::shared::" + kind + "_" + node["symbol"].get<std::string>() + "(value, timeout)";
                    out += receive ? "    if (!" + call + ") return std::nullopt;\n    return value;\n}\n" : "    return " + call + ";\n}\n";
                }
            }
    }
    return any ? out + "}\n" : "";
}
std::string extend_imported_task(const json &p, const json &task, const std::string &source)
{
    const auto *base = baseline_task(p, task);
    if (!base) return source;
    std::set<std::string> original, new_headers;
    for (const auto *phase : {"setup", "loop"})
        for (const auto &step : (*base)[phase]) original.insert(step["id"]);
    std::vector<json> steps;
    for (const auto &step : task["loop"])
        if (placed_connection(step) && !original.count(step["id"])) steps.push_back(step);
    const auto assigned = task_library_ids(task), old_libraries = task_library_ids(*base);
    for (const auto &lib : p.value("libraries", json::array()))
        if (std::find(assigned.begin(), assigned.end(), lib["id"]) != assigned.end() &&
            std::find(old_libraries.begin(), old_libraries.end(), lib["id"]) == old_libraries.end())
            for (const auto &header : lib["headers"]) new_headers.insert(header);
    if (steps.empty() && new_headers.empty()) return source;
    const auto tokens = tokenize(source);
    const auto loop = locate_loop(tokens, task["symbol"]);
    const std::string newline = source.find("\r\n") != std::string::npos ? "\r\n" : "\n";
    std::string declarations, start, end;
    std::string last_end;
    for (const auto &step : steps)
        if (step["placement"] == "end") last_end = step["id"];
    std::set<std::string> locals;
    for (const auto &step : steps)
    {
        const std::string kind = step["kind"];
        if (kind != "notify")
        {
            const std::string local = step["localName"];
            if (locals.insert(local).second)
            {
                require(std::none_of(tokens.begin(), tokens.end(),
                                     [&](const Token &t) { return t.text == local; }),
                        "New connector local name '" + local + "' is already used in the imported loop. "
                        "Choose another Local sample name; the original code is unchanged.");
                for (const auto &node : p["nodes"])
                    if (node["id"] == step["structId"])
                    {
                        if (kind == "send" || kind == "write")
                            declarations += "    // TODO: Populate " + local + ".\n";
                        declarations += "    [[maybe_unused]] ::espresso::data::" + node["typeName"].get<std::string>() + " " + local + "{};\n";
                    }
            }
        }
        std::string code = task_step_comment(p, step);
        if (kind == "notify")
        {
            for (const auto &target : p["nodes"])
                if (target["id"] == step["taskId"])
                    code += "    ::espresso::generated::notify_" + target["symbol"].get<std::string>() + "();\n";
        }
        else code += io_code(p, task, step, step["id"] == last_end);
        (step["placement"] == "start" ? start : end) += code;
    }
    struct Edit { size_t at; std::string text; };
    std::vector<Edit> edits;
    // A FIFO send that used to end loop() needs its return-on-failure check
    // restored when new end connectors follow it. Match only a standalone
    // generated helper call at the actual end of the preserved loop.
    if (!end.empty())
        for (const auto &step : (*base)["loop"])
        {
            if (step["kind"] != "send" || step.value("onFailure", "return") != "return") continue;
            const auto data = std::find_if(p["nodes"].begin(), p["nodes"].end(),
                                          [&](const json &n) { return n["id"] == step["structId"]; });
            if (data == p["nodes"].end() || data->value("delivery", "snapshot") == "mailbox") continue;
            const auto function = placed_connection(step)
                                      ? "::espresso::tasks::" + task["symbol"].get<std::string>() +
                                            "::connections::" + connection_helper(step)
                                      : queue_step_function(p, task, step);
            const auto expected = tokenize(function + "(" + step["localName"].get<std::string>() + ");");
            if (loop.close < expected.size()) continue;
            const size_t first = loop.close - expected.size();
            if (first <= loop.open) continue;
            const auto &previous = tokens[first - 1].text;
            if (first - 1 != loop.open && previous != ";" && previous != "}") continue;
            bool matches = true;
            for (size_t i = 0; i < expected.size(); ++i)
                if (tokens[first + i].text != expected[i].text || tokens[first + i].conditional)
                    matches = false;
            if (matches)
            {
                edits.push_back({tokens[first].begin, "if (!"});
                edits.push_back({tokens[loop.close - 2].end, ") return"});
                break;
            }
        }
    auto line_endings = [&](const std::string &text) {
        std::string converted;
        for (const char c : text) converted += c == '\n' ? newline : std::string(1, c);
        return converted;
    };
    if (!steps.empty())
    {
        new_headers.insert("generated/" + task["symbol"].get<std::string>() + "_connections.hpp");
        edits.push_back({tokens[loop.open].end, line_endings("\n" + declarations + start)});
        if (!end.empty()) edits.push_back({tokens[loop.close].begin, line_endings("\n" + end)});
    }
    std::string includes;
    for (const auto &header : new_headers)
    {
        const bool exists = std::any_of(tokens.begin(), tokens.end(), [&](const Token &token) {
            if (token.conditional || token.text.empty() || token.text[0] != '#') return false;
            auto directive = token.text;
            directive.erase(std::remove_if(directive.begin(), directive.end(), [](char c) { return std::isspace(static_cast<unsigned char>(c)); }), directive.end());
            return directive == "#include\"" + header + "\"" || directive == "#include<" + header + ">";
        });
        if (!exists) includes += "#include \"" + header + "\"\n";
    }
    if (!includes.empty())
    {
        // Make assigned library types available to user helpers as well as loop().
        // Keep initial include/define directives in order and insert outside comments.
        const auto first = std::find_if(tokens.begin(), tokens.end(), [](const Token &t) {
            return t.text.empty() || t.text[0] != '#';
        });
        size_t at = first == tokens.end() ? loop.include : first->begin;
        if (first != tokens.end() && first->conditional)
            for (auto it = tokens.begin(); it != first; ++it)
                if (it->conditional == 0 && !it->text.empty() && it->text[0] == '#')
                {
                    auto directive = it->text;
                    directive.erase(std::remove_if(directive.begin(), directive.end(), [](char c) { return std::isspace(static_cast<unsigned char>(c)); }), directive.end());
                    if (directive.rfind("#if", 0) == 0) at = it->begin;
                }
        const size_t bom = source.compare(0, 3, "\xEF\xBB\xBF") == 0 ? 3 : 0;
        const auto prefix = at > bom && source[at - 1] != '\n' ? "\n" : "";
        edits.push_back({at, line_endings(prefix + includes)});
    }
    std::stable_sort(edits.begin(), edits.end(), [](const Edit &a, const Edit &b) { return a.at > b.at; });
    auto result = source;
    for (const auto &edit : edits) result.insert(edit.at, edit.text);
    return result;
}
} // namespace espresso
