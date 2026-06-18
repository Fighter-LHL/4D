using UnityEditor;
using UnityEngine;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Editor
{
    public static class GardenSceneBuilder
    {
        public sealed class SceneBuildResult
        {
            public Camera GameCamera { get; set; }
            public LevelRuntimeController LevelController { get; set; }
            public LevelSessionController SessionController { get; set; }
            public PlayerCharacter PlayerCharacter { get; set; }
            public MovementController Movement { get; set; }
            public LevelPlayerReset PlayerReset { get; set; }
            public PlayerInputRouter InputRouter { get; set; }
            public LevelFlowController LevelFlow { get; set; }
        }

        public static SceneBuildResult Build(LevelDefinition levelDefinition, GardenProfiles profiles)
        {
            var cameraObj = GardenEditorUtilities.FindOrCreate("Main Camera", typeof(Camera));
            cameraObj.transform.position = new Vector3(0f, 5f, -8f);
            cameraObj.transform.rotation = Quaternion.Euler(35f, 0f, 0f);

            var ground = GardenEditorUtilities.FindOrCreatePrimitive("Ground", PrimitiveType.Plane);
            ground.transform.localScale = new Vector3(GardenGrayboxRecipe.GroundScaleXZ, 1f, GardenGrayboxRecipe.GroundScaleXZ);

            var levelRuntime = GardenEditorUtilities.FindOrCreate(
                "LevelRuntime",
                typeof(LevelRuntimeController),
                typeof(LevelSessionController),
                typeof(LevelFlowController));
            var levelController = levelRuntime.GetComponent<LevelRuntimeController>();
            var sessionController = levelRuntime.GetComponent<LevelSessionController>()
                ?? levelRuntime.AddComponent<LevelSessionController>();

            var levelSo = new SerializedObject(levelController);
            levelSo.FindProperty("definition").objectReferenceValue = levelDefinition;
            levelSo.FindProperty("wSmoothing").floatValue = GardenGrayboxRecipe.WSmoothing;
            levelSo.ApplyModifiedProperties();

            var sessionSo = new SerializedObject(sessionController);
            sessionSo.FindProperty("levelController").objectReferenceValue = levelController;
            sessionSo.ApplyModifiedProperties();

            var player = GardenEditorUtilities.FindOrCreatePrimitive("Player", PrimitiveType.Capsule);
            player.transform.position = new Vector3(0f, 0f, -4f);
            var playerCharacter = player.GetComponent<PlayerCharacter>() ?? player.AddComponent<PlayerCharacter>();
            playerCharacter.CurrentNodeId = GardenGrayboxRecipe.PlayerStartNodeId;

            var movement = player.GetComponent<MovementController>() ?? player.AddComponent<MovementController>();
            var playerReset = player.GetComponent<LevelPlayerReset>() ?? player.AddComponent<LevelPlayerReset>();

            var moveSo = new SerializedObject(movement);
            moveSo.FindProperty("character").objectReferenceValue = playerCharacter;
            moveSo.FindProperty("levelController").objectReferenceValue = levelController;
            moveSo.FindProperty("moveSpeed").floatValue = GardenGrayboxRecipe.MoveSpeed;
            moveSo.FindProperty("arrivalThreshold").floatValue = GardenGrayboxRecipe.ArrivalThreshold;
            moveSo.ApplyModifiedProperties();

            var playerResetSo = new SerializedObject(playerReset);
            playerResetSo.FindProperty("character").objectReferenceValue = playerCharacter;
            playerResetSo.FindProperty("movement").objectReferenceValue = movement;
            playerResetSo.ApplyModifiedProperties();

            sessionSo = new SerializedObject(sessionController);
            sessionSo.FindProperty("objectiveSource").objectReferenceValue = playerCharacter;
            sessionSo.ApplyModifiedProperties();

            var pathPreview = GardenEditorUtilities.FindOrCreate("PathPreview", typeof(LevelPathPreviewRenderer));
            var pathPreviewSo = new SerializedObject(pathPreview.GetComponent<LevelPathPreviewRenderer>());
            pathPreviewSo.FindProperty("levelController").objectReferenceValue = levelController;
            pathPreviewSo.FindProperty("yOffset").floatValue = GardenGrayboxRecipe.PathPreviewYOffset;
            pathPreviewSo.ApplyModifiedProperties();

            BuildWorldGeometry(profiles);

            var nodesParent = GardenEditorUtilities.FindOrCreate("Nodes");
            nodesParent.transform.position = Vector3.zero;
            LevelNodeMirrorSync.SyncSceneNodeMirrors(levelDefinition, nodesParent.transform);

            var input = GardenEditorUtilities.FindOrCreate(
                "PlayerInput",
                typeof(PlayerInputRouter),
                typeof(TapMoveInput),
                typeof(LevelRestartInput));
            var inputRouter = input.GetComponent<PlayerInputRouter>();
            var restartInput = input.GetComponent<LevelRestartInput>() ?? input.AddComponent<LevelRestartInput>();

            var routerSo = new SerializedObject(inputRouter);
            routerSo.FindProperty("gameCamera").objectReferenceValue = cameraObj.GetComponent<Camera>();
            routerSo.FindProperty("groundMask").intValue = LayerMask.GetMask("Default");
            routerSo.FindProperty("levelController").objectReferenceValue = levelController;
            routerSo.FindProperty("session").objectReferenceValue = sessionController;
            routerSo.FindProperty("movement").objectReferenceValue = movement;
            routerSo.FindProperty("snapRadius").floatValue = GardenGrayboxRecipe.SnapRadius;
            routerSo.ApplyModifiedProperties();

            var restartInputSo = new SerializedObject(restartInput);
            restartInputSo.FindProperty("session").objectReferenceValue = sessionController;
            restartInputSo.ApplyModifiedProperties();

            playerResetSo = new SerializedObject(playerReset);
            playerResetSo.FindProperty("inputRouter").objectReferenceValue = inputRouter;
            playerResetSo.ApplyModifiedProperties();

            var tapMove = input.GetComponent<TapMoveInput>() ?? input.AddComponent<TapMoveInput>();
            var tapSo = new SerializedObject(tapMove);
            tapSo.FindProperty("router").objectReferenceValue = inputRouter;
            tapSo.ApplyModifiedProperties();

            var levelFlow = GrayboxLevelFlowWiring.WireLevelFlow(
                levelRuntime,
                levelController,
                sessionController,
                input,
                inputRouter,
                playerReset);

            return new SceneBuildResult
            {
                GameCamera = cameraObj.GetComponent<Camera>(),
                LevelController = levelController,
                SessionController = sessionController,
                PlayerCharacter = playerCharacter,
                Movement = movement,
                PlayerReset = playerReset,
                InputRouter = inputRouter,
                LevelFlow = levelFlow
            };
        }

        private static void BuildWorldGeometry(GardenProfiles profiles)
        {
            var wallA = GardenEditorUtilities.FindOrCreatePrimitive("GardenWall_A", PrimitiveType.Cube);
            wallA.transform.position = new Vector3(0f, 1f, 0f);
            wallA.transform.localScale = new Vector3(4f, 2f, 0.5f);
            var wallAEntity = wallA.GetComponent<SliceEntity>() ?? wallA.AddComponent<SliceEntity>();
            wallAEntity.profile = profiles.Wall;
            wallAEntity.presenter = wallA.GetComponent<ScalePresenter>() ?? wallA.AddComponent<ScalePresenter>();
            CaptureSliceBases(wallA);

            var wallGap = GardenEditorUtilities.FindOrCreatePrimitive("GardenWall_GapSegment", PrimitiveType.Cube);
            wallGap.transform.position = new Vector3(0f, 1f, -2f);
            wallGap.transform.localScale = new Vector3(1f, 2f, 0.5f);
            SetupSliceEntityWithPresenters(wallGap, profiles.Gap);

            var stairParent = GardenEditorUtilities.FindOrCreate("HiddenStair");
            stairParent.transform.position = Vector3.zero;

            CreateStairCube(stairParent.transform, "Stair_1", new Vector3(2f, 0.25f, 0f), profiles.Stair);
            CreateStairCube(stairParent.transform, "Stair_2", new Vector3(2f, 0.75f, 0.3f), profiles.Stair);
            CreateStairCube(stairParent.transform, "Stair_3", new Vector3(2f, 1.25f, 0.6f), profiles.Stair);

            var flower = GardenEditorUtilities.FindOrCreatePrimitive("Flower", PrimitiveType.Capsule);
            flower.transform.position = new Vector3(2f, 1f, 0f);
        }

        private static void CreateStairCube(Transform parent, string name, Vector3 localPosition, SliceProfile profile)
        {
            var stair = GardenEditorUtilities.FindOrCreatePrimitive(name, PrimitiveType.Cube);
            stair.transform.SetParent(parent);
            stair.transform.localPosition = localPosition;
            stair.transform.localScale = new Vector3(1f, 0.5f, 0.3f);
            SetupSliceEntityWithPresenters(stair, profile);
        }

        private static void SetupSliceEntityWithPresenters(GameObject go, SliceProfile profile)
        {
            var entity = go.GetComponent<SliceEntity>() ?? go.AddComponent<SliceEntity>();
            entity.profile = profile;
            entity.presenter = go.GetComponent<ScalePresenter>() ?? go.AddComponent<ScalePresenter>();
            if (!go.TryGetComponent<FadePresenter>(out _))
                go.AddComponent<FadePresenter>();

            CaptureSliceBases(go);
        }

        private static void CaptureSliceBases(GameObject go)
        {
            var entity = go.GetComponent<SliceEntity>();
            entity?.CaptureBasePose();

            foreach (var scalePresenter in go.GetComponents<ScalePresenter>())
                scalePresenter.CaptureBaseScale();
        }
    }
}
