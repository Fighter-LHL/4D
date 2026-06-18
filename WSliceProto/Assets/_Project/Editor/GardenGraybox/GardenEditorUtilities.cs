using System;
using UnityEditor;
using UnityEngine;

namespace WSlice.Editor
{
    public static class GardenEditorUtilities
    {
        public static GameObject FindOrCreate(string name, params Type[] components)
        {
            var go = GameObject.Find(name);
            if (go == null)
            {
                go = new GameObject(name, components);
                Undo.RegisterCreatedObjectUndo(go, "Create " + name);
            }
            else
            {
                foreach (var type in components)
                {
                    if (type != null && !go.TryGetComponent(type, out _))
                        Undo.AddComponent(go, type);
                }
            }

            return go;
        }

        public static GameObject FindOrCreatePrimitive(string name, PrimitiveType type)
        {
            var go = GameObject.Find(name);
            if (go == null)
            {
                go = GameObject.CreatePrimitive(type);
                go.name = name;
                Undo.RegisterCreatedObjectUndo(go, "Create " + name);
            }

            return go;
        }

        public static bool IsConstant(AnimationCurve curve, float value)
        {
            if (curve == null || curve.length == 0) return false;

            foreach (var key in curve.keys)
            {
                if (!Mathf.Approximately(key.value, value))
                    return false;
            }

            return true;
        }
    }
}
