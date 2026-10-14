using System.Collections.Generic;

namespace WSlice.UI
{
    public static class WDialTrackModel
    {
        public static WDialTrackState Build(HUDState hud, bool showDeveloperSolutionOracle = false)
        {
            if (hud == null)
                return new WDialTrackState(0f, 0f, new List<float>().AsReadOnly(), new List<WDialEdgeBand>().AsReadOnly(), false);

            var ticks = showDeveloperSolutionOracle
                ? new List<float>(hud.SnapPoints)
                : new List<float>();
            var bands = new List<WDialEdgeBand>();

            if (showDeveloperSolutionOracle)
            {
                foreach (var edge in hud.EdgePreviews)
                {
                    bands.Add(new WDialEdgeBand(
                        $"{edge.FromNodeId}->{edge.ToNodeId}",
                        edge.MinW,
                        edge.MaxW,
                        edge.AvailableAtCurrentW,
                        edge.AvailableAtTargetW));
                }
            }

            return new WDialTrackState(
                hud.CurrentW,
                hud.TargetW,
                ticks.AsReadOnly(),
                bands.AsReadOnly(),
                showDeveloperSolutionOracle && hud.ActiveMoveWillBreakAtTargetW);
        }
    }
}
