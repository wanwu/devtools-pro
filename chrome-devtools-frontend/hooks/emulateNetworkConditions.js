SDK.targetManager.addModelListener(
  SDK.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextCreated, () => {
    SDK.multitargetNetworkManager.setNetworkConditions(SDK.multitargetNetworkManager.networkConditions());
  });
