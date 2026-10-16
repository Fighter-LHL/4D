using System.IO;
using NUnit.Framework;
using TMPro;
using UnityEngine;
using UnityEngine.TestTools;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class CourtyardFontCoverageTests
    {
        [Test]
        [UnityPlatform(RuntimePlatform.OSXEditor)]
        public void NativeAndTMPFontsCoverChinese_AndDynamicAtlasCanReload()
        {
            Font nativeFont = null;
            TMP_FontAsset fontAsset = null;
            try
            {
                nativeFont = CourtyardFontSupport.CreateFont();
                Assert.That(CourtyardFontSupport.HasCharacters(nativeFont, CourtyardFontSupport.RequiredCharacters,
                    out string nativeMissing), Is.True, "Native UI.Text font is missing: " + nativeMissing);

                fontAsset = CourtyardFontSupport.CreateTMPFontAsset(nativeFont, out string path, out int faceIndex);
                Assert.That(fontAsset != null, Is.True);
                Assert.That(File.Exists(path), Is.True, "TMP must retain a real installed font source.");
                Assert.That(faceIndex, Is.GreaterThanOrEqualTo(0));
                // The factory already populated these glyphs. TMP returns false
                // from TryAddCharacters when there are no new glyphs to add.
                Assert.That(fontAsset.HasCharacters(CourtyardFontSupport.RequiredCharacters),
                    Is.True, "TMP must contain every required Chinese character.");

                fontAsset.ClearFontAssetData();
                Assert.That(fontAsset.TryAddCharacters(CourtyardFontSupport.RequiredCharacters, out string reloadMissing),
                    Is.True, "Dynamic atlas reload lost access to Chinese font data: " + reloadMissing);
            }
            finally
            {
                CourtyardFontSupport.ReleaseTMPFontAsset(fontAsset);
                if (nativeFont != null)
                    Object.DestroyImmediate(nativeFont);
            }
        }
    }
}
