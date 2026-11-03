#pragma once
#include <cstdint>
#include <stdexcept>
using TickType_t = uint32_t;
using BaseType_t = int;
using UBaseType_t = unsigned;
constexpr BaseType_t pdTRUE = 1, pdFALSE = 0, pdPASS = 1;
constexpr TickType_t portMAX_DELAY = UINT32_MAX;
constexpr int tskNO_AFFINITY = 0x7FFFFFFF;
#define configNUMBER_OF_CORES 2
#define BIT0 1
#define pdMS_TO_TICKS(ms) (static_cast<TickType_t>(ms))
// Assertions intentionally disabled: queue operations must still execute.
#define configASSERT(condition) ((void)0)
