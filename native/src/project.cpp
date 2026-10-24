#include "espresso/core.hpp"
#include <regex>
#include <set>
#include <sstream>

namespace espresso
{
bool safe_relative(const std::string &name)
{
    if (name.empty() || name.size() > 240 || name.front() == '/' ||
        !std::regex_match(name, std::regex("[A-Za-z0-9_./-]+")))
        return false;
    for (const auto &part : fs::path(name))
        if (part == ".." || part == "." || part.empty())
            return false;
    return true;
}
std::string region_key(const std::string &kind, const std::string &id)
{
    const char *hex = "0123456789abcdef";
    std::string key = kind + "-";
    for (unsigned char c : id)
    {
        key += hex[c >> 4];
        key += hex[c & 15];
    }
    return key;
}
std::string region(const json &p, const std::string &key, const std::string &body,
                   const std::string &indent)
{
    const auto code = p.value("code", json::object());
    std::string content = code.contains(key) ? code.at(key).get<std::string>() : body;
    require(content.empty() || content.back() == '\n', "Code sections must end with a newline.");
    require(content.find("espresso:begin") == std::string::npos &&
                content.find("espresso:end") == std::string::npos,
            "Code contains a reserved section marker.");
    return indent + "// espresso:begin " + key + "\n" + content + indent + "// espresso:end " +
           key + "\n";
}
struct Sections
{
    std::string structure;
    Files bodies;
};
Sections sections(const std::string &source, const std::string &filename)
{
    Sections out;
    const bool editable =
        filename.rfind("main/", 0) == 0 && fs::path(filename).extension() == ".cpp";
    std::istringstream stream(source);
    std::string line, current;
    const std::regex marker("[ \\t]*// espresso:(begin|end) ([a-z]+-[0-9a-f]+)[ \\t]*");
    while (std::getline(stream, line))
    {
        if (!line.empty() && line.back() == '\r')
            line.pop_back();
        std::smatch match;
        if (editable && std::regex_match(line, match, marker))
        {
            const std::string action = match[1], key = match[2];
            if (action == "begin")
            {
                require(current.empty() && !out.bodies.count(key),
                        filename + ": duplicate or nested section " + key);
                current = key;
                out.bodies[key] = "";
            }
            else
            {
                require(current == key, filename + ": unmatched section end " + key);
                current.clear();
            }
            out.structure += line + "\n";
        }
        else
        {
            require(!editable || (line.find("espresso:begin") == std::string::npos &&
                                  line.find("espresso:end") == std::string::npos),
                    filename + ": damaged ESPresso section marker.");
            if (current.empty())
                out.structure += line + "\n";
            else
                out.bodies[current] += line + "\n";
        }
    }
    require(current.empty(), filename + ": missing section end for " + current);
    return out;
}
bool contains_code(const std::string &text)
{
    std::istringstream lines(text);
    std::string line;
    bool block = false;
    while (std::getline(lines, line))
    {
        for (size_t i = 0; i < line.size(); ++i)
        {
            if (block)
            {
                if (line.compare(i, 2, "*/") == 0)
                {
                    block = false;
                    ++i;
                }
                continue;
            }
            if (line.compare(i, 2, "//") == 0)
                break;
            if (line.compare(i, 2, "/*") == 0)
            {
                block = true;
                ++i;
                continue;
            }
            if (!std::isspace(static_cast<unsigned char>(line[i])))
                return true;
        }
    }
    return false;
}
json code_states(const json &p)
{
    json states = json::object();
    const auto code = p.value("code", json::object());
    for (const auto &task : p["nodes"])
        if (task["kind"] == "task")
            for (const char *phase : {"setup", "loop"})
                for (const auto &step : task[phase])
                    if (step["kind"] == "placeholder")
                    {
                        const auto key = region_key("step", step["id"]);
                        states[step["id"].get<std::string>()] =
                            code.contains(key) && contains_code(code.at(key)) ? "Code present"
                                                                              : "Empty";
                    }
    return states;
}
void add_recovered_code(const json &p, Files &files)
{
    std::set<std::string> active;
    for (const auto &[name, text] : files)
        if (fs::path(name).extension() == ".cpp")
            for (const auto &[key, body] : sections(text, name).bodies)
                active.insert(key);
    std::string recovered;
    const auto code = p.value("code", json::object());
    for (const auto &[key, value] : code.items())
        if (!active.count(key) && contains_code(value))
            recovered += "// Removed section: " + key + "\n" + value.get<std::string>() + "\n";
    if (!recovered.empty())
        files["espresso-recovered-code.txt"] = recovered;
}
json project_manifest(const json &p, const Files &files)
{
    json managed = json::object();
    for (const auto &[name, text] : files)
    {
        if (name == "espresso.layout.json" || name == "README.md" ||
            name == "espresso-recovered-code.txt")
            continue;
        const auto parsed = sections(text, name);
        managed[name] = {{"structure", parsed.structure}, {"sections", json::array()}};
        for (const auto &[key, body] : parsed.bodies)
            managed[name]["sections"].push_back(key);
    }
    return {{"format", "espresso-project"},
            {"version", 1},
            {"generatorVersion", "0.2.0"},
            {"layout", p},
            {"files", managed}};
}
json import_project(const fs::path &manifest)
{
    auto doc = json::parse(read_file(manifest));
    require(doc.is_object() && doc.value("format", "") == "espresso-project" &&
                doc.value("version", 0) == 1,
            "Select an espresso.project.json exported by ESPresso 0.2 or newer.");
    auto p = doc.at("layout");
    check_shape(p);
    require(doc.contains("files") && doc["files"].is_object() && doc["files"].size() <= 1000,
            "Invalid project file inventory.");
    const auto root = fs::canonical(manifest.parent_path());
    auto code = p.value("code", json::object());
    const auto expected_files = generate(p);
    Files defaults;
    for (const auto &[name, text] : expected_files)
        for (const auto &[key, body] : sections(text, name).bodies)
            defaults[key] = body;
    std::set<std::string> keys;
    size_t total = 0;
    for (const auto &[name, descriptor] : doc["files"].items())
    {
        require(safe_relative(name), "Unsafe project file path: " + name);
        const auto path = root / fs::u8path(name);
        require(fs::is_regular_file(path), "Missing project file: " + name);
        const auto relative = fs::relative(fs::canonical(path), root).generic_string();
        require(safe_relative(relative), "Project file resolves outside the project: " + name);
        const auto text = read_file(path);
        total += text.size();
        require(total <= 12 * 1024 * 1024, "Imported project exceeds the 12 MB source limit.");
        const auto parsed = sections(text, name);
        require(parsed.structure == descriptor.at("structure").get<std::string>(),
                name + ": generated structure changed outside editable sections. Restore that "
                       "structure before importing.");
        std::set<std::string> expected = descriptor.at("sections").get<std::set<std::string>>();
        require(expected.size() == parsed.bodies.size(), name + ": missing editable section.");
        for (const auto &[key, body] : parsed.bodies)
        {
            require(expected.count(key) && keys.insert(key).second,
                    name + ": unexpected or duplicate section " + key);
            // Unedited TODOs stay generated, so changing a note in the GUI still updates them.
            // Explicit edits (including deleting a TODO) remain implementation snapshots.
            if (code.contains(key) || !defaults.count(key) || defaults.at(key) != body)
                code[key] = body;
        }
    }
    // Check that a manifest has not omitted required generated files or changed its layout.
    for (const auto &[name, text] : expected_files)
    {
        if (name == "espresso.layout.json" || name == "README.md" ||
            name == "espresso-recovered-code.txt" || name.rfind("components/", 0) == 0)
            continue;
        require(doc["files"].contains(name), "Project manifest is missing " + name);
        require(sections(text, name).structure == doc["files"][name]["structure"],
                "Project layout and generated structure disagree: " + name);
    }
    for (fs::recursive_directory_iterator it(root), end; it != end; ++it)
    {
        const auto name = fs::relative(it->path(), root).generic_string();
        if (it->is_directory())
        {
            if (it->path().filename() == "build" || it->path().filename() == ".git")
                it.disable_recursion_pending();
            continue;
        }
        if (doc["files"].contains(name) || name == manifest.filename().generic_string() ||
            name == "espresso.layout.json" || name == "README.md" ||
            name == "espresso-recovered-code.txt" || name == "sdkconfig" || name == "sdkconfig.old")
            continue;
        throw std::runtime_error("Unmanaged file: " + name +
                                 ". Import supports projects with no extra source files.");
    }
    p["code"] = code;
    normalize_project(p);
    check_shape(p);
    return p;
}
} // namespace espresso
