#include "espresso/core.hpp"
#include <exception>
#include <iostream>

using namespace espresso;

int main()
{
    try
    {
        std::string input;
        char buffer[8192];
        while (std::cin.read(buffer, sizeof(buffer)) || std::cin.gcount())
        {
            input.append(buffer, static_cast<size_t>(std::cin.gcount()));
            require(input.size() <= 8 * 1024 * 1024, "Request exceeds the 8 MB limit.");
        }
        std::cout << json{{"ok", true}, {"result", handle(json::parse(input))}}.dump() << std::endl;
    }
    catch (const std::exception &error)
    {
        std::cout << json{{"ok", false}, {"error", error.what()}}.dump() << std::endl;
    }
    return 0;
}
