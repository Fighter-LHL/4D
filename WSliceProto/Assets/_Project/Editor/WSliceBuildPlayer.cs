using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace WSlice.Editor
{
    public static class WSliceBuildPlayer
    {
        public const string DefaultMacOutput = "builds/macos/W-Slice.app";

        [MenuItem("WSlice/Build/macOS Standalone")]
        public static void BuildMacOSMenu()
        {
            BuildMacOS();
        }

        public static void BuildMacOS()
        {
            string outputPath = ResolveOutputPath();
            string outputDirectory = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(outputDirectory) && !Directory.Exists(outputDirectory))
                Directory.CreateDirectory(outputDirectory);

            PlayerSettings.productName = "W-Slice Demo";
            PlayerSettings.bundleVersion = "0.2.0";

            string[] scenes = EditorBuildSettings.scenes
                .Where(scene => scene.enabled)
                .Select(scene => scene.path)
                .ToArray();

            if (scenes.Length == 0)
            {
                Debug.LogError("No enabled scenes in Build Settings.");
                EditorApplication.Exit(1);
                return;
            }

            var report = BuildPipeline.BuildPlayer(
                scenes,
                outputPath,
                BuildTarget.StandaloneOSX,
                BuildOptions.None);

            LogBuildSummary(report);

            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError($"macOS build failed: {report.summary.result}");
                EditorApplication.Exit(1);
                return;
            }

            Debug.Log($"macOS build succeeded: {outputPath}");
        }

        private static string ResolveOutputPath()
        {
            string env = System.Environment.GetEnvironmentVariable("WSLICE_BUILD_OUTPUT");
            if (!string.IsNullOrWhiteSpace(env))
                return env;

            string projectRoot = Path.GetDirectoryName(Application.dataPath) ?? string.Empty;
            string repoRoot = Path.GetDirectoryName(projectRoot) ?? projectRoot;
            return Path.Combine(repoRoot, "builds", "macos", "W-Slice.app");
        }

        private static void LogBuildSummary(BuildReport report)
        {
            if (report == null)
                return;

            Debug.Log(
                $"Build {report.summary.result} | "
                + $"target={report.summary.platform} | "
                + $"size={report.summary.totalSize} bytes | "
                + $"time={report.summary.totalTime}");
        }
    }
}
