import { copyFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] === "release" ? "release" : "debug";
const task = mode === "release" ? "assembleRelease" : "assembleDebug";
const workspace = process.cwd();
const androidDir = join(workspace, "android");
const gradle = findGradle();
const javaHome = findJavaHome();

if (!gradle) {
  console.error(`
Gradle is not installed or not available in PATH.

To build PadLEI.apk:

1. Install Android Studio:
   https://developer.android.com/studio/install

2. Open Android Studio once and finish the setup wizard.

3. In Android Studio, open Tools > SDK Manager and install:
   - Android SDK Platform 35
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Android SDK Command-line Tools

4. Install Gradle, then restart PowerShell:
   powershell -ExecutionPolicy Bypass -File scripts\\install-gradle-windows.ps1

5. Run again:
   cd C:\\Project\\PadLEI
   npm run apk:${mode}

Expected output:
   C:\\Project\\PadLEI\\android\\app\\build\\outputs\\apk\\${mode}\\app-${mode}.apk
`);
  process.exit(1);
}

const androidSdk = findAndroidSdk();
if (!androidSdk) {
  console.error(`
Android SDK was not found.

Open Android Studio once, finish the setup wizard, then install:
   - Android SDK Platform 35
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Android SDK Command-line Tools

After that, close PowerShell, open it again, and run:
   cd C:\\Project\\PadLEI
   npm run apk:${mode}
`);
  process.exit(1);
}

writeFileSync(join(androidDir, "local.properties"), `sdk.dir=${escapeWindowsPath(androidSdk)}\n`);

console.log(`Using Gradle: ${gradle}`);
console.log(`Using Android SDK: ${androidSdk}`);
if (javaHome) console.log(`Using Java: ${javaHome}`);
const result = spawnSync(gradle, ["-p", androidDir, task], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    ...(javaHome
      ? {
          JAVA_HOME: javaHome,
          PATH: `${join(javaHome, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH || ""}`
        }
      : {})
  }
});

if (result.status === 0) {
  const outputDirectory = join(androidDir, "app", "build", "outputs", "apk", mode);
  const generatedName = mode === "release" ? "app-release-unsigned.apk" : "app-debug.apk";
  const generatedApk = join(outputDirectory, generatedName);
  const namedApk = join(outputDirectory, "PadLEI.apk");
  if (existsSync(generatedApk)) {
    copyFileSync(generatedApk, namedApk);
    console.log(`PadLEI APK: ${namedApk}`);
  }
}

process.exit(result.status ?? 1);

function findGradle() {
  const wrapper = process.platform === "win32" ? join(androidDir, "gradlew.bat") : join(androidDir, "gradlew");
  if (existsSync(wrapper)) return wrapper;

  const fromPath = findOnPath(process.platform === "win32" ? "gradle.bat" : "gradle");
  if (fromPath) return fromPath;

  const gradleHome = process.env.GRADLE_HOME;
  if (gradleHome) {
    const candidate = join(gradleHome, "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
    if (existsSync(candidate)) return candidate;
  }

  if (process.platform !== "win32") return null;

  const candidates = [
    "C:\\Gradle",
    join(process.env.ProgramFiles || "C:\\Program Files", "Gradle"),
    join(process.env.LOCALAPPDATA || "", "Programs", "Gradle")
  ];

  for (const root of candidates) {
    const gradleBat = newestGradleBat(root);
    if (gradleBat) return gradleBat;
  }

  return null;
}

function findOnPath(executable) {
  const command = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(command, [executable], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function newestGradleBat(root) {
  if (!root || !existsSync(root)) return null;

  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort()
    .reverse();

  for (const dir of dirs) {
    const candidate = join(dir, "bin", "gradle.bat");
    if (existsSync(candidate)) return candidate;
  }

  const direct = join(root, "bin", "gradle.bat");
  return existsSync(direct) ? direct : null;
}

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.platform === "win32" ? join(process.env.LOCALAPPDATA || "", "Android", "Sdk") : "",
    process.platform === "win32" ? join(process.env.USERPROFILE || "", "AppData", "Local", "Android", "Sdk") : "",
    process.platform === "darwin" ? join(process.env.HOME || "", "Library", "Android", "sdk") : "",
    process.platform === "linux" ? join(process.env.HOME || "", "Android", "Sdk") : ""
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate) && existsSync(join(candidate, "platforms"))) || null;
}

function escapeWindowsPath(path) {
  return process.platform === "win32" ? path.replaceAll("\\", "\\\\") : path;
}

function findJavaHome() {
  const executable = process.platform === "win32" ? "java.exe" : "java";
  const candidates = [
    process.platform === "win32" ? join(process.env.ProgramFiles || "C:\\Program Files", "Android", "Android Studio", "jbr") : "",
    process.platform === "darwin" ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home" : "",
    process.platform === "linux" ? "/opt/android-studio/jbr" : "",
    process.env.JAVA_HOME
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(join(candidate, "bin", executable))) || null;
}
