#include "tasks/adc_task.hpp"
#include "shared/samples.hpp"
#include "shared/messages.hpp"
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace
{
std::vector<std::string> calls;
bool available = true, can_send = true;
int original_value = 0;
void check(bool condition, const std::string &reason)
{
    if (!condition)
    {
        std::string actual;
        for (const auto &call : calls) actual += call + ", ";
        throw std::runtime_error("Imported connector execution contract failed: " + reason +
                                 ". Calls: " + actual);
    }
}
}
namespace espresso::shared
{
espresso::data::Samples read_samples()
{
    calls.push_back("original body");
    return espresso::data::Samples{original_value};
}
bool receive_messages(espresso::data::Message &value, TickType_t timeout)
{
    calls.push_back("input");
    check(timeout == 25, "receive timeout " + std::to_string(timeout));
    if (!available) return false;
    value.value = 7;
    return true;
}
bool send_messages(const espresso::data::Message &value, TickType_t timeout)
{
    calls.push_back("output");
    check(timeout == 50 && value.value == 7,
          "send timeout " + std::to_string(timeout) + ", payload " + std::to_string(value.value));
    return can_send;
}
}
namespace espresso::generated
{
void notify_logger() { calls.push_back("notification"); }
}
int library_probe();
int main()
{
    check(library_probe() == 9, "library value");
    espresso::tasks::adc::loop();
#ifdef TAIL_SEND
    check(calls == std::vector<std::string>{"input", "original body", "output"}, "tail send");
#else
    check(calls == std::vector<std::string>{"input", "original body", "output", "notification"}, "followed send");
#endif
    calls.clear(); available = false;
    espresso::tasks::adc::loop();
    check(calls == std::vector<std::string>{"input"}, "empty receive");
    calls.clear(); available = true; original_value = -100;
    espresso::tasks::adc::loop();
    check(calls == std::vector<std::string>{"input", "original body"}, "early return");
    calls.clear(); original_value = 0; can_send = false;
    espresso::tasks::adc::loop();
    check(calls == std::vector<std::string>{"input", "original body", "output"}, "failed send");
    std::cout << "Imported connectors, payloads, timeouts and early returns passed.\n";
}
