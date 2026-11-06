#include "http_client.hpp"
#include <curl/curl.h>
#include <exception>
#include <limits>
#include <memory>

namespace
{
void check(CURLcode code)
{
    if (code != CURLE_OK)
        throw std::runtime_error(curl_easy_strerror(code));
}

class CurlRuntime
{
  public:
    CurlRuntime() { check(curl_global_init(CURL_GLOBAL_DEFAULT)); }
    ~CurlRuntime() { curl_global_cleanup(); }
};

struct Body
{
    std::string text;
    std::size_t limit;
    bool too_large = false;
    std::exception_ptr error;
};

// Exceptions must never escape through libcurl's C callback.
std::size_t write_body(char *data, std::size_t size, std::size_t count, void *user) noexcept
{
    auto &body = *static_cast<Body *>(user);
    if ((size && count > (std::numeric_limits<std::size_t>::max)() / size) ||
        size * count > body.limit - body.text.size())
    {
        body.too_large = true;
        return 0;
    }
    const auto bytes = size * count;
    try
    {
        body.text.append(data, bytes);
        return bytes;
    }
    catch (...)
    {
        body.error = std::current_exception();
        return 0;
    }
}
} // namespace

namespace icarus::connectors
{
HttpResponse HttpClient::get(const std::string &url,
                            const std::map<std::string, std::string> &headers,
                            const HttpOptions &options) const
{
    if (options.connect_timeout_ms <= 0 || options.timeout_ms <= 0)
        throw std::invalid_argument("HTTP timeouts must be positive.");
    static const CurlRuntime runtime;
    std::unique_ptr<CURL, decltype(&curl_easy_cleanup)> curl(curl_easy_init(), &curl_easy_cleanup);
    if (!curl)
        throw std::runtime_error("Could not create a libcurl handle.");

    std::unique_ptr<curl_slist, decltype(&curl_slist_free_all)> list(nullptr, &curl_slist_free_all);
    for (const auto &[key, value] : headers)
    {
        const auto header = key + ": " + value;
        auto *next = curl_slist_append(list.get(), header.c_str());
        if (!next)
            throw std::bad_alloc();
        list.release();
        list.reset(next);
    }

    Body body{{}, options.max_body_bytes, false, {}};
    check(curl_easy_setopt(curl.get(), CURLOPT_URL, url.c_str()));
    check(curl_easy_setopt(curl.get(), CURLOPT_HTTPHEADER, list.get()));
    check(curl_easy_setopt(curl.get(), CURLOPT_WRITEFUNCTION, write_body));
    check(curl_easy_setopt(curl.get(), CURLOPT_WRITEDATA, &body));
    check(curl_easy_setopt(curl.get(), CURLOPT_CONNECTTIMEOUT_MS, options.connect_timeout_ms));
    check(curl_easy_setopt(curl.get(), CURLOPT_TIMEOUT_MS, options.timeout_ms));
    check(curl_easy_setopt(curl.get(), CURLOPT_NOSIGNAL, 1L));
    check(curl_easy_setopt(curl.get(), CURLOPT_PROTOCOLS_STR, "http,https"));
    check(curl_easy_setopt(curl.get(), CURLOPT_FOLLOWLOCATION, 1L));
    check(curl_easy_setopt(curl.get(), CURLOPT_MAXREDIRS, 5L));
    // GitHub URLs start with HTTPS. Never follow a redirect to plaintext or local files.
    check(curl_easy_setopt(curl.get(), CURLOPT_REDIR_PROTOCOLS_STR, "https"));
    check(curl_easy_setopt(curl.get(), CURLOPT_SSL_VERIFYPEER, 1L));
    check(curl_easy_setopt(curl.get(), CURLOPT_SSL_VERIFYHOST, 2L));

    const auto result = curl_easy_perform(curl.get());
    if (body.too_large)
        throw ResponseTooLarge();
    if (body.error)
        std::rethrow_exception(body.error);
    check(result);
    long status = 0;
    check(curl_easy_getinfo(curl.get(), CURLINFO_RESPONSE_CODE, &status));
    return {status, std::move(body.text)};
}
} // namespace icarus::connectors
