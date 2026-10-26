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
std::string source_structure(const std::string &source, const std::string &name)
{
    return sections(source, name).structure;
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
        if (p.value("extraFiles", json::object()).contains(name))
        {
            managed[name] = {{"preserved", true}};
            continue;
        }
        const auto parsed = sections(text, name);
        managed[name] = {{"structure", parsed.structure}, {"sections", json::array()}};
        for (const auto &[key, body] : parsed.bodies)
            managed[name]["sections"].push_back(key);
    }
    return {{"format", "espresso-project"},
            {"version", 1},
            {"generatorVersion", "0.7.0"},
            {"layout", p},
            {"files", managed}};
}
json import_project(const fs::path &manifest)
{
    auto doc = json::parse(read_file(manifest));
    require(doc.is_object() && doc.value("format", "") == "espresso-project" &&
                doc.value("version", 0) == 1,
            "Select an espresso.project.json exported by this version of ESPresso.");
    auto p = doc.at("layout");
    check_shape(p);
    require(doc.contains("files") && doc["files"].is_object() && doc["files"].size() <= 1000,
            "Invalid project file inventory.");
    const auto root = fs::canonical(manifest.parent_path());
    auto code = p.value("code", json::object());
    const auto expected_files = generate(p);
    auto pristine = p;
    pristine.erase("buildFiles");
    pristine.erase("sourceOverrides");
    const auto build_baseline = generate(pristine).at("main/CMakeLists.txt");
    Files defaults;
    for (const auto &[name, text] : expected_files)
        for (const auto &[key, body] : sections(text, name).bodies)
            defaults[key] = body;
    std::set<std::string> keys;
    const auto config_name = "main/" + config_path(p);
    std::string config_content;
    json extras = json::object(), builds = json::object(),
         overrides = p.value("sourceOverrides", json::object());
    size_t total = 0;
    auto read_inside = [&](const std::string &name)
    {
        require(preserved_path(name), "Unsafe project file path: " + name);
        const auto file = root / fs::u8path(name);
        require(fs::is_regular_file(file) && !fs::is_symlink(file),
                "Missing or symbolic project file: " + name);
        const auto relative = fs::relative(fs::canonical(file), root).generic_u8string();
        require(preserved_path(relative), "Project file resolves outside the project: " + name);
        auto bytes = read_file(file);
        total += bytes.size();
        require(total <= 12 * 1024 * 1024,
                "Imported project exceeds 12 MB. No source files have been dropped.");
        return bytes;
    };
    for (const auto &[name, descriptor] : doc["files"].items())
    {
        require(preserved_path(name), "Unsafe project file path: " + name);
        const bool snapshot =
            descriptor.value("preserved", false) || name.rfind("components/", 0) == 0;
        if (snapshot && !fs::exists(root / fs::u8path(name)))
            continue;
        const auto text = read_inside(name);
        if (name == config_name)
        {
            config_content = text;
            continue;
        }
        if (name == "espresso.libraries.lock.json")
        {
            p["libraryLocks"] = json::parse(text);
            continue;
        }
        if (name == "CMakeLists.txt" || name == "main/CMakeLists.txt")
        {
            if (name == "main/CMakeLists.txt")
                merge_build(text, expected_files.at(name));
            builds[name] = text;
            continue;
        }
        if (snapshot)
        {
            require(!expected_files.count(name) || name.rfind("components/", 0) == 0 ||
                        name == "README.md" || name == ".gitignore" || name == "sdkconfig.defaults",
                    "Preserved inventory conflicts with generated output: " + name);
            extras[name] = base64_encode(text);
            continue;
        }
        const auto parsed = sections(text, name);
        const auto old_structure = descriptor.at("structure").get<std::string>();
        if (parsed.structure != old_structure)
        {
            const auto extension = fs::path(name).extension().string();
            require(name.rfind("main/", 0) == 0 &&
                        (extension == ".cpp" || extension == ".hpp" || extension == ".h"),
                    name + ": generated structure changed outside editable sections.");
            overrides[name] = {{"content", text},
                               {"structure", overrides.contains(name) ? overrides[name]["structure"]
                                                                      : json(old_structure)}};
        }
        else if (overrides.contains(name))
            overrides[name]["content"] = text;
        const auto expected = descriptor.at("sections").get<std::set<std::string>>();
        require(expected.size() == parsed.bodies.size(), name + ": missing editable section.");
        for (const auto &[key, body] : parsed.bodies)
        {
            require(expected.count(key) && keys.insert(key).second,
                    name + ": unexpected or duplicate section " + key);
            if (code.contains(key) || !defaults.count(key) || defaults.at(key) != body)
                code[key] = body;
        }
    }
    for (const auto &[name, text] : expected_files)
    {
        if (name == "espresso.layout.json" || name == "README.md" ||
            name == "espresso-recovered-code.txt" || name.rfind("components/", 0) == 0)
            continue;
        require(doc["files"].contains(name), "Project manifest is missing " + name);
        if (name == config_name || name == "CMakeLists.txt" || name == "main/CMakeLists.txt")
            continue;
        require(sections(text, name).structure == doc["files"][name]["structure"],
                "Project layout and generated structure disagree: " + name);
    }
    for (fs::recursive_directory_iterator it(root), end; it != end; ++it)
    {
        const auto name = fs::relative(it->path(), root).generic_u8string();
        require(!it->is_symlink(), "Project contains a symbolic link: " + name +
                                       ". Use regular files before importing.");
        if (it->is_directory())
        {
            if (it->path().filename() == "build" || it->path().filename() == ".git")
                it.disable_recursion_pending();
            continue;
        }
        if (doc["files"].contains(name) || name == manifest.filename().generic_u8string() ||
            name == "espresso.layout.json" || name == "espresso-recovered-code.txt")
            continue;
        extras[name] = base64_encode(read_inside(name));
    }
    p["extraFiles"] = extras;
    p["buildFiles"] = builds;
    p["buildBases"] = {{"main/CMakeLists.txt", build_baseline}};
    p["sourceOverrides"] = overrides;
    import_config(p, config_content);
    p["code"] = code;
    normalize_project(p);
    check_shape(p);
    return p;
}
} // namespace espresso
