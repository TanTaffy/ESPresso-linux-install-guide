#include <icarus/http_client.hpp>
#include <nlohmann/json.hpp>
#include <iostream>

int main()
{
    using nlohmann::json;
    try
    {
        json request;
        std::cin >> request;
        icarus::connectors::HttpOptions options;
        options.timeout_ms = request.value("timeoutMs", options.timeout_ms);
        options.max_body_bytes = request.value("maxBodyBytes", options.max_body_bytes);
        const auto response = icarus::connectors::HttpClient{}.get(
            request.at("url"),
            request.value("headers", std::map<std::string, std::string>{}), options);
        std::cout << json{{"status", response.status_code}, {"body", response.body}}.dump();
    }
    catch (const std::exception &error)
    {
        std::cout << json{{"error", error.what()}}.dump();
    }
}
