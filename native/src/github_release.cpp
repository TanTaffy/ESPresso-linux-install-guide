#include "espresso/github_release.hpp"
#include "espresso/core.hpp"
#include <regex>
#include <stdexcept>
#include <icarus/http_client.hpp>

namespace github_release
{
inline std::string encode(const std::string &text, bool keep_slashes = false)
{
    static const char hex[] = "0123456789ABCDEF";
    std::string result;
    for (unsigned char c : text)
    {
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
            c == '-' || c == '_' || c == '.' || c == '~' || (c == '/' && keep_slashes))
            result += static_cast<char>(c);
        else
        {
            result += '%';
            result += hex[c >> 4];
            result += hex[c & 15];
        }
    }
    return result;
}
inline std::string get(const std::string &host, const std::string &resource)
{
    icarus::connectors::HttpResponse response;
    try
    {
        response = icarus::connectors::HttpClient{}.get(
            "https://" + host + resource,
            {{"Accept", "application/vnd.github+json"},
             {"User-Agent", "ESPresso"},
             {"X-GitHub-Api-Version", "2022-11-28"},
             {"Cache-Control", "no-cache"}});
    }
    catch (const icarus::connectors::ResponseTooLarge &)
    {
        throw std::runtime_error("A library source download exceeds the 2 MB limit.");
    }
    catch (const std::exception &error)
    {
        throw std::runtime_error("Could not download the latest library release. Check your "
                                 "internet connection and try exporting again. " +
                                 std::string(error.what()));
    }
    const auto status = response.status_code;
    if (status != 200)
    {
        if (status == 404)
            throw std::runtime_error("The library release or a required source file was not found "
                                     "on GitHub. Export was cancelled.");
        if (status == 403 || status == 429)
            throw std::runtime_error(
                "GitHub refused the library request (HTTP " + std::to_string(status) +
                "). Its API rate limit may have been reached. Try again later.");
        throw std::runtime_error("Library download failed with GitHub HTTP " +
                                 std::to_string(status) + ". No project was exported.");
    }
    if (response.body.find('\0') != std::string::npos)
        throw std::runtime_error("GitHub returned a binary file instead of library source.");
    return std::move(response.body);
}
Download fetch_library(const json &library)
{
    const std::string repository = library.at("repository"), selection = library.at("version");
    const std::string repo = "/repos/" + repository;
    const auto release = json::parse(get(
        "api.github.com", repo + (selection == "latest" ? "/releases/latest"
                                                         : "/releases/tags/" + encode(selection))));
    const std::string tag = release.at("tag_name");
    if (tag.empty() || release.value("draft", true) || release.value("prerelease", true))
        throw std::runtime_error("No stable published release is available for " + repository);
    const auto commit = json::parse(get("api.github.com", repo + "/commits/" + encode(tag)));
    const std::string sha = commit.at("sha");
    if (!std::regex_match(sha, std::regex("[0-9a-f]{40}")))
        throw std::runtime_error("Invalid release commit.");
    const auto tree =
        json::parse(get("api.github.com", repo + "/git/trees/" + sha + "?recursive=1"));
    if (tree.value("truncated", false))
        throw std::runtime_error("Library release file tree is too large.");
    json local = library;
    local["source"] = "local";
    local["files"] = json::object();
    json paths = json::object();
    size_t total = 0;
    for (const auto &item : tree.at("tree"))
    {
        if (item.at("type") != "blob")
            continue;
        const std::string path = item.at("path");
        if (std::regex_search(path, std::regex("(^|/)(examples|tests|test|build|docs|.github)/")))
            continue;
        const bool root_doc = path == "README.md" || path == "LICENSE" || path == "LICENSE.md" ||
                              path == "LICENSE.txt" || path == "LICENSE.MIT";
        if (!root_doc && !espresso::library_file(path))
            continue;
        const std::string destination = path;
        if (!espresso::safe_relative(destination) || local["files"].contains(destination))
            throw std::runtime_error("Unsafe or ambiguous library source path.");
        auto source = get("raw.githubusercontent.com",
                          "/" + repository + "/" + sha + "/" + encode(path, true));
        total += source.size();
        if (total > 2 * 1024 * 1024 || paths.size() >= 300)
            throw std::runtime_error("Library exceeds 2 MB / 300 source files.");
        local["files"][destination] = source;
        paths[destination] = path;
    }
    Download result;
    result.files = espresso::library_preview(local);
    result.lock = {{"repository", "https://github.com/" + repository},
                   {"release", tag},
                   {"commit", sha},
                   {"publishedAt", release.at("published_at")},
                   {"releaseUrl", release.at("html_url")},
                   {"sourcePaths", paths}};
    result.files["components/" + library.at("name").get<std::string>() + "/SOURCE.md"] =
        "# " + library.at("name").get<std::string>() + "\n\nSource: https://github.com/" +
        repository + "\n\nRelease: " + tag + "\n\nCommit: " + sha +
        "\n\nSource files downloaded unchanged. See upstream README and license.\n";
    return result;
}

} // namespace github_release
