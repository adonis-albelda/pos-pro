/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- Expo config plugins run as plain CommonJS under Node during prebuild, not through Metro/TS. */
const { withGradleProperties } = require("@expo/config-plugins");

/**
 * A release build's lintVitalAnalyzeRelease pass (react-native-safe-area-context,
 * async-storage, masked-view) blows through Gradle's default 512 MiB Metaspace —
 * `expo prebuild` writes a fresh android/gradle.properties every time, so a
 * hand-edit there doesn't survive the next `--clean`. This runs as part of
 * prebuild itself instead, same as any other Expo config plugin.
 */
const JVM_ARGS = "-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError";

module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const existing = props.find(
      (item) => item.type === "property" && item.key === "org.gradle.jvmargs",
    );

    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      props.push({ type: "property", key: "org.gradle.jvmargs", value: JVM_ARGS });
    }

    return config;
  });
};
