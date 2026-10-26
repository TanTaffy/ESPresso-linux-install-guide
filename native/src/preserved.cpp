#include "espresso/core.hpp"
#include <algorithm>
#include <cctype>
#include <regex>
#include <sstream>

namespace espresso
{
std::string base64_encode(const std::string &bytes)
{
    static const char *alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    for (size_t i = 0; i < bytes.size(); i += 3)
    {
        unsigned value = static_cast<unsigned char>(bytes[i]) << 16;
        if (i + 1 < bytes.size())
            value |= static_cast<unsigned char>(bytes[i + 1]) << 8;
        if (i + 2 < bytes.size())
            value |= static_cast<unsigned char>(bytes[i + 2]);
        out += alphabet[(value >> 18) & 63];
        out += alphabet[(value >> 12) & 63];
        out += i + 1 < bytes.size() ? alphabet[(value >> 6) & 63] : '=';
        out += i + 2 < bytes.size() ? alphabet[value & 63] : '=';
    }
    return out;
}
std::string base64_decode(const std::string &text)
{
    require(text.size() % 4 == 0, "Invalid preserved file encoding.");
    const std::string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    for (size_t i = 0; i < text.size(); i += 4)
    {
        unsigned value = 0;
        int padding = 0;
        for (size_t j = 0; j < 4; ++j)
        {
            const char c = text[i + j];
            if (c == '=')
            {
                require(j >= 2 && i + 4 == text.size(), "Invalid preserved file padding.");
                ++padding;
                value <<= 6;
            }
            else
            {
                const auto at = alphabet.find(c);
                require(at != std::string::npos && !padding, "Invalid preserved file encoding.");
                value = (value << 6) | static_cast<unsigned>(at);
            }
        }
        out += static_cast<char>((value >> 16) & 255);
        if (padding < 2)
            out += static_cast<char>((value >> 8) & 255);
        if (padding < 1)
            out += static_cast<char>(value & 255);
    }
    return out;
}
bool preserved_path(const std::string &name)
{
    if (name.empty() || name.size() > 240 || name.front() == '/' ||
        name.find_first_of("\\:\"<>|?*") != std::string::npos ||
        name.find('\0') != std::string::npos)
        return false;
    for (const auto &part : fs::u8path(name))
    {
        const auto s = part.u8string();
        if (s.empty() || s == "." || s == ".." || s.back() == '.' || s.back() == ' ')
            return false;
        if (std::regex_match(lower(s),
                             std::regex("(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?")))
            return false;
        for (unsigned char c : s)
            if (c < 32)
                return false;
    }
    return true;
}
void check_preserved(const json &p)
{
    const auto files = p.value("extraFiles", json::object());
    require(files.is_object() && files.size() <= 1000,
            "A project supports up to 1,000 preserved files.");
    size_t total = 0;
    std::set<std::string> paths;
    for (const auto &[name, value] : files.items())
    {
        require(preserved_path(name) && paths.insert(lower(name)).second && value.is_string(),
                "Invalid or duplicate preserved file path: " + name);
        require(lower(name) != "espresso.project.json" && lower(name) != "espresso.layout.json" &&
                    lower(name) != lower("main/" + config_path(p)),
                "A preserved file conflicts with project metadata or configuration: " + name);
        const auto content = base64_decode(value);
        total += content.size();
        require(content.size() <= 2 * 1024 * 1024 && total <= 8 * 1024 * 1024,
                "Preserved files support 2 MB each and 8 MB combined. No files have been dropped.");
    }
    const auto builds = p.value("buildFiles", json::object());
    require(builds.is_object() && builds.size() <= 2, "Invalid preserved build files.");
    for (const auto &[name, content] : builds.items())
        require((name == "CMakeLists.txt" || name == "main/CMakeLists.txt") &&
                    content.is_string() &&
                    content.get_ref<const std::string &>().size() <= 128 * 1024,
                "Invalid build file.");
    const auto bases = p.value("buildBases", json::object());
    require(bases.is_object() && bases.size() <= 1, "Invalid build file baseline.");
    for (const auto &[name, content] : bases.items())
        require(name == "main/CMakeLists.txt" && content.is_string() &&
                    content.get_ref<const std::string &>().size() <= 128 * 1024,
                "Invalid build file baseline.");
    const auto overrides = p.value("sourceOverrides", json::object());
    require(overrides.is_object() && overrides.size() <= 300, "Invalid handwritten source files.");
    for (const auto &[name, entry] : overrides.items())
        require(safe_relative(name) && name.rfind("main/", 0) == 0 &&
                    has_string(entry, "content", 2 * 1024 * 1024) &&
                    has_string(entry, "structure", 2 * 1024 * 1024),
                "Invalid handwritten source snapshot.");
    require(!p.contains("libraryLocks") || p["libraryLocks"].is_object(),
            "Invalid library version record.");
}
std::string merge_build(const std::string &original, const std::string &generated,
                        const std::string &base)
{
    std::string merged = original;
    auto body = [](const std::string &text, const std::string &kind)
    {
        const std::string begin = "# espresso:begin " + kind, end = "# espresso:end " + kind;
        const auto a = text.find(begin),
                   b = text.find(end, a == std::string::npos ? 0 : a + begin.size());
        require(a != std::string::npos && b != std::string::npos,
                "main/CMakeLists.txt: restore the ESPresso sources/libraries markers so tasks can "
                "be registered safely. Your original file is retained.");
        size_t start = a + begin.size();
        if (start < text.size() && text[start] == '\r')
            ++start;
        require(start < text.size() && text[start] == '\n', "Invalid CMake section marker.");
        return std::make_pair(start + 1, b);
    };
    for (const std::string kind : {"sources", "libraries"})
    {
        const auto fresh_range = body(generated, kind), old_range = body(merged, kind);
        const auto fresh =
            generated.substr(fresh_range.first, fresh_range.second - fresh_range.first);
        auto current = merged.substr(old_range.first, old_range.second - old_range.first);
        const auto base_range = body(base.empty() ? generated : base, kind);
        const auto baseline = (base.empty() ? generated : base)
                                  .substr(base_range.first, base_range.second - base_range.first);
        const std::regex item(kind == "sources" ? "\"([^\"]+)\"" : "[A-Za-z][A-Za-z0-9_]*");
        auto values = [&](const std::string &text)
        {
            std::set<std::string> found;
            std::istringstream lines(text);
            std::string line;
            while (std::getline(lines, line))
            {
                const auto comment = line.find('#');
                if (comment != std::string::npos)
                    line.resize(comment);
                for (std::sregex_iterator it(line.begin(), line.end(), item), end; it != end; ++it)
                {
                    const auto value = kind == "sources" ? (*it)[1].str() : it->str();
                    if (value != "PRIV_REQUIRES" && value != "REQUIRES")
                        found.insert(value);
                }
            }
            return found;
        };
        const auto required = values(fresh), previous = values(baseline), present = values(current);
        // Remove only entries previously owned by the layout. Preserve user-added entries,
        // comments and custom build code, including additions inside the generated lists.
        for (const auto &value : previous)
            if (!required.count(value))
            {
                const auto token = kind == "sources" ? "\"" + value + "\"" : value;
                size_t pos = 0;
                while ((pos = current.find(token, pos)) != std::string::npos)
                {
                    const auto line = current.rfind('\n', pos),
                               comment =
                                   current.find('#', line == std::string::npos ? 0 : line + 1);
                    const bool code = comment == std::string::npos || comment > pos;
                    const bool boundary =
                        kind == "sources" ||
                        ((pos == 0 ||
                          (!std::isalnum(static_cast<unsigned char>(current[pos - 1])) &&
                           current[pos - 1] != '_')) &&
                         (pos + token.size() == current.size() ||
                          (!std::isalnum(static_cast<unsigned char>(current[pos + token.size()])) &&
                           current[pos + token.size()] != '_')));
                    if (code && boundary)
                        current.erase(pos, token.size());
                    else
                        pos += token.size();
                }
            }
        std::string added;
        for (const auto &value : required)
            if (!present.count(value))
                added += (kind == "sources" ? "    \"" + value + "\"\n" : " " + value);
        if (!added.empty())
        {
            if (kind == "sources")
            {
                std::smatch close;
                const bool found = std::regex_search(
                    current, close, std::regex("(^|\n)[ \\t]*\\)[ \\t]*(?:#[^\n]*)?(?:\r?\n|$)"));
                require(found,
                        "Restore the ESPRESSO_SOURCES list before exporting. The original CMake "
                        "file is retained.");
                current.insert(static_cast<size_t>(close.position()) +
                                   (close.str().front() == '\n' ? 1 : 0),
                               added);
            }
            else
            {
                const auto key = current.find("PRIV_REQUIRES");
                if (key == std::string::npos)
                    current += "    PRIV_REQUIRES" + added + "\n";
                else
                    current.insert(key + std::string("PRIV_REQUIRES").size(), added);
            }
        }
        merged.replace(old_range.first, old_range.second - old_range.first, current);
    }
    return merged;
}
void restore_preserved(const json &p, Files &files)
{
    const auto extra_files = p.value("extraFiles", json::object());
    for (const auto &[name, encoded] : extra_files.items())
    {
        require(!files.count(name) || name.rfind("components/", 0) == 0 || name == "README.md" ||
                    name == ".gitignore" || name == "sdkconfig.defaults" ||
                    name == "espresso.libraries.lock.json",
                "Preserved file conflicts with generated output: " + name +
                    ". Rename the new task or shared instance to keep both files.");
        for (const auto &[generated_name, content] : files)
            require(name == generated_name || lower(name) != lower(generated_name),
                    "Preserved file conflicts with generated path: " + name);
        files[name] = base64_decode(encoded);
    }
}
} // namespace espresso
