#pragma once
#include "FreeRTOS.h"
using TaskHandle_t = void *;
BaseType_t xTaskCreatePinnedToCore(void (*entry)(void *), const char *name, uint32_t stack,
                                   void *arg, UBaseType_t priority, TaskHandle_t *handle,
                                   BaseType_t core);
TickType_t xTaskGetTickCount();
void vTaskDelayUntil(TickType_t *, TickType_t);
uint32_t ulTaskNotifyTake(BaseType_t clear, TickType_t timeout);
BaseType_t xTaskNotifyGive(TaskHandle_t);
