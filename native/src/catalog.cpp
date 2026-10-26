#include "espresso/core.hpp"
#include <algorithm>
#include <regex>
#include <set>
#include <vector>

namespace espresso
{
namespace
{
void check_entry(const json &entry, const std::string &kind)
{
    if (kind == "templates")
        check_templates(json::array({entry}));
    else
    {
        json project = {{"libraries", json::array({entry})}, {"nodes", json::array()}};
        check_libraries(project);
        if (entry["source"] == "local")
            library_preview(entry);
    }
}
json read_catalog(const fs::path &folder, const std::string &kind,
                  std::map<std::string, fs::path> &paths)
{
    json items = json::array(), errors = json::array();
    std::vector<fs::path> files;
    for (const auto &file : fs::directory_iterator(folder))
        if (file.path().extension() == ".json")
            files.push_back(file.path());
    std::sort(files.begin(), files.end());
    size_t total = 0;
    for (const auto &file : files)
    {
        try
        {
            require(!fs::is_symlink(file) && fs::is_regular_file(file), "Use a regular JSON file.");
            require(items.size() < (kind == "templates" ? 64u : 32u),
                    "Catalog entry limit reached.");
            const auto text = read_file(file);
            total += text.size();
            require(total <= 8 * 1024 * 1024, "Catalog exceeds 8 MB.");
            const auto entry = json::parse(text);
            check_entry(entry, kind);
            const std::string id = entry.at("id");
            require(!paths.count(id), "Duplicate ID: " + id);
            paths[id] = file;
            items.push_back(entry);
        }
        catch (const std::exception &error)
        {
            errors.push_back(file.filename().u8string() + ": " + error.what());
        }
    }
    return {{"items", items}, {"errors", errors}, {"path", folder.u8string()}};
}
} // namespace

json handle_catalog(const json &request)
{
    const auto folder = input_path(request);
    fs::create_directories(folder);
    const std::string op = request.at("op");
    if (op == "catalog-seed")
    {
        if (!fs::exists(folder / ".initialized"))
        {
            require(has_string(request, "source", 32000), "A defaults folder is required.");
            for (const auto &file :
                 fs::directory_iterator(fs::u8path(request["source"].get<std::string>())))
            {
                require(file.is_regular_file() && !file.is_symlink(),
                        "Default entries must be regular files.");
                const auto destination = folder / file.path().filename();
                if (!fs::exists(destination))
                    atomic_save(destination, read_file(file.path()));
            }
            atomic_save(folder / ".initialized",
                        "Defaults installed. Deleted entries stay deleted.\n");
        }
        return {{"ready", true}};
    }
    const std::string kind = request.value("kind", "");
    require(kind == "templates" || kind == "libraries", "Choose a template or library catalog.");
    std::map<std::string, fs::path> paths;
    auto catalog = read_catalog(folder, kind, paths);
    if (op == "catalog-load")
        return catalog;
    if (op == "catalog-save")
    {
        const auto entry = request.at("entry");
        check_entry(entry, kind);
        const std::string id = entry["id"];
        fs::path destination;
        if (paths.count(id))
            destination = paths.at(id);
        else
        {
            require(paths.size() < (kind == "templates" ? 64u : 32u),
                    "Catalog entry limit reached.");
            std::string name = std::regex_replace(entry["name"].get<std::string>(),
                                                  std::regex("[^A-Za-z0-9_-]"), "_")
                                   .substr(0, 64);
            if (name.empty())
                name = "custom";
            if (std::regex_match(lower(name), std::regex("(?:con|prn|aux|nul|com[1-9]|lpt[1-9])")))
                name = "custom_" + name;
            const std::string suffix =
                kind == "templates" ? ".espresso-task.json" : ".espresso-library.json";
            destination = folder / (name + suffix);
            int n = 2;
            while (fs::exists(destination))
                destination = folder / (name + "-" + std::to_string(n++) + suffix);
        }
        const auto text = entry.dump(2) + "\n";
        size_t size = text.size();
        for (const auto &[other_id, file] : paths)
            if (other_id != id)
                size += static_cast<size_t>(fs::file_size(file));
        require(size <= 8 * 1024 * 1024, "Catalog exceeds 8 MB.");
        atomic_save(destination, text);
    }
    else if (op == "catalog-delete")
    {
        require(has_string(request, "id") && paths.count(request["id"]),
                "Catalog entry no longer exists. Refresh the list.");
        require(fs::remove(paths.at(request["id"])), "Could not remove the catalog entry.");
    }
    else
        throw std::runtime_error("Unknown catalog operation.");
    paths.clear();
    return read_catalog(folder, kind, paths);
}
} // namespace espresso
