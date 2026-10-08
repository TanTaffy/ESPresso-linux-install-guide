#include "espresso/core.hpp"
#include <chrono>
#include <fstream>
#include <iterator>
#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#endif

namespace espresso
{
fs::path input_path(const json &request)
{
    require(has_string(request, "path", 32000) && !request["path"].get<std::string>().empty(),
            "A file path is required.");
    return fs::u8path(request["path"].get<std::string>());
}
std::string read_file(const fs::path &path)
{
    require(fs::is_regular_file(path), "Project file does not exist.");
    require(fs::file_size(path) <= 8 * 1024 * 1024, "Project exceeds the 8 MB file limit.");
    std::ifstream stream(path, std::ios::binary);
    require(bool(stream), "Cannot read project file.");
    return {std::istreambuf_iterator<char>(stream), {}};
}
void write_file(const fs::path &path, const std::string &text)
{
    std::ofstream stream(path, std::ios::binary | std::ios::trunc);
    require(bool(stream), "Cannot write " + path.u8string());
    stream.write(text.data(), static_cast<std::streamsize>(text.size()));
    stream.close();
    require(bool(stream), "Failed to finish writing " + path.u8string());
}
void atomic_save(const fs::path &path, const std::string &text)
{
    const auto temporary =
        fs::path(path.wstring() + L".tmp-" +
                 std::to_wstring(std::chrono::steady_clock::now().time_since_epoch().count()));
    try
    {
        write_file(temporary, text);
#ifdef _WIN32
        require(MoveFileExW(temporary.c_str(), path.c_str(),
                            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0,
                "Could not replace the project file. Check file permissions.");
#else
        fs::rename(temporary, path);
#endif
    }
    catch (...)
    {
        std::error_code ec;
        fs::remove(temporary, ec);
        throw;
    }
}
} // namespace espresso
