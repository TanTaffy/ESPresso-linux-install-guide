#pragma once
#include "FreeRTOS.h"
using QueueHandle_t = void *;
QueueHandle_t xQueueCreate(UBaseType_t capacity, UBaseType_t size);
BaseType_t xQueueSend(QueueHandle_t, const void *, TickType_t);
BaseType_t xQueueReceive(QueueHandle_t, void *, TickType_t);

BaseType_t xQueueOverwrite(QueueHandle_t, const void *);
