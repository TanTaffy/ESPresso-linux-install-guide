#define NOMINMAX
#include "espresso/msm_release.hpp"
#include <regex>
#include <stdexcept>
#include <windows.h>
#include <winhttp.h>

namespace msm_release
{
class InternetHandle
{
    HINTERNET value_;

  public:
    explicit InternetHandle(HINTERNET value) : value_(value)
    {
        if (!value_)
            throw std::runtime_error("Could not open the HTTPS connection for MSM_CAN.");
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
        throw std::runtime_error("Invalid UTF-8 in the MSM_CAN release reference.");
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
    InternetHandle session(WinHttpOpen(L"ESPresso/0.1.4", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
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
        throw std::runtime_error("Could not download the latest MSM_CAN release. Check your "
                                 "internet connection and try exporting again.");
    DWORD status = 0, size = sizeof(status);
    if (!WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                             WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX))
        throw std::runtime_error("Could not read the MSM_CAN release download response.");
    if (status != 200)
    {
        if (status == 404)
            throw std::runtime_error("The MSM_CAN release or a required source file was not found "
                                     "on GitHub. Export was cancelled.");
        if (status == 403 || status == 429)
            throw std::runtime_error(
                "GitHub refused the MSM_CAN request (HTTP " + std::to_string(status) +
                "). Its API rate limit may have been reached. Try again later.");
        throw std::runtime_error("MSM_CAN download failed with GitHub HTTP " +
                                 std::to_string(status) + ". No project was exported.");
    }
    std::string body;
    for (;;)
    {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request, &available))
            throw std::runtime_error("MSM_CAN download was interrupted.");
        if (!available)
            break;
        if (body.size() + available > 2 * 1024 * 1024)
            throw std::runtime_error("An MSM_CAN source download exceeds the 2 MB limit.");
        const size_t start = body.size();
        body.resize(start + available);
        DWORD received = 0;
        if (!WinHttpReadData(request, body.data() + start, available, &received))
            throw std::runtime_error("MSM_CAN download was interrupted.");
        body.resize(start + received);
        if (!received)
            break;
    }
    if (body.find('\0') != std::string::npos)
        throw std::runtime_error("GitHub returned a binary file instead of MSM_CAN source.");
    return body;
}
Download latest()
{
    const std::string repo = "/repos/ManchesterStingerMotorsports/MSM_CAN";
    const auto release = json::parse(get(L"api.github.com", repo + "/releases/latest"));
    const std::string tag = release.at("tag_name");
    if (tag.empty() || release.value("draft", true) || release.value("prerelease", true))
        throw std::runtime_error("No stable published MSM_CAN release is available.");
    const auto commit = json::parse(get(L"api.github.com", repo + "/commits/" + encode(tag)));
    const std::string sha = commit.at("sha");
    if (!std::regex_match(sha, std::regex("[0-9a-f]{40}")))
        throw std::runtime_error("GitHub returned an invalid MSM_CAN commit reference.");
    const auto tree =
        json::parse(get(L"api.github.com", repo + "/git/trees/" + sha + "?recursive=1"));
    if (tree.value("truncated", false))
        throw std::runtime_error("The MSM_CAN release file list is too large to resolve safely.");
    std::map<std::string, std::string> paths;
    for (const auto &item : tree.at("tree"))
    {
        if (item.at("type") != "blob")
            continue;
        const std::string path = item.at("path"),
                          base = path.substr(path.find_last_of('/') == std::string::npos
                                                 ? 0
                                                 : path.find_last_of('/') + 1);
        if (base == "MSM_CAN.hpp" || base == "MSM_CAN.cpp")
        {
            if (paths.count(base))
                throw std::runtime_error("The latest MSM_CAN release contains ambiguous source "
                                         "files. Export was cancelled.");
            paths[base] = path;
        }
        if (path == "README.md" || path == "LICENSE" || path == "LICENSE.md" ||
            path == "LICENSE.txt" || path == "LICENSE.MIT")
            paths[path] = path;
    }
    if (!paths.count("MSM_CAN.hpp") || !paths.count("MSM_CAN.cpp"))
        throw std::runtime_error(
            "The latest MSM_CAN release is missing MSM_CAN.hpp or MSM_CAN.cpp.");
    Download result;
    for (const auto &[name, path] : paths)
        result.files["components/MSM_CAN/" + name] =
            get(L"raw.githubusercontent.com",
                "/ManchesterStingerMotorsports/MSM_CAN/" + sha + "/" + encode(path, true));
    result.lock = {{"repository", "https://github.com/ManchesterStingerMotorsports/MSM_CAN"},
                   {"release", tag},
                   {"commit", sha},
                   {"publishedAt", release.at("published_at")},
                   {"releaseUrl", release.at("html_url")},
                   {"sourcePaths", paths}};
    result.files["components/MSM_CAN/SOURCE.md"] =
        "# MSM_CAN\n\nDesigned by James Platt for Manchester Stinger Motorsports.\n\nDownloaded "
        "unchanged from the latest stable published GitHub release at export time.\n\nRelease: " +
        tag + "\n\nCommit: " + sha +
        "\n\nSource: https://github.com/ManchesterStingerMotorsports/MSM_CAN\n\nSee "
        "msm_can.lock.json at the project root for the resolved version and source paths.\n";
    return result;
}
} // namespace msm_release
