namespace WSlice.Editor
{
    public static class GrayboxGeneratePipeline
    {
        public static void FinalizeGeneratedScene()
        {
            GrayboxVisualApplier.StylizeActiveScene();
        }
    }
}
