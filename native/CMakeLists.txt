cmake_minimum_required(VERSION 3.20)
project(espresso_core LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "The desktop backend currently targets Windows (WinHTTP).")
endif()

add_library(espresso_core STATIC
  src/validation.cpp
  src/generator.cpp
  src/presets.cpp
  src/storage.cpp
  src/protocol.cpp
  src/msm_release.cpp
)
target_compile_features(espresso_core PUBLIC cxx_std_17)
target_include_directories(espresso_core PUBLIC include third_party)
target_link_libraries(espresso_core PRIVATE winhttp)

add_executable(espresso-core main.cpp)
target_link_libraries(espresso-core PRIVATE espresso_core)

foreach(target espresso_core espresso-core)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /utf-8 /EHsc)
    set_property(TARGET ${target} PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endforeach()
