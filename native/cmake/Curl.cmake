# Keep the portable Windows executable self-contained. macOS/Linux use their
# installed libcurl development package and its TLS/certificate configuration.
if(NOT WIN32)
  find_package(CURL 7.85 REQUIRED)
  return()
endif()

function(espresso_curl)
  if(POLICY CMP0135)
    cmake_policy(SET CMP0135 NEW)
  endif()
  include(FetchContent)
  set(BUILD_SHARED_LIBS OFF)
  set(BUILD_STATIC_LIBS ON)
  set(BUILD_CURL_EXE OFF)
  set(BUILD_TESTING OFF)
  set(BUILD_LIBCURL_DOCS OFF)
  set(BUILD_MISC_DOCS OFF)
  set(ENABLE_CURL_MANUAL OFF)
  set(CURL_DISABLE_INSTALL ON)
  set(CURL_ENABLE_EXPORT_TARGET OFF)
  set(CURL_STATIC_CRT ON)
  set(CURL_USE_SCHANNEL ON)
  set(CURL_USE_OPENSSL OFF)
  # curl's tri-state dependency settings are cache strings, not boolean options.
  set(CURL_ZLIB OFF CACHE STRING "Build curl without zlib" FORCE)
  set(CURL_BROTLI OFF CACHE STRING "Build curl without brotli" FORCE)
  set(CURL_ZSTD OFF CACHE STRING "Build curl without zstd" FORCE)
  set(CURL_USE_LIBPSL OFF)
  set(CURL_USE_LIBSSH2 OFF)
  set(USE_NGHTTP2 OFF)
  set(USE_LIBIDN2 OFF)
  foreach(protocol DICT FILE FTP GOPHER IMAP IPFS LDAP LDAPS MQTT POP3 RTSP SMTP TELNET TFTP WEBSOCKETS)
    set(CURL_DISABLE_${protocol} ON)
  endforeach()
  FetchContent_Declare(curl
    URL https://curl.se/download/curl-8.23.0.tar.xz
    URL_HASH SHA256=8dadd7d2536a314f982ad05a651b713f426bf7d02cc2c76cffb9796f2218e6c5
  )
  FetchContent_MakeAvailable(curl)
endfunction()

espresso_curl()
