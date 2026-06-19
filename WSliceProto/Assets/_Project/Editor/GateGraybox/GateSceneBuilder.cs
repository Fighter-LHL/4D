using UnityEditor;
using UnityEngine;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Editor
{
    public static class GateSceneBuilder
    {
        public static GardenSceneBuilder.SceneBuildResult Build(LevelDefinition levelDefinition, SliceProfile leverProfile)
        {
            var cameraObj = GardenEditorUtilities.FindOrCreate("Main Camera", typeof(Camera));
            cameraObj.transform.position = new Vector3(5f, 5f, -8f);
            cameraObj.transform.rotation = Quaternion.Euler(35f, 0f, 0f);

            var ground = GardenEditorUtilities.FindOrCreatePrimitive("Ground", PrimitiveType.Plane);
            ground.transform.localScale = new Vector3(GateGrayboxRecipe.GroundScaleXZ, 1f, GateGrayboxRecipe.GroundScaleXZ);

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
            player.transform.position = GateGrayboxRecipe.PlayerStartPosition;
            var playerCharacter = player.GetComponent<PlayerCharacter>() ?? player.AddComponent<PlayerCharacter>();
            playerCharacter.CurrentNodeId = GateGrayboxRecipe.PlayerStartNodeId;

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

            BuildWorldGeometry(leverProfile, levelController);

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

        private static void BuildWorldGeometry(SliceProfile leverProfile, LevelRuntimeController levelController)
        {
            var mutationController = GrayboxGraphMutationWiring.Wire(
                levelController.gameObject,
                levelController);

            var entryMarker = GardenEditorUtilities.FindOrCreatePrimitive("EntryMarker", PrimitiveType.Cube);
            entryMarker.transform.position = new Vector3(0f, 0.5f, 0f);
            entryMarker.transform.localScale = new Vector3(1.5f, 1f, 1.5f);

            var gateFrame = GardenEditorUtilities.FindOrCreatePrimitive("GateFrame", PrimitiveType.Cube);
            gateFrame.transform.position = new Vector3(5f, 1.25f, 0f);
            gateFrame.transform.localScale = new Vector3(0.5f, 2.5f, 3f);

            var goalMarker = GardenEditorUtilities.FindOrCreatePrimitive("GoalMarker", PrimitiveType.Cylinder);
            goalMarker.transform.position = new Vector3(10f, 0.75f, 0f);
            goalMarker.transform.localScale = new Vector3(0.6f, 0.75f, 0.6f);

            var lever = GardenEditorUtilities.FindOrCreatePrimitive("GateLever", PrimitiveType.Cube);
            lever.transform.position = GateGrayboxRecipe.LeverPosition;
            lever.transform.localScale = new Vector3(0.35f, 0.8f, 0.35f);

            var leverEntity = lever.GetComponent<SliceEntity>() ?? lever.AddComponent<SliceEntity>();
            leverEntity.profile = leverProfile;
            leverEntity.presenter = lever.GetComponent<ScalePresenter>() ?? lever.AddComponent<ScalePresenter>();
            if (!lever.TryGetComponent<FadePresenter>(out _))
                lever.AddComponent<FadePresenter>();
            leverEntity.CaptureBasePose();
            foreach (var scalePresenter in lever.GetComponents<ScalePresenter>())
                scalePresenter.CaptureBaseScale();

            var gateLever = lever.GetComponent<GateLeverInteractable>() ?? lever.AddComponent<GateLeverInteractable>();
            var leverSo = new SerializedObject(gateLever);
            leverSo.FindProperty("sliceEntity").objectReferenceValue = leverEntity;
            leverSo.FindProperty("levelController").objectReferenceValue = levelController;
            leverSo.FindProperty("mutationController").objectReferenceValue = mutationController;
            leverSo.FindProperty("leverVisual").objectReferenceValue = lever.transform;

            var profile = leverSo.FindProperty("interactableProfile");
            profile.FindPropertyRelative("DisplayName").stringValue = "Lever";
            var unlockAction = profile.FindPropertyRelative("UnlockAction");
            unlockAction.FindPropertyRelative("FromNodeId").stringValue = "GateRoom";
            unlockAction.FindPropertyRelative("ToNodeId").stringValue = "Goal";
            unlockAction.FindPropertyRelative("WalkableRange").FindPropertyRelative("Min").floatValue = 0.30f;
            unlockAction.FindPropertyRelative("WalkableRange").FindPropertyRelative("Max").floatValue = 0.55f;
            leverSo.ApplyModifiedProperties();
        }
    }
}
