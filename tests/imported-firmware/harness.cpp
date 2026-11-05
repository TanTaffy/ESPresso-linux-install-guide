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
void check(bool condition)
{
    if (!condition) throw std::runtime_error("Imported connector execution contract failed.");
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
    check(timeout == 25);
    if (!available) return false;
    value.value = 7;
    return true;
}
bool send_messages(const espresso::data::Message &value, TickType_t timeout)
{
    calls.push_back("output");
    check(timeout == 50 && value.value == 7);
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
    check(library_probe() == 9);
    espresso::tasks::adc::loop();
    check(calls == std::vector<std::string>{"input", "original body", "output", "notification"});
    calls.clear(); available = false;
    espresso::tasks::adc::loop();
    check(calls == std::vector<std::string>{"input"});
    calls.clear(); available = true; original_value = -100;
    espresso::tasks::adc::loop();
    check(calls == std::vector<std::string>{"input", "original body"});
    calls.clear(); original_value = 0; can_send = false;
    espresso::tasks::adc::loop();
    check(calls == std::vector<std::string>{"input", "original body", "output"});
    std::cout << "Imported connectors, payloads, timeouts and early returns passed.\n";
}
