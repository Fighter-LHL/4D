Shader "WSlice/SliceReveal"
{
    Properties
    {
        _BaseColor("Base Color", Color) = (1, 1, 1, 1)
        _Alpha("Alpha", Float) = 1.0
        _ObjectWCenter("Object W Center", Float) = 0.5
        _ObjectWThickness("Object W Thickness", Float) = 0.05
        _RevealSoftness("Reveal Softness", Float) = 0.02
        _EdgeGlow("Edge Glow", Color) = (0.5, 0.8, 1, 1)
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Transparent"
            "Queue" = "Transparent"
            "RenderPipeline" = "UniversalPipeline"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Back

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            float _GlobalW;

            struct Attributes
            {
                float4 positionOS : POSITION;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float _Alpha;
                float _ObjectWCenter;
                float _ObjectWThickness;
                float _RevealSoftness;
                float4 _EdgeGlow;
            CBUFFER_END

            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                return output;
            }

            float4 frag(Varyings input) : SV_Target
            {
                float distanceToCenter = abs(_GlobalW - _ObjectWCenter);
                float visibility = smoothstep(
                    _ObjectWThickness + _RevealSoftness,
                    _ObjectWThickness,
                    distanceToCenter);

                float edgeStrength = saturate(1.0 - visibility) * _EdgeGlow.a;
                float3 finalColor = lerp(_BaseColor.rgb, _EdgeGlow.rgb, edgeStrength);
                float finalAlpha = _BaseColor.a * _Alpha * visibility + edgeStrength;

                return float4(finalColor, finalAlpha);
            }
            ENDHLSL
        }
    }

    FallBack "Hidden/InternalErrorShader"
}
