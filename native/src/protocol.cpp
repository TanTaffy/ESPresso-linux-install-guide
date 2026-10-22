#include "espresso/core.hpp"
#include "espresso/msm_release.hpp"
#include <algorithm>

namespace espresso
{
json handle(const json &request)
{
    const std::string op = request.at("op");
    if (op == "example")
        return {{"project", example()}};
    if (op == "new")
        return {{"project",
                 {{"version", 1},
                  {"name", "untitled-project"},
                  {"target", "esp32s3"},
                  {"nodes", json::array()}}}};
    if (op == "load")
    {
        auto p = json::parse(read_file(input_path(request)));
        check_shape(p);
        return {{"project", p}, {"diagnostics", validate(p)}};
    }
    const auto &project = request.at("project");
    check_shape(project);
    if (op == "can-preset")
        return {{"task", can_preset(project, request.at("position"))}};
    if (op == "save")
    {
        auto path = input_path(request);
        atomic_save(path, project.dump(2) + "\n");
        return {{"path", path.u8string()}};
    }
    auto diagnostics = validate(project);
    const bool valid = !has_errors(diagnostics);
    if (op == "validate")
        return {{"diagnostics", diagnostics}, {"valid", valid}};
    if (op == "preview")
        return {{"diagnostics", diagnostics},
                {"valid", valid},
                {"files", valid ? json(generate(project)) : json::object()}};
    if (op == "export")
    {
        require(valid, "Fix validation errors before exporting.");
        auto files = generate(project);
        auto parent = input_path(request);
        require(fs::is_directory(parent), "Choose an existing export parent folder.");
        const auto destination = parent / fs::u8path(project["name"].get<std::string>());
        require(!fs::exists(destination),
                "The export folder already exists. Choose another parent or change the project "
                "name; existing files will not be overwritten.");
        std::string can_version;
        const bool with_can =
            std::any_of(project["nodes"].begin(), project["nodes"].end(), [](const json &n)
                        { return n["kind"] == "task" && n.value("preset", "") == "msm_can"; });
        if (with_can)
        {
            const auto release = msm_release::latest();
            for (const auto &[name, text] : release.files)
                files[name] = text;
            files["msm_can.lock.json"] = release.lock.dump(2) + "\n";
            can_version = release.lock.at("release");
        }
        const auto staging =
            parent / (".espresso-export-" +
                      std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
        require(fs::create_directory(staging), "Cannot create export staging folder.");
        try
        {
            for (const auto &[relative, text] : files)
            {
                auto path = staging / fs::u8path(relative);
                fs::create_directories(path.parent_path());
                write_file(path, text);
            }
            fs::rename(staging, destination);
        }
        catch (...)
        {
            std::error_code ec;
            fs::remove_all(staging, ec);
            throw;
        }
        return {{"path", destination.u8string()},
                {"fileCount", files.size()},
                {"msmCanVersion", can_version},
                {"diagnostics", diagnostics}};
    }
    throw std::runtime_error("Unknown native operation.");
}
} // namespace espresso
