#include "espresso/core.hpp"
#include <algorithm>

namespace espresso
{
json handle(const json &request)
{
    const std::string op = request.at("op");
    if (op.rfind("catalog-", 0) == 0)
        return handle_catalog(request);
    if (op == "new")
        return {{"project",
                 {{"version", 1},
                  {"name", "untitled-project"},
                  {"target", "esp32s3"},
                  {"libraries", json::array()},
                  {"nodes", json::array()}}}};
    if (op == "load")
    {
        auto p = json::parse(read_file(input_path(request)));
        normalize_project(p);
        check_shape(p);
        return {{"project", p}, {"diagnostics", validate(p)}};
    }
    if (op == "import-project")
    {
        auto p = import_project(input_path(request));
        return {{"project", p}, {"diagnostics", validate(p)}};
    }
    if (op == "local-library")
        return {{"library", local_library(input_path(request))}};
    auto project = request.at("project");
    normalize_project(project);
    check_shape(project);
    if (op == "instantiate-template")
        return {{"project",
                 instantiate_template(project, request.at("template"), request.at("position"))}};
    if (op == "import-config")
    {
        import_config(project, read_file(input_path(request)));
        check_shape(project);
        return {{"project", project}};
    }
    if (op == "check-library")
    {
        for (const auto &lib : project["libraries"])
            if (lib["source"] == "local")
                library_preview(lib);
        return {{"valid", true}};
    }
    if (op == "save")
    {
        auto path = input_path(request);
        atomic_save(path, project.dump(2) + "\n");
        return {{"path", path.u8string()}};
    }
    auto diagnostics = validate(project);
    bool valid = !has_errors(diagnostics);
    if (op == "validate")
        return {{"diagnostics", diagnostics}, {"valid", valid}};
    if (op == "preview")
    {
        json files = json::object();
        if (valid)
            try
            {
                auto generated = generate(project, &diagnostics);
                restore_preserved(project, generated);
                for (const auto &[name, bytes] : generated)
                {
                    try
                    {
                        json value = bytes;
                        value.dump();
                        files[name] = value;
                    }
                    catch (...)
                    {
                        files[name] =
                            "[Binary file preserved: " + std::to_string(bytes.size()) + " bytes]";
                    }
                }
            }
            catch (const std::exception &e)
            {
                valid = false;
                diagnostics.push_back(
                    {{"severity", "error"}, {"message", e.what()}, {"nodeId", ""}});
            }
        std::string config_content;
        try
        {
            config_content = render_config(project);
        }
        catch (...)
        {
            config_content = project.value("configFile", json::object()).value("content", "");
        }
        json step_code = json::object();
        const auto code = project.value("code", json::object());
        for (const auto &task : project["nodes"])
            if (task["kind"] == "task")
                for (const char *phase : {"setup", "loop"})
                    for (const auto &step : task[phase])
                    {
                        const auto key = region_key("step", step["id"]);
                        if (code.contains(key))
                            step_code[step["id"].get<std::string>()] = code[key];
                    }
        return {{"diagnostics", diagnostics},
                {"valid", valid},
                {"configContent", config_content},
                {"stepStates", code_states(project)},
                {"stepCode", step_code},
                {"connectionCode", pending_connections(project)},
                {"files", files}};
    }
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
        export_libraries(project, files);
        restore_preserved(project, files);
        files["espresso.project.json"] = project_manifest(project, files).dump(2) + "\n";
        require(
            files["espresso.project.json"].size() <= 8 * 1024 * 1024,
            "Project manifest exceeds the 8 MB import limit. Reduce bundled source or code size.");
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
                {"diagnostics", diagnostics}};
    }
    throw std::runtime_error("Unknown native operation.");
}
} // namespace espresso
