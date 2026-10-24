#pragma once

#include <map>
#include <nlohmann/json.hpp>
#include <string>

namespace github_release
{
using json = nlohmann::json;
struct Download
{
    std::map<std::string, std::string> files;
    json lock;
};

// Resolves and downloads a stable GitHub release for each CAN export.
// Throws before the export directory is created if resolution/download fails.

Download fetch_library(const json &library);
} // namespace github_release
