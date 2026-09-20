using System;
using System.IO;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;

namespace WSlice.UI
{
    /// <summary>Loads installed fonts, with verified Chinese coverage on the macOS demo target.</summary>
    public static class CourtyardFontSupport
    {
        public const string RequiredCharacters =
            "开始：回响庭院。观察空间，切换切片，让机关留下结果。" +
            "提示更多启动关卡选择你走出了路径已改变再试一次机制练习" +
            "封闭花园偏移平台连环密室危险平台";

        private static readonly string[] NativeFontNames =
        {
            "Hiragino Sans GB W3", "Hiragino Sans GB", "Heiti SC", "PingFang SC"
        };

        private static readonly string[] MacFontPaths =
        {
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/STHeiti Medium.ttc"
        };

        private static readonly int[] MacFontFaceIndices = { 0, 1, 1 };

        private static bool IsMacOS => Application.platform == RuntimePlatform.OSXEditor ||
                                       Application.platform == RuntimePlatform.OSXPlayer;

        public static Font CreateFont()
        {
            // Keep other editor/test platforms usable without macOS font files.
            // Chinese visual acceptance remains specific to the macOS demo.
            if (!IsMacOS)
                return Font.CreateDynamicFontFromOSFont(new[]
                {
                    "Microsoft YaHei", "Noto Sans CJK SC", "DejaVu Sans", "Liberation Sans", "Arial"
                }, 24);

            foreach (string family in NativeFontNames)
            {
                var font = Font.CreateDynamicFontFromOSFont(family, 24);
                if (HasCharacters(font, RequiredCharacters, out _))
                    return font;
                ReleaseObject(font);
            }
            throw new InvalidOperationException("No installed Chinese font covers the courtyard UI. Run CourtyardFontDiagnostics.Validate.");
        }

        public static TMP_FontAsset CreateTMPFontAsset(Font font) => CreateTMPFontAsset(font, out _, out _);

        public static TMP_FontAsset CreateTMPFontAsset(Font font, out string sourcePath, out int faceIndex)
        {
            sourcePath = string.Empty;
            faceIndex = -1;
            if (font == null)
                return null;

            if (!IsMacOS)
            {
                foreach (string family in font.fontNames)
                {
                    var asset = TMP_FontAsset.CreateFontAsset(family, "Regular", 48);
                    if (asset != null)
                        return asset;
                }
                return null;
            }

            // macOS TTC faces use styles such as W3, Light and Medium. A guessed
            // family/Regular lookup can fail and silently select a Latin font.
            // This TMP overload retains the actual source file path for later
            // dynamic atlas reloads; it does not redistribute the system font.
            for (int index = 0; index < MacFontPaths.Length; index++)
            {
                string path = MacFontPaths[index];
                if (!File.Exists(path))
                    continue;
                var asset = TMP_FontAsset.CreateFontAsset(path, MacFontFaceIndices[index], 48, 5,
                    GlyphRenderMode.SDFAA, 1024, 1024);
                if (asset != null && asset.TryAddCharacters(RequiredCharacters, out _))
                {
                    sourcePath = path;
                    faceIndex = MacFontFaceIndices[index];
                    return asset;
                }
                ReleaseTMPFontAsset(asset);
            }
            throw new InvalidOperationException("No installed macOS font file covers the courtyard Chinese UI. Run CourtyardFontDiagnostics.Validate.");
        }

        public static bool HasCharacters(Font font, string characters, out string missingCharacters)
        {
            var missing = new StringBuilder();
            foreach (char character in characters)
            {
                if (font == null || !font.HasCharacter(character))
                    missing.Append(character);
            }
            missingCharacters = missing.ToString();
            return missing.Length == 0;
        }

        public static void ReleaseTMPFontAsset(TMP_FontAsset asset)
        {
            if (asset == null)
                return;
            ReleaseObject(asset.material);
            foreach (var texture in asset.atlasTextures)
                ReleaseObject(texture);
            ReleaseObject(asset);
        }

        private static void ReleaseObject(UnityEngine.Object value)
        {
            if (value == null)
                return;
            if (Application.isPlaying)
                UnityEngine.Object.Destroy(value);
            else
                UnityEngine.Object.DestroyImmediate(value);
        }
    }
}
