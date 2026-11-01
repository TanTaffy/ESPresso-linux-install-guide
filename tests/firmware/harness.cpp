// A host contract test of exported C++; this is not a FreeRTOS scheduler simulation.
#include "esp_err.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "probe.hpp"
#include "shared/latest.hpp"
#include "shared/messages.hpp"
#include "tasks/consumer_task.hpp"
#include "tasks/notification_parameters.hpp"
#include "tasks/notification_task.hpp"
#include "tasks/producer_task.hpp"
#include <cstring>
#include <deque>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>

#define CHECK(condition)                                                                           \
    do                                                                                             \
    {                                                                                              \
        if (!(condition))                                                                          \
            throw std::runtime_error(#condition);                                                  \
    } while (0)
struct Stop
{
};
struct MockTask
{
    void (*entry)(void *);
    uint32_t pending = 0;
};
std::map<std::string, std::unique_ptr<MockTask>> tasks;
MockTask *current = nullptr;
bool released = false, stop_on_empty = false;
struct MockQueue
{
    unsigned capacity, size;
    std::deque<std::vector<char>> items;
};
std::vector<std::unique_ptr<MockQueue>> queues;
bool capacity_from_config = false, timeout_from_config = false;
BaseType_t xTaskCreatePinnedToCore(void (*entry)(void *), const char *name, uint32_t stack, void *,
                                   UBaseType_t priority, TaskHandle_t *handle, BaseType_t core)
{
    CHECK(!released);
    if (std::string(name) == "Producer")
        CHECK(stack == 8192 && priority == 5 && core == 0);
    auto task = std::make_unique<MockTask>();
    task->entry = entry;
    *handle = task.get();
    tasks[name] = std::move(task);
    return pdPASS;
}
TickType_t xTaskGetTickCount() { return 0; }
bool producer_period_checked = false;
void vTaskDelayUntil(TickType_t *, TickType_t period)
{
    CHECK(period == 25);
    producer_period_checked = true;
    throw Stop{};
}
uint32_t ulTaskNotifyTake(BaseType_t clear, TickType_t timeout)
{
    CHECK(clear == pdFALSE && timeout == portMAX_DELAY);
    if (!current->pending)
        throw Stop{};
    return current->pending--;
}
BaseType_t xTaskNotifyGive(TaskHandle_t target)
{
    CHECK(released && target != nullptr);
    ++static_cast<MockTask *>(target)->pending;
    return pdPASS;
}
EventGroupHandle_t xEventGroupCreate() { return &released; }
uint32_t xEventGroupWaitBits(EventGroupHandle_t, uint32_t, BaseType_t clear, BaseType_t, TickType_t)
{
    CHECK(released && clear == pdFALSE);
    return BIT0;
}
uint32_t xEventGroupSetBits(EventGroupHandle_t, uint32_t)
{
    CHECK(tasks.size() == 4);
    released = true;
    return BIT0;
}
QueueHandle_t xQueueCreate(UBaseType_t capacity, UBaseType_t size)
{
    if (size == 1)
    {
        CHECK(capacity == 7);
        capacity_from_config = true;
    }
    auto q = std::make_unique<MockQueue>();
    q->capacity = capacity;
    q->size = size;
    const auto handle = q.get();
    queues.push_back(std::move(q));
    return handle;
}
BaseType_t xQueueSend(QueueHandle_t handle, const void *value, TickType_t timeout)
{
    auto &q = *static_cast<MockQueue *>(handle);
    if (q.size == sizeof(int32_t) && !timeout_from_config)
    {
        CHECK(timeout == 50);
        timeout_from_config = true;
    }
    if (q.items.size() == q.capacity)
        return pdFALSE;
    const auto bytes = static_cast<const char *>(value);
    q.items.emplace_back(bytes, bytes + q.size);
    return pdTRUE;
}
TickType_t last_receive_timeout = 0;
BaseType_t xQueueReceive(QueueHandle_t handle, void *value, TickType_t timeout)
{
    last_receive_timeout = timeout;
    auto &q = *static_cast<MockQueue *>(handle);
    if (q.items.empty())
    {
        if (stop_on_empty)
            throw Stop{};
        return pdFALSE;
    }
    std::memcpy(value, q.items.front().data(), q.size);
    q.items.pop_front();
    return pdTRUE;
}
BaseType_t xQueueOverwrite(QueueHandle_t handle, const void *value)
{
    auto &q = *static_cast<MockQueue *>(handle);
    CHECK(q.capacity == 1);
    q.items.clear();
    return xQueueSend(handle, value, 0);
}
bool wake_token = false;
std::function<void()> wake_injection;
SemaphoreHandle_t xSemaphoreCreateBinary() { return &wake_token; }
BaseType_t xSemaphoreGive(SemaphoreHandle_t handle)
{
    *static_cast<bool *>(handle) = true;
    return pdTRUE;
}
BaseType_t xSemaphoreTake(SemaphoreHandle_t handle, TickType_t timeout)
{
    CHECK(timeout == portMAX_DELAY);
    auto &token = *static_cast<bool *>(handle);
    if (!token && wake_injection)
    {
        auto inject = std::move(wake_injection);
        wake_injection = {};
        inject();
    }
    if (!token)
        throw Stop{};
    token = false;
    return pdTRUE;
}
extern "C" void app_main();
void run(const std::string &name)
{
    current = tasks.at(name).get();
    try
    {
        current->entry(nullptr);
    }
    catch (const Stop &)
    {
    }
}
int main()
{
    app_main();
    espresso::tasks::producer::loop();
    espresso::tasks::producer::loop(); // Full queue skips remaining steps, including notify.
    CHECK(probe::sent == 1);
    CHECK(tasks.at("Notification")->pending == 1);
    stop_on_empty = true;
    run("Consumer");
    CHECK(probe::received == 41);
    run("Notification");
    CHECK(probe::notifications == 1 && current->pending == 0);
    stop_on_empty = false;
    espresso::data::Message packet{};
    CHECK(!espresso::shared::receive_messages(packet, 0));
    packet.value = 10;
    CHECK(espresso::shared::send_messages(packet, 0));
    packet.value = 20;
    CHECK(!espresso::shared::send_messages(packet, 0));
    CHECK(espresso::shared::receive_messages(packet, 0) && packet.value == 10);
    CHECK(!espresso::shared::receive_messages(packet, 0));
    espresso::data::Latest latest{};
    CHECK(latest.raw[0] == 0 && latest.sample.raw[0] == 0);
    CHECK(latest.state == espresso::types::State::Ready);
    latest.sample.raw[0] = 50;
    CHECK(espresso::shared::send_latest(latest, portMAX_DELAY));
    latest.sample.raw[0] = 900;
    CHECK(espresso::shared::send_latest(latest, 0)); // Overwrite an unread value.
    packet.value = 10;
    CHECK(espresso::shared::send_messages(packet, 0));
    run("Multi");
    CHECK((probe::events == std::vector<int>{10, 900, 11, 12}));
    CHECK(!espresso::shared::receive_latest(latest, 0)); // Receive consumed the mailbox.
    CHECK(!espresso::shared::receive_messages(packet, 0));
    wake_injection = [&]
    {
        latest.sample.raw[0] = 1000;
        CHECK(espresso::shared::send_latest(latest, 0));
    };
    run("Multi"); // Send at the boundary between scanning inputs and waiting.
    CHECK(probe::events.back() == 1000 && probe::events.size() == 5);
    // No-argument receive helpers read per-step configuration and never invent a sample.
    CHECK(!espresso::tasks::notification::receive_messages());
    CHECK(last_receive_timeout == 25);
    CHECK(!espresso::tasks::notification::receive_messages_2());
    CHECK(last_receive_timeout == portMAX_DELAY);
    packet.value = 77;
    CHECK(espresso::shared::send_messages(packet, 0));
    const auto received = espresso::tasks::notification::receive_messages();
    CHECK(received && received->value == 77);
    CHECK(!espresso::tasks::notification::receive_messages());
    probe::received = -99;
    espresso::tasks::notification::loop(); // Empty queue skips the following placeholders.
    CHECK(probe::received == -99);
    packet.value = 13;
    CHECK(espresso::shared::send_messages(packet, 0));
    espresso::tasks::notification::loop();
    CHECK(probe::received == 13); // The second receive keeps its local default and continues.
    run("Producer");
    CHECK(producer_period_checked && capacity_from_config && timeout_from_config);
    std::cout << "Generated C++: full queues, event payloads, startup handles and counting "
                 "notifications passed.\n";
}
