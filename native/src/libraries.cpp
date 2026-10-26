#include "espresso/core.hpp"
#include "espresso/github_release.hpp"
#include <regex>
#include <set>

namespace espresso
{
void normalize_project(json &p)
{
    if (!p.contains("libraries"))
        p["libraries"] = json::array();
}
json task_library_ids(const json &task) { return task.value("libraryIds", json::array()); }
bool source_file(const std::string &name)
{
    return std::regex_match(name, std::regex(".*\\.(c|cc|cpp|cxx|S)"));
}
bool library_file(const std::string &name)
{
    const auto base = fs::path(name).filename().string();
    if (std::regex_match(lower(base),
                         std::regex("(?:example|test)(?:[_.-].*)?\\.(?:c|cc|cpp|cxx|h|hpp)")))
        return false;
    return source_file(name) || std::regex_match(name, std::regex(".*\\.(h|hh|hpp|hxx|tpp|inl)")) ||
           base == "LICENSE" || base == "LICENSE.md" || base == "LICENSE.txt" ||
           base == "LICENSE.MIT" || base == "README.md";
}
void check_libraries(const json &p)
{
    auto libs = p.value("libraries", json::array());
    require(libs.is_array() && libs.size() <= 32, "A project supports up to 32 libraries.");
    std::set<std::string> ids, names;
    for (const auto &lib : libs)
    {
        require(lib.is_object() && has_string(lib, "id") && has_string(lib, "name") &&
                    has_string(lib, "source"),
                "Invalid library metadata.");
        require(!lib["id"].get<std::string>().empty() && ids.insert(lib["id"]).second,
                "Library IDs must be unique.");
        const std::string name = lib["name"];
        require(
            std::regex_match(name, std::regex("[A-Za-z][A-Za-z0-9_]{0,63}")) &&
                names.insert(lower(name)).second,
            "Library names must be unique component names using letters, digits and underscores.");
        require(!std::regex_match(lower(name),
                                  std::regex("(?:main|con|prn|aux|nul|com[1-9]|lpt[1-9])")),
                "Reserved library component name: " + name);
        require(lib.contains("headers") && lib["headers"].is_array() && lib["headers"].size() <= 32,
                "Library headers must be a list.");
        for (const auto &header : lib["headers"])
            require(
                header.is_string() && safe_relative(header.get<std::string>()) &&
                    std::regex_match(header.get<std::string>(), std::regex(".*\\.(h|hh|hpp|hxx)")),
                "Invalid library include header.");
        require(lib.contains("dependencies") && lib["dependencies"].is_array() &&
                    lib["dependencies"].size() <= 64,
                "Library dependencies must be a list.");
        for (const auto &dep : lib["dependencies"])
            require(dep.is_string() && std::regex_match(dep.get<std::string>(),
                                                        std::regex("[A-Za-z][A-Za-z0-9_]{0,63}")),
                    "Invalid ESP-IDF component dependency.");
        const std::string source = lib["source"];
        require(source == "local" || source == "github",
                "Choose a local folder or GitHub release library.");
        if (source == "github")
        {
            require(has_string(lib, "repository") &&
                        std::regex_match(lib["repository"].get<std::string>(),
                                         std::regex("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")),
                    "Use a GitHub repository in owner/repository form.");
            require(has_string(lib, "version") && !lib["version"].get<std::string>().empty(),
                    "Choose latest or a release tag.");
        }
        else
        {
            require(lib.contains("files") && lib["files"].is_object() && !lib["files"].empty() &&
                        lib["files"].size() <= 300,
                    "Select a library source folder.");
            size_t size = 0;
            for (const auto &[path, text] : lib["files"].items())
            {
                require(safe_relative(path) && library_file(path) && text.is_string(),
                        "Unsafe or unsupported library file: " + path);
                const auto content = text.get<std::string>();
                require(content.find('\0') == std::string::npos, "Library source must be text.");
                size += content.size();
            }
            require(size <= 2 * 1024 * 1024, "A local library supports up to 2 MB of source.");
        }
    }
    for (const auto &task : p["nodes"])
        if (task["kind"] == "task")
        {
            require(!task.contains("libraryIds") ||
                        (task["libraryIds"].is_array() && task["libraryIds"].size() <= 32),
                    "Task libraries must be a list.");
            for (const auto &id : task_library_ids(task))
                require(id.is_string() && ids.count(id), "Task references a missing library.");
        }
}
Files library_preview(const json &lib)
{
    Files result;
    const std::string prefix = "components/" + lib["name"].get<std::string>() + "/";
    if (lib["source"] == "github")
    {
        result[prefix + "SOURCE.md"] = "Downloaded from " + lib["repository"].get<std::string>() +
                                       " release " + lib["version"].get<std::string>() +
                                       " during export.\n";
        std::string cmake = "# Sources and include directories are resolved from the release "
                            "during export.\n# REQUIRES";
        for (const auto &dep : lib["dependencies"])
            cmake += " " + dep.get<std::string>();
        result[prefix + "CMakeLists.txt"] = cmake + "\n";
        return result;
    }
    std::set<std::string> dirs = {"."};
    std::set<std::string> paths;
    std::string cmake = "idf_component_register(\n    SRCS";
    size_t sources = 0;
    for (const auto &[name, text] : lib["files"].items())
    {
        require(paths.insert(lower(name)).second, "Library filenames differ only by case: " + name);
        result[prefix + name] = text;
        if (source_file(name))
        {
            cmake += "\n        \"" + name + "\"";
            ++sources;
        }
        else if (std::regex_match(name, std::regex(".*\\.(h|hh|hpp|hxx)")))
        {
            auto dir = fs::path(name).parent_path().generic_string();
            if (!dir.empty())
                dirs.insert(dir);
        }
    }
    require(sources > 0 || !lib["headers"].empty(), "Library has no source files or headers.");
    for (const auto &header : lib["headers"])
    {
        bool found = false;
        for (const auto &dir : dirs)
            if (lib["files"].contains(dir == "." ? header.get<std::string>()
                                                 : dir + "/" + header.get<std::string>()))
                found = true;
        require(found, "Library header not found: " + header.get<std::string>());
    }
    cmake += "\n    INCLUDE_DIRS";
    for (const auto &dir : dirs)
        cmake += " \"" + dir + "\"";
    if (!lib["dependencies"].empty())
    {
        cmake += "\n    REQUIRES";
        for (const auto &dep : lib["dependencies"])
            cmake += " " + dep.get<std::string>();
    }
    result[prefix + "CMakeLists.txt"] = cmake + "\n)\n";
    return result;
}
json local_library(const fs::path &folder)
{
    require(fs::is_directory(folder), "Choose a library source directory.");
    json files = json::object(), headers = json::array();
    size_t size = 0;
    for (fs::recursive_directory_iterator it(folder), end; it != end; ++it)
    {
        require(!it->is_symlink(), "Library source folders must not contain symbolic links.");
        if (it->is_directory())
        {
            const auto name = lower(it->path().filename().string());
            if (name == ".git" || name == "build" || name == "examples" || name == "tests" ||
                name == "node_modules")
                it.disable_recursion_pending();
            continue;
        }
        const auto name = fs::relative(it->path(), folder).generic_string();
        if (!library_file(name))
            continue;
        require(safe_relative(name), "Library filename cannot be packaged: " + name);
        auto text = read_file(it->path());
        size += text.size();
        require(size <= 2 * 1024 * 1024 && files.size() < 300,
                "Library source is too large (2 MB / 300 files maximum).");
        files[name] = text;
        if (std::regex_match(name, std::regex(".*\\.(h|hpp)")))
            headers.push_back(name);
    }
    require(!files.empty(), "No supported C/C++ source files were found.");
    std::string name = folder.filename().string();
    name = std::regex_replace(name, std::regex("[^A-Za-z0-9_]"), "_");
    if (name.empty() || !std::isalpha(static_cast<unsigned char>(name.front())))
        name = "Library_" + name;
    if (name.size() > 64)
        name.resize(64);
    return {{"name", name},   {"source", "local"},  {"version", "local"},
            {"files", files}, {"headers", headers}, {"dependencies", json::array()}};
}
json export_libraries(const json &p, Files &files)
{
    std::set<std::string> used = type_libraries(p);
    for (const auto &task : p["nodes"])
        if (task["kind"] == "task")
            for (const auto &id : task_library_ids(task))
                used.insert(id);
    json locks = p.value("libraryLocks", json::object());
    for (const auto &lib : p.value("libraries", json::array()))
    {
        if (!used.count(lib["id"]))
            continue;
        const auto snapshots = p.value("extraFiles", json::object());
        const auto prefix = "components/" + lib["name"].get<std::string>() + "/";
        bool preserved = false;
        for (const auto &[name, bytes] : snapshots.items())
            if (name.rfind(prefix, 0) == 0)
            {
                preserved = true;
                break;
            }
        if (preserved)
        {
            const auto previous = p.value("libraryLocks", json::object());
            if (previous.contains(lib["id"].get<std::string>()))
                locks[lib["id"].get<std::string>()] = previous[lib["id"].get<std::string>()];
            continue;
        }
        if (lib["source"] == "local")
        {
            auto local = library_preview(lib);
            files.insert(local.begin(), local.end());
            locks[lib["id"].get<std::string>()] = {{"name", lib["name"]}, {"source", "local"}};
        }
        else
        {
            const auto release = github_release::fetch_library(lib);
            for (const auto &[name, text] : release.files)
                files[name] = text;
            locks[lib["id"].get<std::string>()] = release.lock;
        }
    }
    if (!locks.empty())
        files["espresso.libraries.lock.json"] = locks.dump(2) + "\n";
    return locks;
}
} // namespace espresso
