#pragma once
#include <stdexcept>
using esp_err_t = int;
constexpr int ESP_OK = 0, ESP_ERR_NO_MEM = 1, ESP_ERR_INVALID_STATE = 2;
inline void mock_error_check(int result)
{
    if (result != ESP_OK)
        throw std::runtime_error("ESP error");
}
#define ESP_ERROR_CHECK(expr) mock_error_check(expr)
