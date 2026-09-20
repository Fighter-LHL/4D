using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace WSlice.Editor
{
    // A single non-generating entry point for local and GameCI validation.
    // Legacy validators sometimes only log errors, so exit code alone is insufficient.
    public static class WSliceValidationRunner
    {
        [Serializable]
        private sealed class Receipt
        {
            public int schemaVersion = 1;
            public string status = "failed";
            public string startedUtc;
            public string finishedUtc;
            public int errorCount;
            public int warningCount;
            public List<string> validatedScopes = new();
        }

        public static void ValidateAll()
        {
            var receipt = new Receipt { startedUtc = DateTime.UtcNow.ToString("o") };
            string output = ReadOutputPath();
            Application.LogCallback capture = (message, stackTrace, type) =>
            {
                if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
                    receipt.errorCount++;
                else if (type == LogType.Warning)
                    receipt.warningCount++;
            };
            Application.logMessageReceived += capture;
            try
            {
                Validate("Garden", GardenGrayboxGenerator.Validate, receipt);
                Validate("Platform", PlatformGrayboxGenerator.Validate, receipt);
                Validate("Gate", GateGrayboxGenerator.Validate, receipt);
                Validate("Chambers", ChambersGrayboxGenerator.Validate, receipt);
                Validate("Hazard", HazardGrayboxGenerator.Validate, receipt);
                Validate("Courtyard", CourtyardSliceGenerator.Validate, receipt);
                // Menu variant reports errors without exiting before the receipt is saved.
                Validate("Catalog", LevelCatalogValidatorRunner.ValidateMenu, receipt);
            }
            finally
            {
                Application.logMessageReceived -= capture;
                receipt.finishedUtc = DateTime.UtcNow.ToString("o");
                receipt.status = receipt.errorCount == 0 && receipt.validatedScopes.Count == 7
                    ? "passed" : "failed";
                Directory.CreateDirectory(Path.GetDirectoryName(output));
                File.WriteAllText(output, JsonUtility.ToJson(receipt, true));
            }

            if (receipt.status != "passed")
                throw new InvalidOperationException($"W-Slice validation failed: {receipt.errorCount} error(s). Receipt: {output}");

            Debug.Log($"W-Slice validation completed: {receipt.validatedScopes.Count} scopes; receipt: {output}");
        }

        private static void Validate(string scope, Action action, Receipt receipt)
        {
            int before = receipt.errorCount;
            try
            {
                action();
                if (receipt.errorCount == before)
                    receipt.validatedScopes.Add(scope);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
            }
        }

        private static string ReadOutputPath()
        {
            string[] arguments = Environment.GetCommandLineArgs();
            for (int i = 0; i < arguments.Length - 1; i++)
            {
                if (arguments[i] != "-wsliceValidationReport") continue;
                string path = arguments[i + 1];
                return Path.IsPathRooted(path) ? path : Path.GetFullPath(
                    Path.Combine(Application.dataPath, "..", path));
            }
            throw new ArgumentException("Missing -wsliceValidationReport; use scripts/validate-local.sh.");
        }
    }
}
