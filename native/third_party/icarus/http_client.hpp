#pragma once

// Adapted from Trovix/icarus. See README.md and LICENSE in this directory.
#include <cstddef>
#include <map>
#include <stdexcept>
#include <string>

namespace icarus::connectors
{
struct HttpResponse
{
    long status_code;
    std::string body;
};

struct HttpOptions
{
    long connect_timeout_ms = 8000;
    long timeout_ms = 23000;
    std::size_t max_body_bytes = 2 * 1024 * 1024;
};

class ResponseTooLarge : public std::runtime_error
{
  public:
    ResponseTooLarge() : std::runtime_error("HTTP response exceeds the download size limit.") {}
};

class HttpClient
{
  public:
    HttpResponse get(const std::string &url,
                     const std::map<std::string, std::string> &headers = {},
                     const HttpOptions &options = {}) const;
};
} // namespace icarus::connectors
