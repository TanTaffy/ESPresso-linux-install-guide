#include "espresso/core.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>

namespace espresso
{
json can_preset(const json &project, const json &position)
{
    require(position.is_object() && position.contains("x") && position["x"].is_number() &&
                position.contains("y") && position["y"].is_number(),
            "A canvas position is required for the CAN preset.");
    require(std::isfinite(position["x"].get<double>()) &&
                std::isfinite(position["y"].get<double>()),
            "The CAN preset position must be finite.");
    require(project["nodes"].size() < 200, "A project supports up to 200 nodes.");
    size_t count = 1;
    std::string symbol = "can";
    auto in_use = [&](const std::string &value)
    {
        return std::any_of(project["nodes"].begin(), project["nodes"].end(),
                           [&](const json &n) { return lower(n["symbol"]) == lower(value); });
    };
    while (in_use(symbol))
        symbol = "can_" + std::to_string(++count);
    std::string id =
        "can-preset-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());
    // Use unique IDs for the task and its editable placeholders.
    while (std::any_of(project["nodes"].begin(), project["nodes"].end(),
                       [&](const json &n) { return n["id"] == id; }))
        id += "x";
    return {
        {"id", id},
        {"kind", "task"},
        {"preset", "msm_can"},
        {"name", count == 1 ? "CAN" : "CAN " + std::to_string(count)},
        {"symbol", symbol},
        {"position", position},
        {"periodMs", 100},
        {"priority", 3},
        {"stackBytes", 5120},
        {"core", "any"},
        {"setup",
         json::array({{{"id", id + "-init"},
                       {"kind", "placeholder"},
                       {"action", "msm_can_init"},
                       {"name", "Initialise CAN"},
                       {"note", "Choose the CAN RX/TX GPIOs and enable the MSM_CAN initialisation "
                                "call below. Initialise the shared controller only once."}}})},
        {"loop", json::array({{{"id", id + "-pack"},
                               {"kind", "placeholder"},
                               {"name", "Pack CAN frame"},
                               {"note", "Choose can_frame.id and pack your values into "
                                        "can_frame.data using MSM_CAN::pack_* helpers. Message IDs "
                                        "and payload encoding are left for you to implement."}},
                              {{"id", id + "-send"},
                               {"kind", "placeholder"},
                               {"action", "msm_can_send"},
                               {"name", "Transmit frame"},
                               {"note", "After configuring CAN, choosing the message ID and "
                                        "packing the payload, enable the send call below."}}})}};
}
json example()
{
    auto placeholder = [](const char *id, const char *name, const char *note)
    { return json{{"id", id}, {"kind", "placeholder"}, {"name", name}, {"note", note}}; };
    json project = {
        {"version", 1},
        {"name", "pressure-node"},
        {"target", "esp32s3"},
        {"nodes",
         json::array(
             {{{"id", "task-adc"},
               {"kind", "task"},
               {"name", "ADC"},
               {"symbol", "adc"},
               {"position", {{"x", 40}, {"y", 60}}},
               {"periodMs", 100},
               {"priority", 2},
               {"stackBytes", 4096},
               {"core", "any"},
               {"setup",
                json::array({placeholder("adc-spi", "Initialise SPI",
                                         "Configure the SPI bus and GPIO pins."),
                             placeholder("adc-config", "Configure ADC",
                                         "Initialise ADC A and select the pressure channel.")})},
               {"loop",
                json::array(
                    {placeholder("adc-read", "Read pressure channel",
                                 "Read the ADC count into pressure.raw_count."),
                     placeholder(
                         "adc-convert", "Convert counts to pressure",
                         "Apply sensor calibration. Set pressure.pressure_bar and pressure.valid."),
                     {{"id", "adc-publish"},
                      {"kind", "write"},
                      {"name", "Publish pressure"},
                      {"note", ""},
                      {"structId", "struct-pressure"},
                      {"localName", "pressure"}}})}},
              {{"id", "struct-pressure"},
               {"kind", "struct"},
               {"name", "Pressure"},
               {"symbol", "pressure"},
               {"typeName", "PressureData"},
               {"position", {{"x", 400}, {"y", 180}}},
               {"fields", json::array({{{"id", "field-raw"},
                                        {"name", "raw_count"},
                                        {"type", "uint16_t"},
                                        {"initialValue", "0"}},
                                       {{"id", "field-bar"},
                                        {"name", "pressure_bar"},
                                        {"type", "float"},
                                        {"initialValue", "0.0f"}},
                                       {{"id", "field-valid"},
                                        {"name", "valid"},
                                        {"type", "bool"},
                                        {"initialValue", "false"}}})}},
              {{"id", "task-can"},
               {"kind", "task"},
               {"name", "CAN"},
               {"symbol", "can"},
               {"position", {{"x", 740}, {"y", 60}}},
               {"periodMs", 100},
               {"priority", 3},
               {"stackBytes", 4096},
               {"core", "any"},
               {"setup", json::array({placeholder(
                             "can-init", "Initialise CAN",
                             "Initialise the CAN interface and configure the bitrate.")})},
               {"loop",
                json::array({{{"id", "can-read"},
                              {"kind", "read"},
                              {"name", "Read pressure"},
                              {"note", ""},
                              {"structId", "struct-pressure"},
                              {"localName", "pressure"}},
                             placeholder("can-pack", "Pack CAN frame",
                                         "Encode the pressure snapshot into a CAN frame."),
                             placeholder("can-send", "Transmit frame",
                                         "Send the completed frame using your CAN driver.")})}}})}};
    auto &can = project["nodes"][2];
    can["preset"] = "msm_can";
    can["setup"][0]["action"] = "msm_can_init";
    can["setup"][0]["note"] =
        "Choose the CAN RX/TX GPIOs and enable the MSM_CAN initialisation call below.";
    can["loop"][1]["note"] = "Choose can_frame.id and pack the pressure snapshot into "
                             "can_frame.data using MSM_CAN::pack_* helpers.";
    can["loop"][2]["action"] = "msm_can_send";
    can["loop"][2]["note"] = "After configuring CAN, choosing the message ID and packing the "
                             "payload, enable the send call below.";
    return project;
}
} // namespace espresso
