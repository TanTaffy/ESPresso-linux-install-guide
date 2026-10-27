#include "espresso/core.hpp"
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
    const auto sources = p.value("sourceFiles", json::object());
    require(sources.is_object() && sources.size() <= 600, "Invalid imported source files.");
    size_t source_size = 0;
    std::set<std::string> source_paths;
    for (const auto &[name, entry] : sources.items())
    {
        const auto extension = fs::path(name).extension().string();
        require(safe_relative(name) && name.rfind("main/", 0) == 0 &&
                    (extension == ".cpp" || extension == ".hpp" || extension == ".h") &&
                    source_paths.insert(lower(name)).second &&
                    has_string(entry, "content", 2 * 1024 * 1024) &&
                    has_string(entry, "generated", 2 * 1024 * 1024) &&
                    (!entry.contains("taskId") || has_string(entry, "taskId")),
                "Invalid imported source snapshot.");
        source_size += entry["content"].get_ref<const std::string &>().size() +
                       entry["generated"].get_ref<const std::string &>().size();
    }
    require(source_size <= 8 * 1024 * 1024,
            "Imported source snapshots exceed 8 MB. No files have been dropped.");
    require(!p.contains("libraryLocks") || p["libraryLocks"].is_object(),
            "Invalid library version record.");
}
void check_build(const std::string &content)
{
    // User build code is kept verbatim; generated lists live in their own included file.
    std::istringstream lines(content);
    std::string line, code;
    while (std::getline(lines, line))
    {
        const auto comment = line.find('#');
        code += line.substr(0, comment) + "\n";
    }
    require(std::regex_search(code,
                              std::regex(R"(include\s*\(\s*"?generated/project\.cmake"?\s*\))")) &&
                code.find("${ESPRESSO_SOURCES}") != std::string::npos &&
                code.find("${ESPRESSO_REQUIRES}") != std::string::npos,
            "main/CMakeLists.txt: keep the generated/project.cmake include and the "
            "ESPRESSO_SOURCES / ESPRESSO_REQUIRES variables so new tasks and libraries can be "
            "registered. Add custom entries with list(APPEND ...) before idf_component_register. "
            "Your original build file is retained.");
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
