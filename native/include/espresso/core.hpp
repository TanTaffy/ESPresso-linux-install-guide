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
json can_preset(const json &project, const json &position);
json example();

fs::path input_path(const json &request);
std::string read_file(const fs::path &path);
void write_file(const fs::path &path, const std::string &text);
void atomic_save(const fs::path &path, const std::string &text);

json handle(const json &request);
} // namespace espresso
