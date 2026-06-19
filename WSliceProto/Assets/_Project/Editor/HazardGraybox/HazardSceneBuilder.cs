using UnityEditor;
using UnityEngine;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Editor
{
    public static class HazardSceneBuilder
    {
        public static GardenSceneBuilder.SceneBuildResult Build(LevelDefinition levelDefinition, SliceProfile platformProfile)
        {
            var cameraObj = GardenEditorUtilities.FindOrCreate("Main Camera", typeof(Camera));
            cameraObj.transform.position = new Vector3(3f, 5f, -7f);
            cameraObj.transform.rotation = Quaternion.Euler(35f, 0f, 0f);

            var ground = GardenEditorUtilities.FindOrCreatePrimitive("Ground", PrimitiveType.Plane);
            ground.transform.localScale = new Vector3(HazardGrayboxRecipe.GroundScaleXZ, 1f, HazardGrayboxRecipe.GroundScaleXZ);

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
            levelSo.FindProperty("wSmoothing").floatValue = GrayboxLevelRecipe.WSmoothing;
            levelSo.ApplyModifiedProperties();

            var sessionSo = new SerializedObject(sessionController);
            sessionSo.FindProperty("levelController").objectReferenceValue = levelController;
            sessionSo.ApplyModifiedProperties();

            var player = GardenEditorUtilities.FindOrCreatePrimitive("Player", PrimitiveType.Capsule);
            player.transform.position = HazardGrayboxRecipe.PlayerStartPosition;
            var playerCharacter = player.GetComponent<PlayerCharacter>() ?? player.AddComponent<PlayerCharacter>();
            playerCharacter.CurrentNodeId = HazardGrayboxRecipe.PlayerStartNodeId;

            var movement = player.GetComponent<MovementController>() ?? player.AddComponent<MovementController>();
            var playerReset = player.GetComponent<LevelPlayerReset>() ?? player.AddComponent<LevelPlayerReset>();

            var moveSo = new SerializedObject(movement);
            moveSo.FindProperty("character").objectReferenceValue = playerCharacter;
            moveSo.FindProperty("levelController").objectReferenceValue = levelController;
            moveSo.FindProperty("moveSpeed").floatValue = GrayboxLevelRecipe.MoveSpeed;
            moveSo.FindProperty("arrivalThreshold").floatValue = GrayboxLevelRecipe.ArrivalThreshold;
            moveSo.FindProperty("failSessionOnSegmentBreak").boolValue = true;
            moveSo.FindProperty("session").objectReferenceValue = sessionController;
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
            pathPreviewSo.FindProperty("yOffset").floatValue = GrayboxLevelRecipe.PathPreviewYOffset;
            pathPreviewSo.ApplyModifiedProperties();

            BuildWorldGeometry(platformProfile);

            var nodesParent = GardenEditorUtilities.FindOrCreate("Nodes");
            nodesParent.transform.position = Vector3.zero;
            LevelNodeMirrorSync.SyncSceneNodeMirrors(levelDefinition, nodesParent.transform);

            var input = GardenEditorUtilities.FindOrCreate(
                "PlayerInput",
                typeof(PlayerInputRouter),
                typeof(TapMoveInput),
                typeof(LevelRestartInput),
                typeof(LevelNextInput));
            var inputRouter = input.GetComponent<PlayerInputRouter>();
            var restartInput = input.GetComponent<LevelRestartInput>() ?? input.AddComponent<LevelRestartInput>();

            var routerSo = new SerializedObject(inputRouter);
            routerSo.FindProperty("gameCamera").objectReferenceValue = cameraObj.GetComponent<Camera>();
            routerSo.FindProperty("groundMask").intValue = LayerMask.GetMask("Default");
            routerSo.FindProperty("levelController").objectReferenceValue = levelController;
            routerSo.FindProperty("session").objectReferenceValue = sessionController;
            routerSo.FindProperty("movement").objectReferenceValue = movement;
            routerSo.FindProperty("snapRadius").floatValue = GrayboxLevelRecipe.SnapRadius;
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

            GrayboxGraphMutationWiring.Wire(levelRuntime, levelController);
            GrayboxTutorialWiring.Wire(levelRuntime, levelController, sessionController, movement);

            return new GardenSceneBuilder.SceneBuildResult
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

        private static void BuildWorldGeometry(SliceProfile platformProfile)
        {
            var westPillar = GardenEditorUtilities.FindOrCreatePrimitive("WestPillar", PrimitiveType.Cube);
            westPillar.transform.position = new Vector3(0f, 0.5f, 0f);
            westPillar.transform.localScale = new Vector3(1.5f, 1f, 1.5f);

            var eastPillar = GardenEditorUtilities.FindOrCreatePrimitive("EastPillar", PrimitiveType.Cube);
            eastPillar.transform.position = new Vector3(6f, 0.5f, 0f);
            eastPillar.transform.localScale = new Vector3(1.5f, 1f, 1.5f);

            var goalMarker = GardenEditorUtilities.FindOrCreatePrimitive("GoalMarker", PrimitiveType.Cylinder);
            goalMarker.transform.position = new Vector3(6f, 0.75f, 0f);
            goalMarker.transform.localScale = new Vector3(0.6f, 0.75f, 0.6f);

            var hazardZone = GardenEditorUtilities.FindOrCreatePrimitive("HazardZoneMarker", PrimitiveType.Cube);
            hazardZone.transform.position = new Vector3(3f, 0.15f, 0f);
            hazardZone.transform.localScale = new Vector3(3f, 0.1f, 2.2f);

            var platform = GardenEditorUtilities.FindOrCreatePrimitive("HazardPlatform", PrimitiveType.Cube);
            platform.transform.position = HazardGrayboxRecipe.PlatformBasePosition;
            platform.transform.localScale = new Vector3(3f, 0.4f, 2f);

            var platformEntity = platform.GetComponent<SliceEntity>() ?? platform.AddComponent<SliceEntity>();
            platformEntity.profile = platformProfile;
            platformEntity.presenter = platform.GetComponent<ScalePresenter>() ?? platform.AddComponent<ScalePresenter>();
            if (!platform.TryGetComponent<FadePresenter>(out _))
                platform.AddComponent<FadePresenter>();

            platformEntity.CaptureBasePose();
            foreach (var scalePresenter in platform.GetComponents<ScalePresenter>())
                scalePresenter.CaptureBaseScale();
        }
    }
}
