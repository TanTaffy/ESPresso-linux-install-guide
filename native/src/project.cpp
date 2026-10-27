#include "espresso/core.hpp"
#include <algorithm>
#include <cctype>
#include <regex>
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
std::string base_code(const json &p, const std::string &key, const std::string &body)
{
    const auto code = p.value("code", json::object());
    return code.contains(key) ? code.at(key).get<std::string>() : body;
}
std::string task_file_owner(const json &p, const std::string &name)
{
    for (const auto &task : p["nodes"])
        if (task["kind"] == "task")
        {
            const auto prefix = "main/tasks/" + task["symbol"].get<std::string>();
            if (name == prefix + "_task.cpp" || name == prefix + "_task.hpp" ||
                name == prefix + "_parameters.hpp")
                return task["id"];
        }
    return "";
}
void preserve_sources(const json &p, Files &files)
{
    const auto saved = p.value("sourceFiles", json::object());
    for (const auto &[name, entry] : saved.items())
    {
        const auto owner = entry.value("taskId", "");
        const auto current_owner = task_file_owner(p, name);
        if (!owner.empty())
        {
            const auto task = std::find_if(p["nodes"].begin(), p["nodes"].end(),
                                           [&](const json &n) { return n["id"] == owner; });
            require(task != p["nodes"].end(), name + ": imported tasks cannot be deleted.");
            require(owner == current_owner,
                    name +
                        ": changing an imported task's C++ symbol needs a manual source update. "
                        "Restore its original symbol; the imported files are retained unchanged.");
        }
        require(files.count(name),
                name + ": generated file was removed. The imported file is retained; "
                       "resolve its dependencies before exporting.");
        require(files.at(name) == entry["generated"] ||
                    (!owner.empty() && fs::path(name).extension() == ".cpp"),
                name +
                    ": layout changes affect an imported interface or generated file you edited. "
                    "Restore the compatible layout or reconcile the source before importing again. "
                    "Your original files are retained.");
        for (const auto &[generated_name, body] : files)
            require(name == generated_name || lower(name) != lower(generated_name),
                    "Imported source conflicts with generated path: " + name);
        files[name] = entry["content"];
    }
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
json project_manifest(const json &p, const Files &files)
{
    auto pristine = p;
    pristine.erase("sourceFiles");
    pristine.erase("buildFiles");
    const auto generated = generate(pristine);
    json managed = json::object();
    const auto saved = p.value("sourceFiles", json::object());
    for (const auto &[name, text] : files)
    {
        if (name == "espresso.layout.json")
            continue;
        if (p.value("extraFiles", json::object()).contains(name) || !generated.count(name))
            managed[name] = {{"preserved", true}};
        else
        {
            managed[name] = {{"generated", saved.contains(name) ? saved[name]["generated"]
                                                                : json(generated.at(name))}};
            const auto owner = task_file_owner(p, name);
            if (!owner.empty())
                managed[name]["taskId"] = owner;
        }
    }
    return {{"format", "espresso-project"},
            {"version", 2},
            {"generatorVersion", "0.8.0"},
            {"layout", p},
            {"files", managed}};
}
json import_project(const fs::path &manifest)
{
    auto doc = json::parse(read_file(manifest));
    require(doc.is_object() && doc.value("format", "") == "espresso-project" &&
                doc.value("version", 0) == 2,
            "Select an espresso.project.json exported by this version of ESPresso.");
    auto p = doc.at("layout");
    check_shape(p);
    require(doc.contains("files") && doc["files"].is_object() && doc["files"].size() <= 1000,
            "Invalid project file inventory.");
    const auto root = fs::canonical(manifest.parent_path());
    auto pristine = p;
    pristine.erase("sourceFiles");
    pristine.erase("buildFiles");
    const auto expected_files = generate(pristine);
    const auto saved = p.value("sourceFiles", json::object());
    const auto config_name = "main/" + config_path(p);
    std::string config_content;
    json extras = json::object(), builds = json::object(), sources = json::object();
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
                check_build(text);
            builds[name] = text;
            continue;
        }
        if (snapshot || name == "README.md")
        {
            require(!expected_files.count(name) || name.rfind("components/", 0) == 0 ||
                        name == "README.md" || name == ".gitignore" || name == "sdkconfig.defaults",
                    "Preserved inventory conflicts with generated output: " + name);
            extras[name] = base64_encode(text);
            continue;
        }
        require(expected_files.count(name), "Unexpected generated file: " + name);
        const auto baseline =
            saved.contains(name) ? saved[name]["generated"] : json(expected_files.at(name));
        require(descriptor.at("generated") == baseline,
                "Project layout and generated file inventory disagree: " + name);
        const auto owner = task_file_owner(p, name);
        require(descriptor.value("taskId", "") == owner, "Invalid task file ownership: " + name);
        const auto extension = fs::path(name).extension().string();
        const bool editable = name.rfind("main/", 0) == 0 &&
                              name.rfind("main/generated/", 0) != 0 &&
                              (extension == ".cpp" || extension == ".hpp" || extension == ".h");
        const bool task_file = !owner.empty() && name.find("_parameters.hpp") == std::string::npos;
        if (editable && (task_file || text != baseline || saved.contains(name)))
        {
            sources[name] = {{"content", text}, {"generated", baseline}};
            if (!owner.empty())
                sources[name]["taskId"] = owner;
        }
        else
            require(text == expected_files.at(name),
                    name + ": generated file changed. "
                           "Keep custom code in your task files or separate source files.");
    }
    for (const auto &[name, text] : expected_files)
    {
        if (name == "espresso.layout.json" || name.rfind("components/", 0) == 0)
            continue;
        require(doc["files"].contains(name), "Project manifest is missing " + name);
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
            name == "espresso.layout.json")
            continue;
        extras[name] = base64_encode(read_inside(name));
    }
    p["extraFiles"] = extras;
    p["buildFiles"] = builds;
    p["sourceFiles"] = sources;
    import_config(p, config_content);
    normalize_project(p);
    capture_import(p);
    check_shape(p);
    return p;
}
} // namespace espresso
