#pragma once

#include <filesystem>
#include <map>
#include <nlohmann/json.hpp>
#include <string>

namespace espresso
{
using json = nlohmann::json;
namespace fs = std::filesystem;
using Files = std::map<std::string, std::string>;

void require(bool condition, const std::string &message);
bool has_string(const json &value, const char *key, size_t maximum = 200);
std::string lower(std::string value);
void check_shape(const json &project);
json validate(const json &project);
bool has_errors(const json &diagnostics);

Files generate(const json &project);
std::string region(const json &project, const std::string &key, const std::string &body,
                   const std::string &indent = "");
std::string region_key(const std::string &kind, const std::string &id);
json code_states(const json &project);
json project_manifest(const json &project, const Files &files);
json import_project(const fs::path &manifest);
void add_recovered_code(const json &project, Files &files);
bool safe_relative(const std::string &path);
json builtin_can_library();
void normalize_project(json &project);
void check_libraries(const json &project);
json task_library_ids(const json &task);
Files library_preview(const json &library);
json local_library(const fs::path &folder);
json export_libraries(const json &project, Files &files);
json can_preset(const json &project, const json &position);
json example();

fs::path input_path(const json &request);
std::string read_file(const fs::path &path);
void write_file(const fs::path &path, const std::string &text);
void atomic_save(const fs::path &path, const std::string &text);

json handle(const json &request);
} // namespace espresso
