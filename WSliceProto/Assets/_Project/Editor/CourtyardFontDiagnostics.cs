using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TMPro;
using UnityEditor;
using UnityEngine;
using WSlice.UI;

namespace WSlice.Editor
{
    /// <summary>Verifies the installed font and all CJK characters authored in UI and level definitions.</summary>
    public static class CourtyardFontDiagnostics
    {
        public static void Validate()
        {
            string output = Environment.GetEnvironmentVariable("WSLICE_FONT_DIAGNOSTICS_OUTPUT");
            if (string.IsNullOrWhiteSpace(output))
                throw new InvalidOperationException("Set WSLICE_FONT_DIAGNOSTICS_OUTPUT to a new JSON path under this project's TestResults directory.");

            string results = Path.GetFullPath(Path.Combine(Application.dataPath, "../TestResults"));
            output = Path.GetFullPath(output);
            if (!output.StartsWith(results + Path.DirectorySeparatorChar, StringComparison.Ordinal) || File.Exists(output))
                throw new InvalidOperationException("Font diagnostics output must be a new file under " + results);

            var report = new FontReport { unityVersion = Application.unityVersion, startedUtc = DateTime.UtcNow.ToString("o") };
            Font font = null;
            TMP_FontAsset asset = null;
            try
            {
                string characters = RequiredProjectCharacters();
                report.checkedCharacterCount = characters.Length;
                font = CourtyardFontSupport.CreateFont();
                report.nativeFontNames = font.fontNames;
                report.nativeCoveragePassed = CourtyardFontSupport.HasCharacters(font, characters, out report.nativeMissingCharacters);
                asset = CourtyardFontSupport.CreateTMPFontAsset(font, out report.sourcePath, out report.faceIndex);
                report.family = asset.faceInfo.familyName;
                report.style = asset.faceInfo.styleName;
                report.atlasPopulationMode = asset.atlasPopulationMode.ToString();
                report.tmpCoveragePassed = asset.TryAddCharacters(characters, out report.tmpMissingCharacters);
                // Dynamic fonts must also recover after atlas data is cleared.
                asset.ClearFontAssetData();
                report.reloadCoveragePassed = asset.TryAddCharacters(characters, out report.reloadMissingCharacters);
                report.status = report.nativeCoveragePassed && report.tmpCoveragePassed && report.reloadCoveragePassed
                    ? "passed" : "failed";
            }
            catch (Exception exception)
            {
                report.error = exception.ToString();
            }
            finally
            {
                CourtyardFontSupport.ReleaseTMPFontAsset(asset);
                if (font != null)
                    UnityEngine.Object.DestroyImmediate(font);
                report.finishedUtc = DateTime.UtcNow.ToString("o");
                Directory.CreateDirectory(Path.GetDirectoryName(output));
                using (var stream = new FileStream(output, FileMode.CreateNew, FileAccess.Write))
                using (var writer = new StreamWriter(stream))
                    writer.Write(JsonUtility.ToJson(report, true));
            }

            Debug.Log($"Courtyard font diagnostics {report.status}: {output}; {report.family}/{report.style}; characters={report.checkedCharacterCount}");
            if (Application.isBatchMode)
                EditorApplication.Exit(report.status == "passed" ? 0 : 1);
            else if (report.status != "passed")
                throw new InvalidOperationException("Courtyard font coverage failed; inspect " + output);
        }

        private static string RequiredProjectCharacters()
        {
            var characters = new HashSet<char>(CourtyardFontSupport.RequiredCharacters);
            foreach (string directory in new[] { "_Project/UI", "_Project/Level/Definitions" })
            {
                string extension = directory.EndsWith("UI", StringComparison.Ordinal) ? "*.cs" : "*.asset";
                foreach (string file in Directory.GetFiles(Path.Combine(Application.dataPath, directory), extension))
                {
                    foreach (char character in File.ReadAllText(file))
                    {
                        if (character >= '\u2e80' && character <= '\u9fff'
                            || character >= '\uf900' && character <= '\ufaff'
                            || character >= '\uff00' && character <= '\uffef')
                            characters.Add(character);
                    }
                }
            }
            return new string(characters.OrderBy(character => character).ToArray());
        }

        [Serializable]
        private sealed class FontReport
        {
            public int schemaVersion = 1;
            public string status = "failed";
            public string unityVersion;
            public string startedUtc;
            public string finishedUtc;
            public string[] nativeFontNames;
            public string sourcePath;
            public int faceIndex;
            public string family;
            public string style;
            public string atlasPopulationMode;
            public int checkedCharacterCount;
            public bool nativeCoveragePassed;
            public string nativeMissingCharacters;
            public bool tmpCoveragePassed;
            public string tmpMissingCharacters;
            public bool reloadCoveragePassed;
            public string reloadMissingCharacters;
            public string error;
        }
    }
}
