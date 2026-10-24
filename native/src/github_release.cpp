#define NOMINMAX
#include "espresso/github_release.hpp"
#include "espresso/core.hpp"
#include <regex>
#include <stdexcept>
#include <windows.h>
#include <winhttp.h>

namespace github_release
{
class InternetHandle
{
    HINTERNET value_;

  public:
    explicit InternetHandle(HINTERNET value) : value_(value)
    {
        if (!value_)
            throw std::runtime_error("Could not open the HTTPS connection for library.");
    }
    ~InternetHandle() { WinHttpCloseHandle(value_); }
    operator HINTERNET() const { return value_; }
    InternetHandle(const InternetHandle &) = delete;
    InternetHandle &operator=(const InternetHandle &) = delete;
};
inline std::wstring wide(const std::string &text)
{
    const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(),
                                         static_cast<int>(text.size()), nullptr, 0);
    if (!size)
        throw std::runtime_error("Invalid UTF-8 in the library release reference.");
    std::wstring result(size, L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()),
                        result.data(), size);
    return result;
}
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
inline std::string get(const wchar_t *host, const std::string &resource)
{
    InternetHandle session(WinHttpOpen(L"ESPresso/0.2.0", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                       WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
    WinHttpSetTimeouts(session, 8000, 8000, 8000, 15000);
    InternetHandle connection(WinHttpConnect(session, host, INTERNET_DEFAULT_HTTPS_PORT, 0));
    const auto uri = wide(resource);
    InternetHandle request(WinHttpOpenRequest(connection, L"GET", uri.c_str(), nullptr,
                                              WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                              WINHTTP_FLAG_SECURE));
    const wchar_t headers[] = L"Accept: application/vnd.github+json\r\nX-GitHub-Api-Version: "
                              L"2022-11-28\r\nCache-Control: no-cache\r\n";
    if (!WinHttpSendRequest(request, headers, static_cast<DWORD>(-1), WINHTTP_NO_REQUEST_DATA, 0, 0,
                            0) ||
        !WinHttpReceiveResponse(request, nullptr))
        throw std::runtime_error("Could not download the latest library release. Check your "
                                 "internet connection and try exporting again.");
    DWORD status = 0, size = sizeof(status);
    if (!WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                             WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX))
        throw std::runtime_error("Could not read the library release download response.");
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
    std::string body;
    for (;;)
    {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request, &available))
            throw std::runtime_error("Library download was interrupted.");
        if (!available)
            break;
        if (body.size() + available > 2 * 1024 * 1024)
            throw std::runtime_error("A library source download exceeds the 2 MB limit.");
        const size_t start = body.size();
        body.resize(start + available);
        DWORD received = 0;
        if (!WinHttpReadData(request, body.data() + start, available, &received))
            throw std::runtime_error("Library download was interrupted.");
        body.resize(start + received);
        if (!received)
            break;
    }
    if (body.find('\0') != std::string::npos)
        throw std::runtime_error("GitHub returned a binary file instead of library source.");
    return body;
}
Download fetch_library(const json &library)
{
    const std::string repository = library.at("repository"), selection = library.at("version");
    const std::string repo = "/repos/" + repository;
    const auto release = json::parse(get(
        L"api.github.com", repo + (selection == "latest" ? "/releases/latest"
                                                         : "/releases/tags/" + encode(selection))));
    const std::string tag = release.at("tag_name");
    if (tag.empty() || release.value("draft", true) || release.value("prerelease", true))
        throw std::runtime_error("No stable published release is available for " + repository);
    const auto commit = json::parse(get(L"api.github.com", repo + "/commits/" + encode(tag)));
    const std::string sha = commit.at("sha");
    if (!std::regex_match(sha, std::regex("[0-9a-f]{40}")))
        throw std::runtime_error("Invalid release commit.");
    const auto tree =
        json::parse(get(L"api.github.com", repo + "/git/trees/" + sha + "?recursive=1"));
    if (tree.value("truncated", false))
        throw std::runtime_error("Library release file tree is too large.");
    json local = library;
    local["source"] = "local";
    local["files"] = json::object();
    json paths = json::object();
    size_t total = 0;
    const bool can = library.value("id", "") == "msm-can";
    for (const auto &item : tree.at("tree"))
    {
        if (item.at("type") != "blob")
            continue;
        const std::string path = item.at("path"),
                          base = espresso::fs::path(path).filename().string();
        if (std::regex_search(path, std::regex("(^|/)(examples|tests|test|build|docs|.github)/")))
            continue;
        const bool root_doc = path == "README.md" || path == "LICENSE" || path == "LICENSE.md" ||
                              path == "LICENSE.txt" || path == "LICENSE.MIT";
        if (!root_doc &&
            !std::regex_match(path, std::regex(".*\\.(h|hh|hpp|hxx|tpp|inl|c|cc|cpp|cxx|S)")))
            continue;
        if (can && !root_doc && base != "MSM_CAN.hpp" && base != "MSM_CAN.cpp")
            continue;
        const std::string destination = can ? base : path;
        if (!espresso::safe_relative(destination) || local["files"].contains(destination))
            throw std::runtime_error("Unsafe or ambiguous library source path.");
        auto source = get(L"raw.githubusercontent.com",
                          "/" + repository + "/" + sha + "/" + encode(path, true));
        total += source.size();
        if (total > 2 * 1024 * 1024 || paths.size() >= 300)
            throw std::runtime_error("Library exceeds 2 MB / 300 source files.");
        local["files"][destination] = source;
        paths[destination] = path;
    }
    if (can && (!paths.contains("MSM_CAN.hpp") || !paths.contains("MSM_CAN.cpp")))
        throw std::runtime_error("MSM_CAN release is missing its source files.");
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
