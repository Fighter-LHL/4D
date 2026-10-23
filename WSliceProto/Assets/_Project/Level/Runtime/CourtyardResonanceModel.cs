using System;
using System.Collections.Generic;

namespace WSlice.Level
{
    /// <summary>
    /// Optional rewards for completed slice crossings. The movement layer remains
    /// responsible for route validity, arrival and returning to a safe landing.
    /// </summary>
    public sealed class CourtyardResonanceModel
    {
        public const float DangerBandFraction = 0.2f;
        public const float ChargeSeconds = 0.3f;
        public const float CollapseSeconds = 0.85f;
        public const float StabilityRecoveryPerSecond = 1.5f;
        public const int MaximumRiskChain = 3;

        private const double ThresholdTolerance = 0.000001d;
        private readonly HashSet<(string from, string to)> carriedClaims = new();
        private readonly HashSet<(string from, string to)> bankedClaims = new();
        private double stability = 1d;
        private double dangerousSeconds;
        private bool collapsed;

        public int Carried { get; private set; }
        public int Banked { get; private set; }
        public int RiskChain { get; private set; }
        public int BestRiskChain { get; private set; }
        public int SecuredRiskChain { get; private set; }
        public float Stability => (float)stability;
        public float Charge01 => (float)Math.Min(1d, dangerousSeconds / ChargeSeconds);
        public bool IsCrossing { get; private set; }
        public bool IsCharged => dangerousSeconds + ThresholdTolerance >= ChargeSeconds;
        public bool IsDangerous { get; private set; }
        public string ActiveFrom { get; private set; } = string.Empty;
        public string ActiveTo { get; private set; } = string.Empty;

        /// <summary>True when this directed crossing already owns a carried or banked reward.</summary>
        public bool HasReward(string from, string to) =>
            carriedClaims.Contains((from, to)) || bankedClaims.Contains((from, to));

        public bool BeginCrossing(string from, string to)
        {
            // Polling or repeated clicks must never refill an active stability ring.
            if (IsCrossing || !IsSliceEdge(from, to))
                return false;

            ClearCrossing();
            ActiveFrom = from;
            ActiveTo = to;
            IsCrossing = true;
            return true;
        }

        /// <summary>
        /// Advances only the active crossing using actual W, and returns true when
        /// movement must recover. A collapse stays latched until FailCrossing/Reset.
        /// </summary>
        public bool Tick(float deltaSeconds, float w)
        {
            if (float.IsNaN(deltaSeconds) || float.IsInfinity(deltaSeconds) || deltaSeconds < 0f)
                throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
            if (!IsCrossing)
                return false;
            if (collapsed)
                return true;

            GetRange(ActiveFrom, ActiveTo, out float min, out float max);
            if (float.IsNaN(w) || float.IsInfinity(w) || w < min || w > max)
            {
                IsDangerous = true;
                stability = 0d;
                collapsed = true;
                return true;
            }

            double band = (max - min) * DangerBandFraction;
            IsDangerous = w <= min + band + ThresholdTolerance
                || w >= max - band - ThresholdTolerance;
            if (IsDangerous)
            {
                dangerousSeconds += deltaSeconds;
                stability = Math.Max(0d, stability - deltaSeconds / (double)CollapseSeconds);
                if (stability <= ThresholdTolerance)
                {
                    stability = 0d;
                    collapsed = true;
                }
            }
            else
            {
                stability = Math.Min(1d, stability + deltaSeconds * (double)StabilityRecoveryPerSecond);
            }
            return collapsed;
        }

        public int CompleteCrossing()
        {
            if (!IsCrossing || collapsed)
                return 0;

            int reward = 0;
            if (!HasReward(ActiveFrom, ActiveTo))
            {
                reward = IsCharged ? 3 : 1;
                carriedClaims.Add((ActiveFrom, ActiveTo));
                Carried += reward;
                // Only a newly earned risky crossing advances the spectacle.
                // Safe travel preserves progress; repeated directions cannot farm it.
                if (reward == 3)
                {
                    RiskChain = Math.Min(MaximumRiskChain, RiskChain + 1);
                    BestRiskChain = Math.Max(BestRiskChain, RiskChain);
                }
            }
            ClearCrossing();
            return reward;
        }

        public int FailCrossing()
        {
            int lost = Carried;
            Carried = 0;
            carriedClaims.Clear();
            RiskChain = 0;
            ClearCrossing();
            return lost;
        }

        public int Bank()
        {
            int deposited = Carried;
            if (deposited > 0) SecuredRiskChain = Math.Max(SecuredRiskChain, RiskChain);
            Banked += deposited;
            Carried = 0;
            bankedClaims.UnionWith(carriedClaims);
            carriedClaims.Clear();
            return deposited;
        }

        public void Reset()
        {
            Carried = 0;
            Banked = 0;
            RiskChain = BestRiskChain = SecuredRiskChain = 0;
            carriedClaims.Clear();
            bankedClaims.Clear();
            ClearCrossing();
        }

        public static bool IsSliceEdge(string from, string to) => GetRange(from, to, out _, out _);

        public static bool GetRange(string from, string to, out float min, out float max)
        {
            // Keep the authored ranges as the source of truth without using Unity math.
            if (Matches(from, to, CourtyardLayout.Entry, CourtyardLayout.Courtyard))
            {
                min = CourtyardLayout.EntranceRange.Min;
                max = CourtyardLayout.EntranceRange.Max;
                return true;
            }
            if (Matches(from, to, CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding))
            {
                min = CourtyardLayout.StairRange.Min;
                max = CourtyardLayout.StairRange.Max;
                return true;
            }
            if (Matches(from, to, CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding))
            {
                min = CourtyardLayout.BridgeRange.Min;
                max = CourtyardLayout.BridgeRange.Max;
                return true;
            }
            min = max = 0f;
            return false;
        }

        private static bool Matches(string from, string to, string first, string second) =>
            (from == first && to == second) || (from == second && to == first);

        private void ClearCrossing()
        {
            IsCrossing = false;
            IsDangerous = false;
            ActiveFrom = string.Empty;
            ActiveTo = string.Empty;
            stability = 1d;
            dangerousSeconds = 0d;
            collapsed = false;
        }
    }
}
