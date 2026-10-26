#pragma once
#include "FreeRTOS.h"
using EventGroupHandle_t = void *;
EventGroupHandle_t xEventGroupCreate();
uint32_t xEventGroupWaitBits(EventGroupHandle_t, uint32_t, BaseType_t, BaseType_t, TickType_t);
uint32_t xEventGroupSetBits(EventGroupHandle_t, uint32_t);
