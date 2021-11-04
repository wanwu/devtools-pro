// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Common.Runnable}
 */
export class NetworkMainImpl extends Common.Object {
    /**
     * @override
     */
    async run() {
        // Host.userMetrics.actionTaken(Host.UserMetrics.Action.ConnectToNodeJSDirectly);
        await SDK.initMainConnection(() => {
            const target = SDK.targetManager.createTarget('main', ls`Main`, SDK.Target.Type.Network, null);
            target.runtimeAgent().runIfWaitingForDebugger();
            window.t = target;
        }, Components.TargetDetachedDialog.webSocketConnectionLost);
        UI.viewManager.showView('network');
    }
}
