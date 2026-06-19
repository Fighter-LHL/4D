using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace WSlice.Editor
{
    public static class WSliceBuildPlayer
    {
        public const string DefaultMacOutputRelative = "builds/macos/W-Slice.app";

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

            WriteBuildInfo(outputPath, scenes);
            Debug.Log($"macOS build succeeded: {outputPath}");
        }

        private static string ResolveOutputPath()
        {
            string env = Environment.GetEnvironmentVariable("WSLICE_BUILD_OUTPUT");
            if (!string.IsNullOrWhiteSpace(env))
                return env;

            string projectRoot = Path.GetDirectoryName(Application.dataPath) ?? string.Empty;
            return Path.Combine(projectRoot, DefaultMacOutputRelative);
        }

        private static void WriteBuildInfo(string outputPath, string[] enabledScenes)
        {
            string outputDirectory = Path.GetDirectoryName(outputPath);
            if (string.IsNullOrEmpty(outputDirectory))
                return;

            var info = new BuildInfoManifest
            {
                version = PlayerSettings.bundleVersion,
                productName = PlayerSettings.productName,
                unityVersion = Application.unityVersion,
                buildTimeUtc = DateTime.UtcNow.ToString("o"),
                outputPath = outputPath,
                enabledScenes = enabledScenes
            };

            string manifestPath = Path.Combine(outputDirectory, "build-info.json");
            string json = JsonUtility.ToJson(info, true);
            File.WriteAllText(manifestPath, json);
            Debug.Log($"Wrote build manifest: {manifestPath}");
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

        [Serializable]
        private class BuildInfoManifest
        {
            public string version;
            public string productName;
            public string unityVersion;
            public string buildTimeUtc;
            public string outputPath;
            public string[] enabledScenes;
        }
    }
}
