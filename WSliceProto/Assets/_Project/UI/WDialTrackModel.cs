using System.Collections.Generic;

namespace WSlice.UI
{
    public static class WDialTrackModel
    {
        public static WDialTrackState Build(HUDState hud)
        {
            if (hud == null)
                return new WDialTrackState(0f, 0f, new List<float>().AsReadOnly(), new List<WDialEdgeBand>().AsReadOnly(), false);

            var ticks = new List<float>(hud.SnapPoints);
            var bands = new List<WDialEdgeBand>();

            foreach (var edge in hud.EdgePreviews)
            {
                bands.Add(new WDialEdgeBand(
                    $"{edge.FromNodeId}->{edge.ToNodeId}",
                    edge.MinW,
                    edge.MaxW,
                    edge.AvailableAtCurrentW,
                    edge.AvailableAtTargetW));
            }

            return new WDialTrackState(
                hud.CurrentW,
                hud.TargetW,
                ticks.AsReadOnly(),
                bands.AsReadOnly(),
                hud.ActiveMoveWillBreakAtTargetW);
        }
    }
}
