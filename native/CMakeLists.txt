cmake_minimum_required(VERSION 3.20)
project(espresso_core LANGUAGES CXX)

include(cmake/BuildSettings.cmake)
include(cmake/Curl.cmake)

add_library(icarus_http STATIC third_party/icarus/http_client.cpp)
target_compile_features(icarus_http PUBLIC cxx_std_17)
target_include_directories(icarus_http PUBLIC third_party)
target_link_libraries(icarus_http PRIVATE CURL::libcurl)

add_library(espresso_core STATIC
  src/validation.cpp
  src/generator.cpp
  src/storage.cpp
  src/protocol.cpp
  src/github_release.cpp
  src/imported.cpp
  src/connections.cpp
  src/project.cpp
  src/libraries.cpp
  src/features.cpp
  src/templates.cpp
  src/catalog.cpp
  src/runtime_settings.cpp
  src/config_file.cpp
  src/preserved.cpp
  src/data_types.cpp
)
target_compile_features(espresso_core PUBLIC cxx_std_17)
target_include_directories(espresso_core PUBLIC include third_party)
target_link_libraries(espresso_core PRIVATE icarus_http)

add_executable(espresso-core main.cpp)
target_link_libraries(espresso-core PRIVATE espresso_core)

include(CTest)
set(espresso_targets espresso_core espresso-core icarus_http)
if(BUILD_TESTING)
  add_executable(espresso-http-check ../tests/http_client_harness.cpp)
  target_include_directories(espresso-http-check PRIVATE third_party)
  target_link_libraries(espresso-http-check PRIVATE icarus_http)
  list(APPEND espresso_targets espresso-http-check)
endif()

foreach(target ${espresso_targets})
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /utf-8 /EHsc)
    set_property(TARGET ${target} PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endforeach()
