// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as NetworkMainModule from './network-main.js';

self.NetworkMain = self.NetworkMain || {};
NetworkMain = NetworkMain || {};

/**
 * @constructor
 */
NetworkMain.NetworkMain = NetworkMainModule.NetworkMain.NetworkMainImpl;
