#pragma once

#include <filesystem>
#include <map>
#include <nlohmann/json.hpp>
#include <set>
#include <string>
#include <vector>

namespace espresso
{
using json = nlohmann::json;
namespace fs = std::filesystem;
using Files = std::map<std::string, std::string>;

void require(bool condition, const std::string &message);
bool has_string(const json &value, const char *key, size_t maximum = 200);
bool valid_icon(const json &value);
bool identifier(const std::string &value);
bool initial_value(const std::string &type, const std::string &value);
bool constant_expression(const std::string &value);
void check_extensions(const json &project);
json validate_types(const json &project);
std::string field_cpp(const json &project, const json &field);
std::string payload_header(const json &project, const json &node);
std::string types_header(const json &project);
std::set<std::string> type_libraries(const json &project);
std::vector<json> used_types(const json &project);
std::string parameter_header(const json &project, const json &task);
std::string period_value(const json &task);
bool integer_constant(const std::string &value, int64_t &result);
bool runtime_setting(const std::string &name);
std::string runtime_value(const json &task, const std::string &name);
json config_settings(const json &task);
std::string timeout_setting(const json &task, const std::string &phase, const json &step);
std::string queue_namespace(const json &node);
json config_owners(const json &project);
bool builtin_setting(const json &task, const std::string &name);
void import_runtime_setting(json &task, const std::string &name, const std::string &value);
std::string config_namespace(const json &task);
std::string config_path(const json &project);
std::string render_config(const json &project);
void import_config(json &project, const std::string &content);
json validate_config(const json &project);
bool config_type(const std::string &type);
std::string base64_encode(const std::string &bytes);
std::string base64_decode(const std::string &text);
bool preserved_path(const std::string &path);
void check_preserved(const json &project);
void restore_preserved(const json &project, Files &files);
std::string merge_build(const std::string &original, const std::string &generated,
                        const std::string &base = "");
bool queue_node(const json &node);
json trigger_ids(const json &task);
bool multi_watches(const json &project, const std::string &id);
std::string lower(std::string value);
void check_shape(const json &project);
json validate(const json &project);
bool has_errors(const json &diagnostics);

Files generate(const json &project);
Files queue_files(const json &node, const json &project);
std::string event_runtime(const std::vector<json> &tasks, const std::map<std::string, json> &data);
std::string loop_parameters(const json &task, const std::map<std::string, json> &data);
std::string region(const json &project, const std::string &key, const std::string &body,
                   const std::string &indent = "");
std::string region_key(const std::string &kind, const std::string &id);
json code_states(const json &project);
json project_manifest(const json &project, const Files &files);
json import_project(const fs::path &manifest);
void add_recovered_code(const json &project, Files &files);
bool safe_relative(const std::string &path);
void normalize_project(json &project);
json handle_catalog(const json &request);
void check_libraries(const json &project);
json task_library_ids(const json &task);
Files library_preview(const json &library);
bool library_file(const std::string &name);
json local_library(const fs::path &folder);
json export_libraries(const json &project, Files &files);
void check_templates(const json &templates);
json instantiate_template(const json &project, const json &task_template, const json &position);

fs::path input_path(const json &request);
std::string read_file(const fs::path &path);
void write_file(const fs::path &path, const std::string &text);
void atomic_save(const fs::path &path, const std::string &text);

json handle(const json &request);
} // namespace espresso
